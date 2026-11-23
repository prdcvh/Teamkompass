// Emulator-Tests: Lernpfade mit Kompetenzstufen (SCRUM-192) unter teams/{teamId}/learningPaths/{pathId} (Inhalt) und
// teams/{teamId}/learningProgress/{playerId} (bestaetigte Stufen eines Spielers).
// PO-Entscheidung A (02.11.2026): der Trainer legt Pfade an und bestaetigt Stufen. Spieler und Eltern lesen die Pfade des
// Teams und NUR den eigenen Fortschritt; Medizin, Scout, abgelaufene Zugaenge, Fremde und andere Teams nichts.
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, writeBatch } from "firebase/firestore";

const TEAM = "TESTTEAM";
const OTHER = "ANDERESTEAM";
const t = (path, team = TEAM) => `teams/${team}/${path}`;
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-learning",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const level = (id) => ({ id, title: `Stufe ${id}`, unit: "Kurz ueben", minutes: 3, url: null, homeTask: "" });
const path = { title: "Torwart: Fangen", position: "TW", ageGroup: "U14", levels: [level("l1"), level("l2")] };
const progress = (playerId, levels) => ({ playerId, paths: { lp1: levels } });

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
      parent1: { role: "parent", playerId: "p1", expiresAt: null },
      pl2: { role: "player", playerId: "p2", expiresAt: null },
      oldpl: { role: "player", playerId: "p1", expiresAt: Timestamp.fromMillis(Date.now() - 86_400_000) }
    };
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
    await setDoc(doc(db, t("members/otherCoach", OTHER)), { role: "trainer" });
    await setDoc(doc(db, t("members/otherPl", OTHER)), { role: "player", playerId: "p1", expiresAt: null });
    // p1 mit widerrufener Einwilligung: Lernfortschritt ist kein Gesundheitsdatum und bleibt lesbar.
    await setDoc(doc(db, t("players/p1")), { name: "Eins", consentStatus: "revoked" });
    await setDoc(doc(db, t("players/p2")), { name: "Zwei" });
    await setDoc(doc(db, t("learningPaths/lp1")), { ...path, updatedAt: Timestamp.now() });
    await setDoc(doc(db, t("learningProgress/p1")), { ...progress("p1", { l1: "2026-10-13" }), updatedAt: Timestamp.now() });
    await setDoc(doc(db, t("learningProgress/p2")), { ...progress("p2", { l1: "2026-10-20", l2: "2026-10-27" }), updatedAt: Timestamp.now() });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

