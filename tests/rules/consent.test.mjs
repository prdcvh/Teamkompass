// Emulator-Tests: Einwilligung fuer Gesundheitsdaten (SCRUM-245, PO-Entscheidung zu SCRUM-173 vom 02.11.2026).
// - widerrufen: Spieler, Eltern und Medizin lesen keine Gesundheitsdaten mehr, der Trainer schon;
// - offen in eigenen Teams: alles wie bisher;
// - fremde Vereine: Gesundheitsdaten nur mit dokumentierter Einwilligung speicherbar.
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";

const OWN = "U17";
// Team eines fremden Vereins (Zufalls-ID wie bei der Registrierung, SCRUM-181).
const FOREIGN = "Xy7Fremd0000Verein01";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-consent",
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
  pl2: { role: "player", playerId: "p2", expiresAt: null },
  parent2: { role: "parent", playerId: "p2", expiresAt: null }
};

// p1: Einwilligung widerrufen, p2: offen, p3: dokumentiert - jeweils mit Gesundheitsdaten aus der Zeit davor.
const consents = { p1: "revoked", p2: "pending", p3: "granted" };

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const team of [OWN, FOREIGN]) {
      const t = (path) => `teams/${team}/${path}`;
      for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
      await setDoc(doc(db, t("events/e1")), { title: "Training" });
      for (const [id, consentStatus] of Object.entries(consents)) {
        await setDoc(doc(db, t(`players/${id}`)), { name: id, number: 1, status: "Verletzt", injuryUntil: "2026-12-01", injuredSince: "2026-11-01", consentStatus });
        await setDoc(doc(db, t(`players/${id}/absences/a1`)), { playerId: id, label: "Bänderriss", type: "injury" });
        await setDoc(doc(db, t(`players/${id}/measurements/m1`)), { playerId: id, height: 170 });
        await setDoc(doc(db, t(`players/${id}/developmentPlans/f1`)), { playerId: id, focus: "x" });
        await setDoc(doc(db, t(`events/e1/ratings/${id}`)), { playerId: id, effort: 2 });
        await setDoc(doc(db, t(`events/e1/responses/${id}`)), { playerId: id, status: "no", reason: "krank", by: "player" });
      }
      await setDoc(doc(db, t("events/e1/responses/p9")), { playerId: "p9", status: "yes", reason: "", by: "player" });
    }
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const p = (team, path) => `teams/${team}/${path}`;
const answer = (status, by, reason = "") => ({ playerId: "p1", status, reason, by, updatedAt: serverTimestamp() });

test("Widerrufen: Spieler, Eltern und Medizin lesen keine Gesundheitsdaten, der Trainer schon", async () => {
  for (const team of [OWN, FOREIGN]) {
    for (const uid of ["pl1", "parent1", "medic"]) {
      for (const path of ["players/p1", "players/p1/absences/a1", "players/p1/measurements/m1"]) await assertFails(getDoc(doc(as(uid), p(team, path))));
    }
    for (const uid of ["pl1", "parent1"]) {
      // Listen mit playerId-Filter (so lädt das Profil) ebenfalls gesperrt.
      await assertFails(getDocs(query(collection(as(uid), p(team, "players/p1/absences")), where("playerId", "==", "p1"))));
      await assertFails(getDocs(query(collection(as(uid), p(team, "players/p1/measurements")), where("playerId", "==", "p1"))));
      // Absagegrund: gesperrt, solange einer drinsteht.
      await assertFails(getDoc(doc(as(uid), p(team, "events/e1/responses/p1"))));
      // Noten und Förderplan sind keine Gesundheitsdaten und bleiben lesbar.
      await assertSucceeds(getDoc(doc(as(uid), p(team, "events/e1/ratings/p1"))));
      await assertSucceeds(getDocs(query(collection(as(uid), p(team, "players/p1/developmentPlans")), where("playerId", "==", "p1"))));
    }
    await assertFails(getDocs(collection(as("medic"), p(team, "players/p1/absences"))));
    await assertFails(getDocs(collection(as("medic"), p(team, "players/p1/measurements"))));
    // Medizin-Liste: der widerrufene Spieler fehlt.
    const list = await assertSucceeds(getDocs(query(collection(as("medic"), p(team, "players")), where("consentStatus", "!=", "revoked"))));
    assert.deepEqual(list.docs.map((entry) => entry.id).sort(), ["p2", "p3"]);
    // Trainer sieht weiter alles.
    for (const path of ["players/p1", "players/p1/absences/a1", "players/p1/measurements/m1", "events/e1/responses/p1"]) await assertSucceeds(getDoc(doc(as("coach"), p(team, path))));
    await assertSucceeds(getDocs(collection(as("coach"), p(team, "players"))));
    await assertSucceeds(getDocs(collection(as("coach"), p(team, "players/p1/absences"))));
  }
});

