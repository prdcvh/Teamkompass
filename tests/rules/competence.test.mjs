// Emulator-Tests: Entwicklungsraster (SCRUM-266, docs/bewertungsmodell.md §5, §7, §9).
// - teams/{team}/players/{id}/competenceObservations/{obs}: lesen nur Trainer; anlegen nur Trainer, eigenes Konto,
//   bestehender Spieler, nur erlaubte Felder und Werte, nicht bei widerrufener Einwilligung; aendern nie; loeschen Trainer.
// - teams/{team}/competenceConfigs/v{n}: lesen nur Trainer; anlegen nur Trainer, eigenes Konto, ID = "v" + Version,
//   gueltige Bereiche/Gewichte; aendern und loeschen nie.
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

const TEAM = "U17";
const OTHER = "U15";
const CLUB = "club-koenigstein";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-competence",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const members = {
  coach: { role: "trainer" },
  medic: { role: "physio" },
  scout: { role: "scout" },
  pl1: { role: "player", playerId: "p1", expiresAt: null },
  parent1: { role: "parent", playerId: "p1", expiresAt: null }
};
const observation = (playerId, change = {}) => ({
  playerId,
  framework: "raster-1",
  criterionId: "tactics.scanning",
  value: 3,
  date: "2026-11-20",
  occasion: "training",
  eventId: null,
  position: null,
  source: "trainer",
  note: "",
  by: "Trainer Test",
  byUid: "coach",
  createdAt: "2026-11-20T19:00:00.000Z",
  ...change
});
const config = (version, change = {}) => ({
  version,
  framework: "raster-1",
  domains: ["technique", "tactics", "physical", "psychological", "social"],
  weightProfile: "balanced",
  weights: { technique: 20, tactics: 20, physical: 20, psychological: 20, social: 20 },
  indexEnabled: true,
  createdAt: "2026-11-20T19:00:00.000Z",
  by: "Trainer Test",
  byUid: "coach",
  ...change
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `clubs/${CLUB}/admins/clubadmin`), { role: "admin" });
    await setDoc(doc(db, `teams/${TEAM}`), { clubId: CLUB, name: "Team", label: "U17", hasTrainer: true });
    await setDoc(doc(db, `teams/${OTHER}/members/otherCoach`), { role: "trainer" });
    await setDoc(doc(db, `teams/${TEAM}/members/expired`), { role: "trainer", expiresAt: new Date("2020-01-01") });
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, `teams/${TEAM}/members/${uid}`), data);
    await setDoc(doc(db, `teams/${TEAM}/players/p1`), { name: "p1", number: 1, status: "Fit", consentStatus: "pending" });
    await setDoc(doc(db, `teams/${TEAM}/players/p2`), { name: "p2", number: 2, status: "Fit", consentStatus: "revoked" });
    await setDoc(doc(db, `teams/${TEAM}/players/p1/competenceObservations/old`), observation("p1"));
    await setDoc(doc(db, `teams/${TEAM}/competenceConfigs/v1`), config(1));
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const obsPath = (playerId, id = "o1") => `teams/${TEAM}/players/${playerId}/competenceObservations/${id}`;

test("Beobachtungen lesen: nur Trainer", async () => {
  await assertSucceeds(getDoc(doc(as("coach"), obsPath("p1", "old"))));
  await assertSucceeds(getDocs(collection(as("coach"), `teams/${TEAM}/players/p1/competenceObservations`)));
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "otherCoach", "expired", "stranger"]) {
    await assertFails(getDoc(doc(as(uid), obsPath("p1", "old"))));
    await assertFails(getDocs(collection(as(uid), `teams/${TEAM}/players/p1/competenceObservations`)));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), obsPath("p1", "old"))));
});

test("Beobachtung anlegen: Trainer mit gültigen Angaben (auch mit Termin, Position, Notiz)", async () => {
  await assertSucceeds(setDoc(doc(as("coach"), obsPath("p1")), observation("p1")));
  await assertSucceeds(setDoc(doc(as("coach"), obsPath("p1", "o2")), observation("p1", { eventId: "e1", position: "ZM", note: "Schulterblick", occasion: "match", value: 4 })));
});

