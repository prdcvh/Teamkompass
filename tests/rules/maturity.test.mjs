// Emulator-Tests: Reife-Kompass (SCRUM-190, PO-Entscheidung 02.11.2026).
// Dokument teams/{team}/players/{id}/maturity/parents (Geschlecht, Einverstaendnis der Eltern, Groesse der Eltern):
// - lesen nur Trainer und Medizin (Medizin nicht bei widerrufener Einwilligung), nie Spieler, Eltern oder Scouts;
// - schreiben nur Trainer, nur erlaubte Felder, Groessen nur mit Haekchen "Eltern sind einverstanden";
// - fremde Vereine nur mit dokumentierter Einwilligung.
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

const OWN = "U17";
const FOREIGN = "Xy7Fremd0000Verein01";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-maturity",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const members = {
  coach: { role: "trainer" },
  medic: { role: "physio" },
  scout: { role: "scout" },
  oldMedical: { role: "medical" },
  pl1: { role: "player", playerId: "p1", expiresAt: null },
  parent1: { role: "parent", playerId: "p1", expiresAt: null }
};
// p1: offen, p2: widerrufen, p3: dokumentiert.
const consents = { p1: "pending", p2: "revoked", p3: "granted" };
const valid = (playerId, change = {}) => ({
  playerId, sex: "m", parentsConsent: true, motherHeight: 167.6, fatherHeight: 182, updatedAt: "2026-11-03T20:00:00.000Z", ...change
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const team of [OWN, FOREIGN]) {
      for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, `teams/${team}/members/${uid}`), data);
      for (const [id, consentStatus] of Object.entries(consents)) {
        await setDoc(doc(db, `teams/${team}/players/${id}`), { name: id, number: 1, status: "Fit", consentStatus });
        await setDoc(doc(db, `teams/${team}/players/${id}/maturity/parents`), valid(id));
      }
    }
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const path = (team, playerId) => `teams/${team}/players/${playerId}/maturity/parents`;

test("Lesen: Trainer und Medizin ja; Spieler, Eltern, Scouts und Fremde nie", async () => {
  await assertSucceeds(getDoc(doc(as("coach"), path(OWN, "p1"))));
  await assertSucceeds(getDocs(collection(as("coach"), `teams/${OWN}/players/p1/maturity`)));
  await assertSucceeds(getDoc(doc(as("medic"), path(OWN, "p1"))));
  await assertSucceeds(getDoc(doc(as("medic"), path(OWN, "p3"))));
  for (const uid of ["pl1", "parent1", "scout", "oldMedical"]) {
    await assertFails(getDoc(doc(as(uid), path(OWN, "p1"))));
    await assertFails(getDocs(collection(as(uid), `teams/${OWN}/players/p1/maturity`)));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path(OWN, "p1"))));
  await assertFails(getDoc(doc(as("stranger"), path(OWN, "p1"))));
});

test("Widerrufene Einwilligung: Medizin liest nicht mehr, der Trainer schon", async () => {
  await assertFails(getDoc(doc(as("medic"), path(OWN, "p2"))));
  await assertSucceeds(getDoc(doc(as("coach"), path(OWN, "p2"))));
});

test("Schreiben: nur Trainer, nur Dokument 'parents'", async () => {
  await assertSucceeds(setDoc(doc(as("coach"), path(OWN, "p1")), valid("p1", { sex: "f", motherHeight: 160, fatherHeight: 175 })));
  for (const uid of ["medic", "pl1", "parent1", "scout"]) {
    await assertFails(setDoc(doc(as(uid), path(OWN, "p1")), valid("p1")));
    await assertFails(deleteDoc(doc(as(uid), path(OWN, "p1"))));
  }
  await assertFails(setDoc(doc(as("coach"), `teams/${OWN}/players/p1/maturity/percent`), valid("p1")));
  await assertSucceeds(deleteDoc(doc(as("coach"), path(OWN, "p1"))));
});

test("Ohne Haekchen der Eltern keine Groessen; Haekchen weg = Groessen geloescht", async () => {
  await assertFails(setDoc(doc(as("coach"), path(OWN, "p1")), valid("p1", { parentsConsent: false })));
  await assertFails(setDoc(doc(as("coach"), path(OWN, "p1")), valid("p1", { parentsConsent: false, fatherHeight: null })));
  await assertSucceeds(setDoc(doc(as("coach"), path(OWN, "p1")), valid("p1", { parentsConsent: false, motherHeight: null, fatherHeight: null })));
  // Geschlecht darf ohne Elterngroesse gespeichert werden.
  await assertSucceeds(setDoc(doc(as("coach"), path(OWN, "p1")), valid("p1", { sex: "f", parentsConsent: false, motherHeight: null, fatherHeight: null })));
});

test("Format: nur erlaubte Felder, gueltige Werte, passende playerId", async () => {
  const coach = doc(as("coach"), path(OWN, "p1"));
  await assertFails(setDoc(coach, valid("p1", { percent: 93.4 })));
  await assertFails(setDoc(coach, valid("p1", { band: "early" })));
  await assertFails(setDoc(coach, valid("p2")));
  await assertFails(setDoc(coach, valid("p1", { sex: "x" })));
  await assertFails(setDoc(coach, valid("p1", { parentsConsent: "ja" })));
  await assertFails(setDoc(coach, valid("p1", { motherHeight: "170" })));
  await assertFails(setDoc(coach, valid("p1", { motherHeight: 99 })));
  await assertFails(setDoc(coach, valid("p1", { fatherHeight: 251 })));
  await assertSucceeds(setDoc(coach, valid("p1", { motherHeight: 100, fatherHeight: 250 })));
  await assertSucceeds(setDoc(coach, valid("p1", { sex: "", motherHeight: null })));
});

test("Fremder Verein: speichern nur mit dokumentierter Einwilligung", async () => {
  await assertFails(setDoc(doc(as("coach"), path(FOREIGN, "p1")), valid("p1")));
  await assertSucceeds(setDoc(doc(as("coach"), path(FOREIGN, "p3")), valid("p3")));
  // Loeschen geht immer.
  await assertSucceeds(deleteDoc(doc(as("coach"), path(FOREIGN, "p1"))));
});