test("Trainer liest, legt an, aendert und loescht Lernpfade", async () => {
  const db = as("coach");
  await assertSucceeds(getDoc(doc(db, t("learningPaths/lp1"))));
  await assertSucceeds(getDocs(collection(db, t("learningPaths"))));
  await assertSucceeds(setDoc(doc(db, t("learningPaths/lp2")), { ...path, title: "Neu", updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, t("learningPaths/lp2")), { ...path, title: "Geaendert", position: "", ageGroup: "", updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(db, t("learningPaths/lp2"))));
});

test("Lernpfade: nur die vorgesehenen Felder, Name 1-120 Zeichen, hoechstens 12 Stufen, Zeitpunkt vom Server", async () => {
  const ref = doc(as("coach"), t("learningPaths/lp3"));
  await assertFails(setDoc(ref, { ...path, updatedAt: serverTimestamp(), note: "geheim" }));
  await assertFails(setDoc(ref, { ...path, title: "", updatedAt: serverTimestamp() }));
  await assertFails(setDoc(ref, { ...path, title: "x".repeat(121), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(ref, { ...path, position: "x".repeat(41), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(ref, { ...path, levels: "keine Liste", updatedAt: serverTimestamp() }));
  await assertFails(setDoc(ref, { ...path, levels: Array.from({ length: 13 }, (_, i) => level(`l${i}`)), updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(ref, { ...path, levels: Array.from({ length: 12 }, (_, i) => level(`l${i}`)), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(ref, { ...path, updatedAt: Timestamp.fromMillis(0) }));
});

test("Spieler und Eltern lesen die Lernpfade des Teams, schreiben aber keine", async () => {
  for (const uid of ["pl1", "parent1", "pl2"]) {
    const db = as(uid);
    await assertSucceeds(getDoc(doc(db, t("learningPaths/lp1"))));
    await assertSucceeds(getDocs(collection(db, t("learningPaths"))));
    await assertFails(setDoc(doc(db, t("learningPaths/lp9")), { ...path, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, t("learningPaths/lp1")), { ...path, title: "Gekapert", updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, t("learningPaths/lp1"))));
  }
});

test("Spieler und Eltern lesen nur den eigenen Fortschritt - nie den eines anderen Spielers, nie als Liste", async () => {
  for (const uid of ["pl1", "parent1"]) {
    const db = as(uid);
    await assertSucceeds(getDoc(doc(db, t("learningProgress/p1"))));
    await assertFails(getDoc(doc(db, t("learningProgress/p2"))));
    await assertFails(getDocs(collection(db, t("learningProgress"))));
  }
  const db2 = as("pl2");
  await assertSucceeds(getDoc(doc(db2, t("learningProgress/p2"))));
  await assertFails(getDoc(doc(db2, t("learningProgress/p1"))));
});

test("Noch kein Fortschritt: der eigene (nicht vorhandene) Eintrag ist lesbar, ein fremder nicht", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), t("learningProgress/p1"))); });
  await assertSucceeds(getDoc(doc(as("pl1"), t("learningProgress/p1"))));
  await assertFails(getDoc(doc(as("pl2"), t("learningProgress/p1"))));
});

test("Spieler und Eltern bestaetigen keine Stufen - weder fuer sich noch fuer andere", async () => {
  for (const uid of ["pl1", "parent1"]) {
    const db = as(uid);
    await assertFails(setDoc(doc(db, t("learningProgress/p1")), { playerId: "p1", paths: { lp1: { l2: "2026-11-03" } }, updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(db, t("learningProgress/p2")), { playerId: "p2", paths: { lp1: { l1: deleteField() } }, updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(deleteDoc(doc(db, t("learningProgress/p1"))));
  }
});

test("Trainer liest den Fortschritt aller Spieler, bestaetigt und nimmt zurueck", async () => {
  const db = as("coach");
  await assertSucceeds(getDocs(collection(db, t("learningProgress"))));
  await assertSucceeds(getDoc(doc(db, t("learningProgress/p2"))));
  const ref = doc(db, t("learningProgress/p1"));
  await assertSucceeds(setDoc(ref, { playerId: "p1", paths: { lp1: { l2: "2026-11-03" } }, updatedAt: serverTimestamp() }, { merge: true }));
  await assertSucceeds(setDoc(ref, { playerId: "p1", paths: { lp1: { l2: deleteField() } }, updatedAt: serverTimestamp() }, { merge: true }));
  // Erster Eintrag fuer einen Spieler ohne Fortschritt.
  await assertSucceeds(setDoc(doc(db, t("learningProgress/p3")), { playerId: "p3", paths: { lp1: { l1: "2026-11-03" } }, updatedAt: serverTimestamp() }, { merge: true }));
  await assertSucceeds(deleteDoc(doc(db, t("learningProgress/p3"))));
});

test("Fortschritt: playerId muss zur Dokument-ID passen, nur die vorgesehenen Felder, Zeitpunkt vom Server", async () => {
  const db = as("coach");
  await assertFails(setDoc(doc(db, t("learningProgress/p1")), { playerId: "p2", paths: {}, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, t("learningProgress/p1")), { playerId: "p1", paths: {}, grade: 1, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, t("learningProgress/p1")), { playerId: "p1", paths: "x", updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, t("learningProgress/p1")), { playerId: "p1", paths: {}, updatedAt: Timestamp.fromMillis(0) }));
});

test("Pfad loeschen und Bestaetigungen entfernen in einem Schreibvorgang (wie die App)", async () => {
  const db = as("coach");
  const batch = writeBatch(db);
  for (const p of ["p1", "p2"]) batch.set(doc(db, t(`learningProgress/${p}`)), { playerId: p, paths: { lp1: deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
  batch.delete(doc(db, t("learningPaths/lp1")));
  await assertSucceeds(batch.commit());
});

test("Medizin, Scout, abgelaufene Zugaenge, Fremde und Nicht-Angemeldete: weder Pfade noch Fortschritt", async () => {
  for (const uid of ["medic", "scout", "legacyScout", "oldpl", "oldCoach", "fremd", null]) {
    const db = as(uid);
    await assertFails(getDoc(doc(db, t("learningPaths/lp1"))));
    await assertFails(getDocs(collection(db, t("learningPaths"))));
    await assertFails(getDoc(doc(db, t("learningProgress/p1"))));
    await assertFails(getDocs(collection(db, t("learningProgress"))));
    await assertFails(setDoc(doc(db, t("learningPaths/lp9")), { ...path, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, t("learningProgress/p1")), { playerId: "p1", paths: {}, updatedAt: serverTimestamp() }));
  }
});

test("Andere Teams: Trainer und Spieler eines fremden Teams erreichen nichts (auch nicht mit gleicher playerId)", async () => {
  for (const uid of ["otherCoach", "otherPl"]) {
    const db = as(uid);
    await assertFails(getDoc(doc(db, t("learningPaths/lp1"))));
    await assertFails(getDoc(doc(db, t("learningProgress/p1"))));
    await assertFails(setDoc(doc(db, t("learningProgress/p1")), { playerId: "p1", paths: {}, updatedAt: serverTimestamp() }));
  }
});
