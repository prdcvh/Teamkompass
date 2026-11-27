// Emulator-Tests: Messung bestätigen "stimmt so" (SCRUM-387). Dokument teams/{team}/players/{id}/measurements/{m}
// bekommt das Feld `review` {at, by, byUid, reason?}:
// - Trainer schreiben wie bisher alles (auch review);
// - Medizin darf NUR das Feld review setzen/entfernen: nur bei markierter Messung (quality flagged), eigenes Konto,
//   kurze Texte, keine Messwerte ändern, nicht anlegen/löschen, nicht bei Feldtests, nicht bei widerrufener Einwilligung;
// - Spieler, Eltern, Scouts, abgelaufene Trainer, Nicht-Angemeldete schreiben nie.
// Starten: siehe tests/rules/README.md. Nur erfundene Testdaten im Emulator.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { Timestamp, deleteDoc, deleteField, doc, setDoc, updateDoc } from "firebase/firestore";

const TEAM = "U17";
const t = (path) => `teams/${TEAM}/${path}`;
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-measurement-review",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const past = () => Timestamp.fromMillis(Date.now() - 86_400_000);
const review = (uid, extra = {}) => ({ at: "2026-11-27T10:00:00.000Z", by: "Test Person", byUid: uid, ...extra });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `teams/${TEAM}`), { name: "Team", label: "U17", hasTrainer: true });
    const members = {
      coach: { role: "trainer" },
      oldCoach: { role: "trainer", expiresAt: past() },
      medic: { role: "physio" },
      scout: { role: "scout" },
      pl1: { role: "player", playerId: "p1", expiresAt: null },
      parent1: { role: "parent", playerId: "p1", expiresAt: null }
    };
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
    await setDoc(doc(db, t("players/p1")), { name: "p1", number: 1, status: "Fit", consentStatus: "pending" });
    await setDoc(doc(db, t("players/p2")), { name: "p2", number: 2, status: "Fit", consentStatus: "revoked" });
    for (const id of ["p1", "p2"]) {
      await setDoc(doc(db, t(`players/${id}/measurements/flagged`)), { playerId: id, date: "2026-10-10", height: "149", weight: "", quality: "flagged", flags: ["height-drop"] });
      await setDoc(doc(db, t(`players/${id}/measurements/ok`)), { playerId: id, date: "2026-10-11", height: "151", weight: "", quality: "verified" });
      await setDoc(doc(db, t(`players/${id}/measurements/old`)), { playerId: id, date: "2026-07-01", height: "150", weight: "40" });
      await setDoc(doc(db, t(`players/${id}/measurements/ft`)), { playerId: id, kind: "fieldTest", date: "2026-10-12", quality: "flagged" });
      await setDoc(doc(db, t(`players/${id}/measurements/done`)), { playerId: id, date: "2026-10-13", height: "149", quality: "flagged", review: review("coach") });
    }
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const m = (db, id, player = "p1") => doc(db, t(`players/${player}/measurements/${id}`));

test("Medizin bestätigt eine markierte Messung mit eigenem Konto (mit und ohne Begründung) und nimmt sie zurück", async () => {
  const db = as("medic");
  await assertSucceeds(updateDoc(m(db, "flagged"), { review: review("medic") }));
  await assertSucceeds(updateDoc(m(db, "flagged"), { review: review("medic", { reason: "Nachgemessen, stimmt." }) }));
  await assertSucceeds(updateDoc(m(db, "done"), { review: deleteField() }));
});

test("Trainer bestätigt und nimmt zurück", async () => {
  const db = as("coach");
  await assertSucceeds(updateDoc(m(db, "flagged"), { review: review("coach") }));
  await assertSucceeds(updateDoc(m(db, "done"), { review: deleteField() }));
});

test("Medizin: nur das Feld review, nur markierte Messungen, nur eigenes Konto, nur kurze Texte", async () => {
  const db = as("medic");
  // fremdes Konto, unmarkierte / Bestands- / Feldtest-Messung
  await assertFails(updateDoc(m(db, "flagged"), { review: review("coach") }));
  await assertFails(updateDoc(m(db, "ok"), { review: review("medic") }));
  await assertFails(updateDoc(m(db, "old"), { review: review("medic") }));
  await assertFails(updateDoc(m(db, "ft"), { review: review("medic") }));
  // zusätzliche Felder in review, falsche Typen, zu lange Texte
  await assertFails(updateDoc(m(db, "flagged"), { review: { ...review("medic"), extra: 1 } }));
  await assertFails(updateDoc(m(db, "flagged"), { review: "ja" }));
  await assertFails(updateDoc(m(db, "flagged"), { review: review("medic", { reason: "x".repeat(201) }) }));
  await assertFails(updateDoc(m(db, "flagged"), { review: review("medic", { by: "x".repeat(81) }) }));
  // Messwerte ändern, auch gemeinsam mit review
  await assertFails(updateDoc(m(db, "flagged"), { height: "150" }));
  await assertFails(updateDoc(m(db, "flagged"), { quality: "verified" }));
  await assertFails(updateDoc(m(db, "flagged"), { review: review("medic"), height: "150" }));
  await assertFails(updateDoc(m(db, "flagged"), { review: review("medic"), flags: [] }));
  // anlegen und löschen
  await assertFails(setDoc(m(db, "neu"), { playerId: "p1", date: "2026-11-01", height: "150", quality: "flagged", review: review("medic") }));
  await assertFails(deleteDoc(m(db, "flagged")));
  // Feldtest-Rücknahme gibt es nicht
  await assertFails(updateDoc(m(db, "ft"), { review: deleteField() }));
});

test("Medizin darf bei widerrufener Einwilligung nichts bestätigen", async () => {
  await assertFails(updateDoc(m(as("medic"), "flagged", "p2"), { review: review("medic") }));
  await assertFails(updateDoc(m(as("medic"), "done", "p2"), { review: deleteField() }));
});

test("Spieler, Eltern, Scout, abgelaufene Trainer und Nicht-Angemeldete können nicht bestätigen oder zurücknehmen", async () => {
  for (const uid of ["pl1", "parent1", "scout", "oldCoach", "fremd", null]) {
    const db = as(uid);
    await assertFails(updateDoc(m(db, "flagged"), { review: review(uid ?? "x") }));
    await assertFails(updateDoc(m(db, "done"), { review: deleteField() }));
  }
});