test("Beobachtung anlegen: andere Rollen, fremdes Konto, fehlender Spieler, Widerruf abgelehnt", async () => {
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "otherCoach", "expired"]) {
    await assertFails(setDoc(doc(as(uid), obsPath("p1")), observation("p1", { byUid: uid })));
  }
  await assertFails(setDoc(doc(as("coach"), obsPath("p1")), observation("p1", { byUid: "someoneElse" })));
  await assertFails(setDoc(doc(as("coach"), obsPath("p9")), observation("p9")));
  await assertFails(setDoc(doc(as("coach"), obsPath("p1")), observation("p2")));
  await assertFails(setDoc(doc(as("coach"), obsPath("p2")), observation("p2")));
});

test("Beobachtung anlegen: nur erlaubte Felder und Werte", async () => {
  const bad = [
    { value: 0 }, { value: 5 }, { value: 2.5 }, { value: "3" },
    { date: "20.11.2026" }, { occasion: "party" }, { source: "parent" }, { framework: "eventnoten-1" },
    { criterionId: "../x" }, { criterionId: "" }, { note: "x".repeat(301) }, { position: "" }, { eventId: "" },
    { by: "x".repeat(81) }, { personality: "mental stark" }, { grade: 2 }
  ];
  for (const change of bad) await assertFails(setDoc(doc(as("coach"), obsPath("p1")), observation("p1", change)));
  const { note, ...withoutNote } = observation("p1");
  await assertFails(setDoc(doc(as("coach"), obsPath("p1")), withoutNote));
});

test("Beobachtung ändern nie, löschen nur Trainer", async () => {
  await assertFails(updateDoc(doc(as("coach"), obsPath("p1", "old")), { value: 4 }));
  await assertFails(setDoc(doc(as("coach"), obsPath("p1", "old")), observation("p1", { value: 1 })));
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "otherCoach"]) await assertFails(deleteDoc(doc(as(uid), obsPath("p1", "old"))));
  await assertSucceeds(deleteDoc(doc(as("coach"), obsPath("p1", "old"))));
});

const cfgPath = (id) => `teams/${TEAM}/competenceConfigs/${id}`;

test("Konfiguration lesen: nur Trainer", async () => {
  await assertSucceeds(getDoc(doc(as("coach"), cfgPath("v1"))));
  await assertSucceeds(getDocs(collection(as("coach"), `teams/${TEAM}/competenceConfigs`)));
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "otherCoach", "stranger"]) {
    await assertFails(getDoc(doc(as(uid), cfgPath("v1"))));
  }
});

test("Konfiguration anlegen: neue Version mit eigenem Konto; ohne Profil ohne Index", async () => {
  await assertSucceeds(setDoc(doc(as("coach"), cfgPath("v2")), config(2, { weights: { technique: 30, tactics: 10, physical: 20, psychological: 20, social: 20 } })));
  await assertSucceeds(setDoc(doc(as("coach"), cfgPath("v3")), config(3, { domains: ["technique"], weightProfile: null, weights: {}, indexEnabled: false })));
});

test("Konfiguration: ungültige Versionen, Bereiche, Gewichte und Rollen abgelehnt", async () => {
  const bad = [
    ["v5", config(2)], ["2", config(2)], ["v0", config(0)],
    ["v2", config(2, { domains: [] })], ["v2", config(2, { domains: ["technique", "charakter"] })],
    ["v2", config(2, { weightProfile: "talent" })], ["v2", config(2, { weights: { technique: 101 } })],
    ["v2", config(2, { weights: { technique: -1 } })], ["v2", config(2, { weights: { technique: 2.5 } })],
    ["v2", config(2, { weights: { charakter: 10 } })], ["v2", config(2, { weightProfile: null, indexEnabled: true })],
    ["v2", config(2, { byUid: "someoneElse" })], ["v2", config(2, { extra: true })]
  ];
  for (const [id, data] of bad) await assertFails(setDoc(doc(as("coach"), cfgPath(id)), data));
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "otherCoach"]) {
    await assertFails(setDoc(doc(as(uid), cfgPath("v2")), config(2, { byUid: uid })));
  }
});

test("Konfiguration ändern und löschen nie (Versionen bleiben rekonstruierbar)", async () => {
  await assertFails(updateDoc(doc(as("coach"), cfgPath("v1")), { indexEnabled: false }));
  await assertFails(setDoc(doc(as("coach"), cfgPath("v1")), config(1, { indexEnabled: false })));
  await assertFails(deleteDoc(doc(as("coach"), cfgPath("v1"))));
});
