// Emulator-Tests: Zusammenfassung je Spieler (SCRUM-201) unter teams/{teamId}/playerStats/{playerId} und das
// Kennzeichen meta/playerStats. Nur Trainer lesen/schreiben; alle anderen Rollen gar nicht (auch nicht die eigene).
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, writeBatch, Timestamp } from "firebase/firestore";

const TEAM = "TESTTEAM";
const t = (path) => `teams/${TEAM}/${path}`;
let env;

const entry = { attendance: "present", effort: 2, technique: 3, tactics: 2, comprehension: 1, minutes: 60, goals: 1, assists: null };
const summary = (playerId, events = { e1: entry }) => ({ playerId, version: 1, events });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-player-stats",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = {
      coach: { role: "trainer" },
      oldCoach: { role: "trainer", expiresAt: Timestamp.fromMillis(Date.now() - 86_400_000) },
      medic: { role: "physio" },
      scout: { role: "scout" },
      legacyScout: { role: "medical" },
      pl1: { role: "player", playerId: "p1", expiresAt: null },
      parent1: { role: "parent", playerId: "p1", expiresAt: null }
    };
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
    await setDoc(doc(db, t("events/e1")), { title: "Training" });
    for (const id of ["p1", "p2"]) await setDoc(doc(db, t(`playerStats/${id}`)), summary(id));
    await setDoc(doc(db, t("meta/playerStats")), { version: 1, builtAt: "2026-10-21T20:00:00.000Z" });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

test("Trainer liest, schreibt und löscht Zusammenfassungen und das Kennzeichen", async () => {
  const db = as("coach");
  await assertSucceeds(getDoc(doc(db, t("playerStats/p1"))));
  await assertSucceeds(getDocs(collection(db, t("playerStats"))));
  await assertSucceeds(getDoc(doc(db, t("meta/playerStats"))));
  await assertSucceeds(setDoc(doc(db, t("playerStats/p3")), summary("p3")));
  await assertSucceeds(setDoc(doc(db, t("playerStats/p1")), summary("p1", { e2: entry }), { merge: true }));
  await assertSucceeds(setDoc(doc(db, t("meta/playerStats")), { version: 1, builtAt: "2026-10-22T08:00:00.000Z" }));
  await assertSucceeds(deleteDoc(doc(db, t("playerStats/p2"))));
});

test("Bewertung und Zusammenfassung gehen in einem Schreibvorgang (auch Eintrag löschen beim Event-Löschen)", async () => {
  const db = as("coach");
  const save = writeBatch(db);
  save.set(doc(db, t("events/e1/ratings/p1")), { attendance: "absent", grade: "", effort: "", technique: "", tactics: "", comprehension: "", minutes: "", goals: "", assists: "", note: "", playerId: "p1" }, { merge: true });
  save.set(doc(db, t("playerStats/p1")), summary("p1", { e1: { ...entry, attendance: "absent", effort: null, technique: null, tactics: null, comprehension: null, minutes: null, goals: null } }), { merge: true });
  await assertSucceeds(save.commit());
  // "merge" ersetzt den Eintrag des Events vollständig (alle Felder werden geschrieben, fehlend = null) und lässt die
  // Einträge anderer Events stehen - darauf verlässt sich das laufende Mitschreiben.
  const after = (await getDoc(doc(db, t("playerStats/p1")))).data();
  assert.deepEqual(after.events.e1, { attendance: "absent", effort: null, technique: null, tactics: null, comprehension: null, minutes: null, goals: null, assists: null });
  const remove = writeBatch(db);
  remove.delete(doc(db, t("events/e1/ratings/p1")));
  remove.set(doc(db, t("playerStats/p1")), { playerId: "p1", version: 1, events: { e1: deleteField() } }, { merge: true });
  await assertSucceeds(remove.commit());
  assert.deepEqual((await getDoc(doc(db, t("playerStats/p1")))).data().events, {});
});

test("Falsches Format wird abgelehnt (fremde Felder, falsche playerId, falsche Typen)", async () => {
  const db = as("coach");
  await assertFails(setDoc(doc(db, t("playerStats/p1")), { ...summary("p1"), note: "Rückmeldung" }));
  await assertFails(setDoc(doc(db, t("playerStats/p1")), summary("p2")));
  await assertFails(setDoc(doc(db, t("playerStats/p1")), { playerId: "p1", version: "1", events: {} }));
  await assertFails(setDoc(doc(db, t("playerStats/p1")), { playerId: "p1", version: 1, events: [] }));
  await assertFails(setDoc(doc(db, t("playerStats/p9")), { events: { e1: entry } }, { merge: true }));
});

test("Spieler und Eltern lesen keine Zusammenfassung – auch nicht die eigene – und schreiben nichts", async () => {
  for (const uid of ["pl1", "parent1"]) {
    const db = as(uid);
    await assertFails(getDoc(doc(db, t("playerStats/p1"))));
    await assertFails(getDoc(doc(db, t("playerStats/p2"))));
    await assertFails(getDocs(collection(db, t("playerStats"))));
    await assertFails(getDoc(doc(db, t("meta/playerStats"))));
    await assertFails(setDoc(doc(db, t("playerStats/p1")), summary("p1")));
    await assertFails(deleteDoc(doc(db, t("playerStats/p1"))));
    await assertFails(setDoc(doc(db, t("meta/playerStats")), { version: 1, builtAt: "x" }));
  }
});

test("Medizin, Scouts, abgelaufene Zugänge, Nicht-Mitglieder und Gäste haben keinen Zugriff", async () => {
  for (const uid of ["medic", "scout", "legacyScout", "oldCoach", "fremd", null]) {
    const db = as(uid);
    await assertFails(getDoc(doc(db, t("playerStats/p1"))));
    await assertFails(getDocs(collection(db, t("playerStats"))));
    await assertFails(getDoc(doc(db, t("meta/playerStats"))));
    await assertFails(setDoc(doc(db, t("playerStats/p1")), summary("p1")));
    await assertFails(setDoc(doc(db, t("meta/playerStats")), { version: 1, builtAt: "x" }));
  }
});
