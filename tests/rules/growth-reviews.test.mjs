// Emulator-Tests: Trainerpruefung "Wachstum und Belastung gemeinsam ansehen" (SCRUM-257).
// Dokument teams/{team}/players/{id}/growthReviews/{pruefung} (Notiz am Foerderplan: Datum, Trainer, Massnahme):
// - lesen nur Trainer (nie Spieler, Eltern, Medizin, Scouts, Vereinsadmin);
// - anlegen nur Trainer, nur erlaubte Felder, nur zu einem bestehenden Foerderplan, mit dem eigenen Konto,
//   nicht bei widerrufener Einwilligung, fremde Vereine nur mit dokumentierter Einwilligung;
// - aendern nie, loeschen Trainer.
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

const OWN = "U17";
const OTHER_OWN = "U15";
const CLUB = "club-koenigstein";
const FOREIGN = "Xy7Fremd0000Verein01";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-growth-reviews",
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
// p1: offen, p2: widerrufen, p3: dokumentiert.
const consents = { p1: "pending", p2: "revoked", p3: "granted" };
const review = (playerId, change = {}) => ({
  playerId,
  planId: "plan1",
  hintKey: `growthLoad:${playerId}:m1@2026-07-01@160>m2@2026-10-01@163`,
  date: "2026-10-10",
  by: "Trainer Test",
  byUid: "coach",
  action: "Sprungumfang zwei Wochen reduziert, im Gespräch erklärt.",
  createdAt: "2026-10-10T19:00:00.000Z",
  ...change
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `clubs/${CLUB}/admins/clubadmin`), { role: "admin" });
    await setDoc(doc(db, `teams/${OTHER_OWN}/members/otherCoach`), { role: "trainer" });
    for (const team of [OWN, FOREIGN]) {
      await setDoc(doc(db, `teams/${team}`), { clubId: CLUB, name: `Team ${team}`, label: "U17", hasTrainer: true });
      for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, `teams/${team}/members/${uid}`), data);
      for (const [id, consentStatus] of Object.entries(consents)) {
        await setDoc(doc(db, `teams/${team}/players/${id}`), { name: id, number: 1, status: "Fit", consentStatus });
        await setDoc(doc(db, `teams/${team}/players/${id}/developmentPlans/plan1`), { playerId: id, focus: "Athletik", goal: "Ziel", status: "Offen" });
        await setDoc(doc(db, `teams/${team}/players/${id}/growthReviews/old`), review(id));
      }
    }
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const path = (team, playerId, id = "r1") => `teams/${team}/players/${playerId}/growthReviews/${id}`;

test("Lesen: nur Trainer; Spieler, Eltern, Medizin, Scouts, Vereinsadmin und Fremde nie", async () => {
  await assertSucceeds(getDoc(doc(as("coach"), path(OWN, "p1", "old"))));
  await assertSucceeds(getDocs(collection(as("coach"), `teams/${OWN}/players/p1/growthReviews`)));
  await assertSucceeds(getDoc(doc(as("coach"), path(OWN, "p2", "old"))));
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "otherCoach", "stranger"]) {
    await assertFails(getDoc(doc(as(uid), path(OWN, "p1", "old"))));
    await assertFails(getDocs(collection(as(uid), `teams/${OWN}/players/p1/growthReviews`)));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path(OWN, "p1", "old"))));
});

test("Anlegen: Trainer mit gültiger Notiz an einem bestehenden Förderplan", async () => {
  await assertSucceeds(setDoc(doc(as("coach"), path(OWN, "p1")), review("p1")));
  await assertSucceeds(setDoc(doc(as("coach"), path(FOREIGN, "p3")), review("p3")));
});

test("Anlegen: andere Rollen nie", async () => {
  for (const uid of ["pl1", "parent1", "medic", "scout", "clubadmin", "otherCoach"]) {
    await assertFails(setDoc(doc(as(uid), path(OWN, "p1")), review("p1", { byUid: uid })));
  }
});

test("Anlegen: falsche oder fremde Felder, fremdes Konto, fehlender Förderplan werden abgelehnt", async () => {
  const coach = as("coach");
  await assertFails(setDoc(doc(coach, path(OWN, "p1")), review("p1", { byUid: "someoneElse" })));
  await assertFails(setDoc(doc(coach, path(OWN, "p1")), review("p1", { planId: "missing" })));
  await assertFails(setDoc(doc(coach, path(OWN, "p1")), review("p1", { playerId: "p3" })));
  await assertFails(setDoc(doc(coach, path(OWN, "p1")), review("p1", { action: "" })));
  await assertFails(setDoc(doc(coach, path(OWN, "p1")), review("p1", { action: "x".repeat(401) })));
  await assertFails(setDoc(doc(coach, path(OWN, "p1")), review("p1", { date: "10.10.2026" })));
  await assertFails(setDoc(doc(coach, path(OWN, "p1")), review("p1", { hintKey: "" })));
  await assertFails(setDoc(doc(coach, path(OWN, "p1")), review("p1", { status: "verletzt" })));
  await assertFails(setDoc(doc(coach, path(OWN, "p1")), review("p1", { blocked: true })));
});

test("Widerruf: keine neue Prüfung; fremder Verein nur mit dokumentierter Einwilligung", async () => {
  await assertFails(setDoc(doc(as("coach"), path(OWN, "p2")), review("p2")));
  await assertFails(setDoc(doc(as("coach"), path(FOREIGN, "p1")), review("p1")));
  await assertFails(setDoc(doc(as("coach"), path(FOREIGN, "p2")), review("p2")));
});

test("Ändern nie, Löschen nur Trainer (auch bei Widerruf)", async () => {
  await assertFails(updateDoc(doc(as("coach"), path(OWN, "p1", "old")), { action: "geändert" }));
  await assertFails(setDoc(doc(as("coach"), path(OWN, "p1", "old")), review("p1", { action: "geändert" })));
  for (const uid of ["pl1", "parent1", "medic", "clubadmin"]) await assertFails(deleteDoc(doc(as(uid), path(OWN, "p1", "old"))));
  await assertSucceeds(deleteDoc(doc(as("coach"), path(OWN, "p1", "old"))));
  await assertSucceeds(deleteDoc(doc(as("coach"), path(OWN, "p2", "old"))));
});