test("Widerrufen: Zu-/Absage ohne Grund geht weiter, mit Grund nicht", async () => {
  for (const team of [OWN, FOREIGN]) {
    await assertFails(setDoc(doc(as("pl1"), p(team, "events/e1/responses/p1")), answer("no", "player", "krank")));
    await assertSucceeds(setDoc(doc(as("pl1"), p(team, "events/e1/responses/p1")), answer("no", "player")));
    // Ohne Grund wieder lesbar (die App zeigt die eigene Absage an).
    await assertSucceeds(getDoc(doc(as("pl1"), p(team, "events/e1/responses/p1"))));
    await assertSucceeds(setDoc(doc(as("parent1"), p(team, "events/e1/responses/p1")), answer("yes", "parent")));
  }
});

test("Widerrufen: der Trainer löscht von Hand, nichts passiert automatisch", async () => {
  for (const team of [OWN, FOREIGN]) {
    const db = as("coach");
    await assertSucceeds(deleteDoc(doc(db, p(team, "players/p1/absences/a1"))));
    await assertSucceeds(deleteDoc(doc(db, p(team, "players/p1/measurements/m1"))));
    await assertSucceeds(deleteDoc(doc(db, p(team, "events/e1/responses/p1"))));
    // Status zurücksetzen ist immer erlaubt.
    await assertSucceeds(setDoc(doc(db, p(team, "players/p1")), { status: "Fit", injuryUntil: "", injuredSince: "" }, { merge: true }));
  }
});

test("SCRUM-248: der Trainer leert nur den Absagegrund, sonst nichts", async () => {
  for (const team of [OWN, FOREIGN]) {
    const ref = (uid) => doc(as(uid), p(team, "events/e1/responses/p1"));
    // Nur den Grund leeren - kein anderer Grund, keine anderen Felder, nicht Spieler/Eltern/Medizin auf diesem Weg.
    await assertFails(updateDoc(ref("coach"), { reason: "erkältet" }));
    await assertFails(updateDoc(ref("coach"), { reason: "", status: "yes" }));
    await assertFails(updateDoc(ref("medic"), { reason: "" }));
    await assertFails(updateDoc(ref("pl1"), { reason: "" }));
    await assertSucceeds(updateDoc(ref("coach"), { reason: "" }));
    const after = await assertSucceeds(getDoc(ref("coach")));
    assert.deepEqual(after.data(), { playerId: "p1", status: "no", reason: "", by: "player" });
    // Danach liest der Spieler die Absage wieder (ohne Grund).
    await assertSucceeds(getDoc(ref("pl1")));
    // Neue Rückmeldungen legt der Trainer nicht an.
    await assertFails(setDoc(doc(as("coach"), p(team, "events/e1/responses/p4")), { playerId: "p4", status: "no", reason: "", by: "player" }));
  }
});

