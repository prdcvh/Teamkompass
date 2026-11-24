// Emulator-Tests: Trainerbeobachtungen mit Verhaltensankern (SCRUM-268, docs/beobachtungsanker.md).
// Dokument teams/{team}/players/{id}/behaviorObservations/{eintrag}:
// - lesen nur Trainer (nie Spieler, Eltern, Medizin, Scouts, Vereinsadmin, andere Teams);
// - anlegen nur Trainer, mit dem eigenen Konto, nur erlaubte Felder und Werte, Quelle "trainer", Termin-Beleg nur
//   ein bestehender Termin, nicht bei widerrufener Einwilligung;
// - aendern nie, loeschen Trainer.
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const OWN = "U17";
const OTHER = "U15";
const CLUB = "club-koenigstein";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-behavior-observations",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const members = {
  coach: { role: "trainer" },
  coach2: { role: "trainer" },
  medic: { role: "physio" },
  scout: { role: "scout" },
  pl1: { role: "player", playerId: "p1", expiresAt: null },
  parent1: { role: "parent", playerId: "p1", expiresAt: null },
  oldCoach: { role: "trainer", expiresAt: new Date("2020-01-01T00:00:00Z") }
};
// p1: offen, p2: widerrufen, p3: dokumentiert.
const consents = { p1: "pending", p2: "revoked", p3: "granted" };
const observation = (playerId, change = {}) => ({
  playerId,
  framework: "anker-1",
  criterionId: "afterMistake",
  value: 4,
  date: "2026-11-20",
  periodFrom: "2026-10-24",
  periodTo: "2026-11-20",
  opportunities: 5,
  eventId: null,
  evidence: "Nach dem Fehlpass sofort wieder den Ball gefordert.",
  source: "trainer",
  by: "Trainer Test",
  byUid: "coach",
  createdAt: "2026-11-20T19:00:00.000Z",
  ...change
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `clubs/${CLUB}/admins/clubadmin`), { role: "admin" });
    await setDoc(doc(db, `teams/${OTHER}/members/otherCoach`), { role: "trainer" });
    await setDoc(doc(db, `teams/${OWN}`), { clubId: CLUB, name: "Team U17", label: "U17", hasTrainer: true });
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, `teams/${OWN}/members/${uid}`), data);
    await setDoc(doc(db, `teams/${OWN}/events/e1`), { title: "Spiel", date: "2026-11-15", type: "Spiel" });
    for (const [id, consentStatus] of Object.entries(consents)) {
      await setDoc(doc(db, `teams/${OWN}/players/${id}`), { name: id, number: 1, status: "Fit", consentStatus });
      await setDoc(doc(db, `teams/${OWN}/players/${id}/behaviorObservations/old`), observation(id));
    }
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const path = (playerId, id = "o1") => `teams/${OWN}/players/${playerId}/behaviorObservations/${id}`;

test("Lesen: nur Trainer; Spieler, Eltern, Medizin, Scouts, Vereinsadmin, abgelaufene Zugänge und Fremde nie", async () => {
  await assertSucceeds(getDoc(doc(as("coach"), path("p1", "old"))));
  await assertSucceeds(getDocs(collection(as("coach2"), `teams/${OWN}/players/p1/behaviorObservations`)));
  await assertSucceeds(getDoc(doc(as("coach"), path("p2", "old"))));
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "otherCoach", "oldCoach", "stranger"]) {
    await assertFails(getDoc(doc(as(uid), path("p1", "old"))));
    await assertFails(getDocs(collection(as(uid), `teams/${OWN}/players/p1/behaviorObservations`)));
    await assertFails(getDocs(query(collection(as(uid), `teams/${OWN}/players/p1/behaviorObservations`), where("playerId", "==", "p1"))));
  }
  await assertFails(getDocs(query(collectionGroup(as("pl1"), "behaviorObservations"), where("playerId", "==", "p1"))));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path("p1", "old"))));
});

test("Anlegen: Trainer mit gültiger Beobachtung, auch mit Termin als Beleg; zwei Trainer je eigener Eintrag", async () => {
  await assertSucceeds(setDoc(doc(as("coach"), path("p1")), observation("p1")));
  await assertSucceeds(setDoc(doc(as("coach2"), path("p1", "o2")), observation("p1", { byUid: "coach2", by: "Co-Trainer", value: 2, eventId: "e1" })));
  await assertSucceeds(setDoc(doc(as("coach"), path("p3")), observation("p3", { criterionId: "communication", value: 1, evidence: "" })));
});

test("Anlegen: andere Rollen nie", async () => {
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "otherCoach", "oldCoach"]) {
    await assertFails(setDoc(doc(as(uid), path("p1")), observation("p1", { byUid: uid })));
  }
});

test("Anlegen: falsche Felder, Werte, fremdes Konto, andere Quelle, fehlender Termin oder Spieler werden abgelehnt", async () => {
  const coach = as("coach");
  const bad = [
    { byUid: "coach2" },
    { playerId: "p3" },
    { value: 0 },
    { value: 6 },
    { value: 3.5 },
    { opportunities: 0 },
    { opportunities: 51 },
    { opportunities: "5" },
    { periodFrom: "2026-11-21" },
    { periodTo: "2026-11-21" },
    { date: "20.11.2026" },
    { framework: "raster-1" },
    { criterionId: "mental.stark!" },
    { source: "self" },
    { source: "peer" },
    { eventId: "gibtsnicht" },
    { eventId: "" },
    { evidence: "x".repeat(301) },
    { by: "x".repeat(81) },
    { diagnosis: "ADHS" },
    { talent: true }
  ];
  for (const change of bad) await assertFails(setDoc(doc(coach, path("p1")), observation("p1", change)));
  const withoutOpportunities = observation("p1");
  delete withoutOpportunities.opportunities;
  await assertFails(setDoc(doc(coach, path("p1")), withoutOpportunities));
  await assertFails(setDoc(doc(coach, path("missing")), observation("missing")));
});

test("Widerruf: keine neue Beobachtung", async () => {
  await assertFails(setDoc(doc(as("coach"), path("p2")), observation("p2")));
});

test("Ändern nie, Löschen nur Trainer (auch bei Widerruf)", async () => {
  await assertFails(updateDoc(doc(as("coach"), path("p1", "old")), { value: 5 }));
  await assertFails(setDoc(doc(as("coach"), path("p1", "old")), observation("p1", { value: 5 })));
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "otherCoach"]) await assertFails(deleteDoc(doc(as(uid), path("p1", "old"))));
  await assertSucceeds(deleteDoc(doc(as("coach2"), path("p1", "old"))));
  await assertSucceeds(deleteDoc(doc(as("coach"), path("p2", "old"))));
});
