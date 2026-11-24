// Emulator-Tests: Taktikdiagnostik (SCRUM-267) unter teams/{team}/tacticScenes/{szene}.
// - lesen nur Trainer (auch per Abfrage nach eventId/playerId); Spieler, Eltern, Medizin, Scouts, Vereinsadmin,
//   abgelaufene Zugaenge, Trainer anderer Teams und Fremde nie;
// - anlegen nur Trainer, nur erlaubte Felder und Werte, Ausfuehrung nur bei sinnvoller Entscheidung, Videolink nur
//   https, nur fuer bestehenden Spieler und Termin, mit dem eigenen Konto;
// - aendern nie, loeschen nur Trainer.
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const TEAM = "U17";
const CLUB = "club-koenigstein";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-tactic-scenes",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const members = {
  coach: { role: "trainer" },
  medic: { role: "physio" },
  scout: { role: "scout" },
  pl1: { role: "player", playerId: "p1", expiresAt: null },
  parent1: { role: "parent", playerId: "p1", expiresAt: null },
  oldCoach: { role: "trainer", expiresAt: new Date("2020-01-01T00:00:00Z") }
};

const scene = (change = {}) => ({
  playerId: "p1",
  eventId: "e1",
  eventDate: "2026-10-04",
  eventType: "Spiel",
  eventTitle: "Spiel gegen Musterstadt",
  minute: 34,
  context: "Aufbau gegen hohes Pressing",
  decision: "good",
  execution: "fail",
  situations: ["pass", "scanning"],
  videoUrl: "https://video.example/intern/clip-1",
  by: "Trainer Test",
  byUid: "coach",
  createdAt: "2026-10-05T19:00:00.000Z",
  ...change
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `clubs/${CLUB}/admins/clubadmin`), { role: "admin" });
    await setDoc(doc(db, `teams/${TEAM}`), { clubId: CLUB, name: "Team U17", label: "U17", hasTrainer: true });
    await setDoc(doc(db, `teams/U15/members/otherCoach`), { role: "trainer" });
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, `teams/${TEAM}/members/${uid}`), data);
    await setDoc(doc(db, `teams/${TEAM}/players/p1`), { name: "p1", number: 7, status: "Fit" });
    await setDoc(doc(db, `teams/${TEAM}/events/e1`), { type: "Spiel", title: "Spiel", date: "2026-10-04" });
    await setDoc(doc(db, `teams/${TEAM}/tacticScenes/old`), scene());
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const path = (id = "s1") => `teams/${TEAM}/tacticScenes/${id}`;
const scenes = (db) => collection(db, `teams/${TEAM}/tacticScenes`);

test("Lesen: nur Trainer, auch als Abfrage nach Termin oder Spieler", async () => {
  await assertSucceeds(getDoc(doc(as("coach"), path("old"))));
  await assertSucceeds(getDocs(query(scenes(as("coach")), where("eventId", "==", "e1"))));
  await assertSucceeds(getDocs(query(scenes(as("coach")), where("playerId", "==", "p1"))));
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "oldCoach", "otherCoach", "stranger"]) {
    await assertFails(getDoc(doc(as(uid), path("old"))));
    await assertFails(getDocs(query(scenes(as(uid)), where("playerId", "==", "p1"))));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path("old"))));
});

test("Anlegen: Trainer mit gültiger Szene (auch ohne Minute, Typen und Videolink)", async () => {
  await assertSucceeds(setDoc(doc(as("coach"), path("s1")), scene()));
  await assertSucceeds(setDoc(doc(as("coach"), path("s2")), scene({ minute: null, situations: [], videoUrl: "", decision: "poor", execution: null })));
  await assertSucceeds(setDoc(doc(as("coach"), path("s3")), scene({ decision: "unclear", execution: null, eventType: "Training" })));
  await assertSucceeds(setDoc(doc(as("coach"), path("s4")), scene({ execution: "unclear" })));
});

test("Anlegen: andere Rollen nie", async () => {
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "oldCoach", "otherCoach"]) {
    await assertFails(setDoc(doc(as(uid), path("x")), scene({ byUid: uid })));
  }
});

test("Anlegen: Ausführung nur bei sinnvoller Entscheidung, und dann Pflicht", async () => {
  const db = as("coach");
  await assertFails(setDoc(doc(db, path("x1")), scene({ decision: "poor", execution: "success" })));
  await assertFails(setDoc(doc(db, path("x2")), scene({ decision: "unclear", execution: "fail" })));
  await assertFails(setDoc(doc(db, path("x3")), scene({ decision: "good", execution: null })));
  await assertFails(setDoc(doc(db, path("x4")), scene({ decision: "super" })));
  await assertFails(setDoc(doc(db, path("x5")), scene({ execution: "toll" })));
});

test("Anlegen: ungültige Felder und Werte werden abgelehnt", async () => {
  const db = as("coach");
  const bad = [
    { extra: "x" },
    { videoUrl: "http://video.example/clip" },
    { videoUrl: "javascript:alert(1)" },
    { videoUrl: "https://a b" },
    { videoUrl: "https://" + "x".repeat(500) },
    { minute: 151 },
    { minute: -1 },
    { minute: 12.5 },
    { context: "" },
    { context: "x".repeat(301) },
    { situations: ["pass", "dribbling"] },
    { eventType: "Turnier" },
    { eventDate: "04.10.2026" },
    { byUid: "someoneElse" }
  ];
  for (const [index, change] of bad.entries()) await assertFails(setDoc(doc(db, path(`b${index}`)), scene(change)));
});

test("Anlegen: nur für bestehenden Spieler und bestehenden Termin", async () => {
  const db = as("coach");
  await assertFails(setDoc(doc(db, path("y1")), scene({ playerId: "gibtsNicht" })));
  await assertFails(setDoc(doc(db, path("y2")), scene({ eventId: "gibtsNicht" })));
});

test("Ändern nie, löschen nur Trainer", async () => {
  await assertFails(updateDoc(doc(as("coach"), path("old")), { context: "geändert" }));
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "oldCoach"]) {
    await assertFails(deleteDoc(doc(as(uid), path("old"))));
  }
  await assertSucceeds(deleteDoc(doc(as("coach"), path("old"))));
});