test("Bereinigte Spielerkarte: nur der eigene Spieler bzw. die Eltern lesen, nur der Trainer schreibt, nur erlaubte Felder", async () => {
  const card = { playerId: "p1", name: "p1", number: 1, positions: ["ZM"], birthdate: "2012-01-01", consentStatus: "revoked" };
  for (const team of [OWN, FOREIGN]) {
    const ref = (uid) => doc(as(uid), p(team, "playerCards/p1"));
    await assertSucceeds(setDoc(ref("coach"), card));
    for (const uid of ["pl1", "parent1", "coach"]) await assertSucceeds(getDoc(ref(uid)));
    for (const uid of ["pl2", "parent2", "medic", "scout"]) await assertFails(getDoc(ref(uid)));
    await assertFails(getDocs(collection(as("pl1"), p(team, "playerCards"))));
    await assertSucceeds(getDocs(collection(as("coach"), p(team, "playerCards"))));
    // Keine Gesundheitsfelder, keine fremde ID, nur für widerrufene Einwilligung, nur Trainer.
    await assertFails(setDoc(ref("coach"), { ...card, status: "Verletzt" }));
    await assertFails(setDoc(ref("coach"), { ...card, injuryUntil: "2026-12-01" }));
    await assertFails(setDoc(ref("coach"), { ...card, playerId: "p2" }));
    await assertFails(setDoc(ref("coach"), { ...card, consentStatus: "pending" }));
    await assertFails(setDoc(ref("pl1"), card));
    await assertFails(setDoc(ref("medic"), card));
    await assertSucceeds(deleteDoc(ref("coach")));
  }
});

test("Eigene Teams, Einwilligung offen: alles wie bisher", async () => {
  for (const uid of ["pl2", "parent2", "medic"]) {
    for (const path of ["players/p2", "players/p2/absences/a1", "players/p2/measurements/m1"]) await assertSucceeds(getDoc(doc(as(uid), p(OWN, path))));
  }
  await assertSucceeds(getDoc(doc(as("pl2"), p(OWN, "events/e1/responses/p2"))));
  const db = as("coach");
  await assertSucceeds(setDoc(doc(db, p(OWN, "players/p2")), { status: "Verletzt", injuryUntil: "2027-01-01" }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, p(OWN, "players/p2/absences/a2")), { playerId: "p2", label: "Grippe" }));
  await assertSucceeds(setDoc(doc(db, p(OWN, "players/p2/measurements/m2")), { playerId: "p2", weight: 60 }));
  await assertSucceeds(setDoc(doc(db, p(OWN, "players/p9")), { name: "neu", status: "Angeschlagen", consentStatus: "pending" }));
  await assertSucceeds(setDoc(doc(as("pl2"), p(OWN, "events/e1/responses/p2")), { ...answer("no", "player", "krank"), playerId: "p2" }));
  // Auch bei widerrufener Einwilligung speichert der Trainer im eigenen Team weiter (PO: keine Sperre ausser Befinden).
  await assertSucceeds(setDoc(doc(db, p(OWN, "players/p1/absences/a2")), { playerId: "p1", label: "Grippe" }));
});

test("Fremder Verein ohne dokumentierte Einwilligung: Gesundheitsdaten speichern verboten", async () => {
  const db = as("coach");
  for (const id of ["p1", "p2"]) {
    await assertFails(setDoc(doc(db, p(FOREIGN, `players/${id}/absences/a2`)), { playerId: id, label: "Grippe" }));
    await assertFails(setDoc(doc(db, p(FOREIGN, `players/${id}/measurements/m2`)), { playerId: id, weight: 60 }));
    // Status ausser "Fit" und "verletzt bis/seit" gehen nicht - auch nicht als Teil einer anderen Änderung.
    await assertFails(setDoc(doc(db, p(FOREIGN, `players/${id}`)), { name: "Neuer Name" }, { merge: true }));
    await assertFails(setDoc(doc(db, p(FOREIGN, `players/${id}`)), { status: "Angeschlagen", injuryUntil: "", injuredSince: "" }, { merge: true }));
    await assertFails(setDoc(doc(db, p(FOREIGN, `players/${id}`)), { status: "Fit", injuryUntil: "2026-12-01", injuredSince: "" }, { merge: true }));
    // Gesundheitsangaben entfernen und andere Angaben ändern geht.
    await assertSucceeds(setDoc(doc(db, p(FOREIGN, `players/${id}`)), { name: "Neuer Name", status: "Fit", injuryUntil: "", injuredSince: "" }, { merge: true }));
    // Bestehende Einträge löschen geht immer.
    await assertSucceeds(deleteDoc(doc(db, p(FOREIGN, `players/${id}/absences/a1`))));
  }
  await assertFails(setDoc(doc(db, p(FOREIGN, "players/p9")), { name: "neu", status: "Verletzt", consentStatus: "pending" }));
  await assertSucceeds(setDoc(doc(db, p(FOREIGN, "players/p9")), { name: "neu", status: "Fit", injuryUntil: "", injuredSince: "", consentStatus: "pending" }));
  // Abwesenheit für einen Spieler ohne Spielerdokument: nicht speicherbar.
  await assertFails(setDoc(doc(db, p(FOREIGN, "players/p8/absences/a1")), { playerId: "p8", label: "x" }));
  // Absagegrund nur mit Einwilligung; Absage ohne Grund geht.
  await assertFails(setDoc(doc(as("pl2"), p(FOREIGN, "events/e1/responses/p2")), { ...answer("no", "player", "krank"), playerId: "p2" }));
  await assertSucceeds(setDoc(doc(as("pl2"), p(FOREIGN, "events/e1/responses/p2")), { ...answer("no", "player"), playerId: "p2" }));
  // Die Regeln der eigenen Teams gelten nicht für ein Team mit ähnlicher ID.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "teams/u17/members/coach"), { role: "trainer" });
    await setDoc(doc(ctx.firestore(), "teams/u17/players/p2"), { name: "p2", consentStatus: "pending" });
  });
  await assertFails(setDoc(doc(db, "teams/u17/players/p2/absences/a1"), { playerId: "p2", label: "x" }));
});

test("Fremder Verein mit dokumentierter Einwilligung: Gesundheitsdaten speicherbar", async () => {
  const db = as("coach");
  await assertSucceeds(setDoc(doc(db, p(FOREIGN, "players/p3/absences/a2")), { playerId: "p3", label: "Grippe" }));
  await assertSucceeds(setDoc(doc(db, p(FOREIGN, "players/p3/measurements/m2")), { playerId: "p3", weight: 60 }));
  await assertSucceeds(setDoc(doc(db, p(FOREIGN, "players/p3")), { status: "Angeschlagen", injuryUntil: "" }, { merge: true }));
  await assertSucceeds(setDoc(doc(as("parent2"), p(FOREIGN, "events/e1/responses/p2")), { ...answer("no", "parent"), playerId: "p2" }));
  // Einwilligung dokumentieren und im selben Schreibvorgang eine Verletzung eintragen.
  const batch = writeBatch(db);
  batch.set(doc(db, p(FOREIGN, "players/p2")), { consentStatus: "granted", consentByUid: "coach", consentBy: "trainer@example.test" }, { merge: true });
  batch.set(doc(db, p(FOREIGN, "players/p2/absences/a2")), { playerId: "p2", label: "Grippe" });
  await assertSucceeds(batch.commit());
  await assertSucceeds(setDoc(doc(as("pl2"), p(FOREIGN, "events/e1/responses/p2")), { ...answer("no", "player", "krank"), playerId: "p2" }));
});

test("Wer die Einwilligung dokumentiert, trägt sich selbst ein", async () => {
  for (const team of [OWN, FOREIGN]) {
    const db = as("coach");
    await assertFails(setDoc(doc(db, p(team, "players/p2")), { consentStatus: "granted" }, { merge: true }));
    await assertFails(setDoc(doc(db, p(team, "players/p2")), { consentStatus: "granted", consentByUid: "jemand-anders" }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, p(team, "players/p2")), { consentStatus: "granted", consentByUid: "coach", consentBy: "trainer@example.test" }, { merge: true }));
    // Schon dokumentiert: andere Änderungen brauchen keinen neuen Eintrag.
    await assertSucceeds(setDoc(doc(db, p(team, "players/p3")), { name: "Neu" }, { merge: true }));
    await assertFails(setDoc(doc(db, p(team, "players/p10")), { name: "neu", status: "Fit", consentStatus: "granted" }));
    await assertSucceeds(setDoc(doc(db, p(team, "players/p10")), { name: "neu", status: "Fit", consentStatus: "granted", consentByUid: "coach" }));
    // Nur Trainer schreiben Spielerdokumente.
    await assertFails(setDoc(doc(as("pl2"), p(team, "players/p2")), { consentStatus: "granted", consentByUid: "pl2" }, { merge: true }));
  }
});
