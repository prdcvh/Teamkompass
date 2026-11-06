// Emulator-Tests: Situationsraetsel aus Spielszenen (SCRUM-193) unter teams/{teamId}/puzzles (Szene ohne Loesung),
// puzzleSolutions (richtige Antwort + Erklaerung) und puzzleAnswers/{puzzleId}_{playerId} (die eine Antwort eines Spielers).
// Kern: Spieler lesen die Loesung erst nach der eigenen Antwort, antworten nur fuer sich, nur einmal und aendern nichts;
// Eltern lesen mit, antworten aber nicht; Medizin, Scout, abgelaufene Zugaenge, Fremde und andere Teams nichts.
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";

const TEAM = "TESTTEAM";
const OTHER = "ANDERESTEAM";
const t = (path, team = TEAM) => `teams/${team}/${path}`;
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-puzzles",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const puzzle = {
  title: "Konter nach Ballgewinn",
  question: "Wohin passt du?",
  media: "video",
  mediaUrl: "https://www.youtube.com/watch?v=abc",
  videoStart: 83,
  answers: ["Kurz zum Sechser", "Lang auf die offene Seite", "Ball halten"],
  level: 3
};
const solution = { correct: 1, explanation: "Die offene Seite ist frei." };
const answer = (playerId, choice = 1, puzzleId = "r1") => ({ puzzleId, playerId, choice, by: "player", answeredAt: serverTimestamp() });

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
      parent2: { role: "parent", playerId: "p2", expiresAt: null },
      oldpl: { role: "player", playerId: "p3", expiresAt: Timestamp.fromMillis(Date.now() - 86_400_000) }
    };
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
    await setDoc(doc(db, t("members/otherCoach", OTHER)), { role: "trainer" });
    await setDoc(doc(db, t("members/otherPl", OTHER)), { role: "player", playerId: "p2", expiresAt: null });
    await setDoc(doc(db, t("puzzles/r1")), { ...puzzle, updatedAt: Timestamp.now() });
    await setDoc(doc(db, t("puzzleSolutions/r1")), { ...solution, updatedAt: Timestamp.now() });
    // p1 hat r1 schon beantwortet, p2 noch nicht.
    await setDoc(doc(db, t("puzzleAnswers/r1_p1")), { puzzleId: "r1", playerId: "p1", choice: 0, by: "player", answeredAt: Timestamp.now() });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

test("Trainer legt Raetsel mit Loesung an, aendert und loescht es samt Antworten", async () => {
  const db = as("coach");
  await assertSucceeds(getDocs(collection(db, t("puzzles"))));
  await assertSucceeds(getDocs(collection(db, t("puzzleSolutions"))));
  await assertSucceeds(getDocs(collection(db, t("puzzleAnswers"))));
  const batch = writeBatch(db);
  batch.set(doc(db, t("puzzles/r2")), { ...puzzle, media: "image", mediaUrl: "https://example.org/szene.jpg", videoStart: null, level: 1, updatedAt: serverTimestamp() });
  batch.set(doc(db, t("puzzleSolutions/r2")), { ...solution, updatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  await assertSucceeds(setDoc(doc(db, t("puzzles/r2")), { ...puzzle, title: "Geaendert", answers: ["A", "B"], updatedAt: serverTimestamp() }));
  const del = writeBatch(db);
  del.delete(doc(db, t("puzzleAnswers/r1_p1")));
  del.delete(doc(db, t("puzzleSolutions/r1")));
  del.delete(doc(db, t("puzzles/r1")));
  await assertSucceeds(del.commit());
});

test("Raetsel: nur die vorgesehenen Felder, https-Link, 2-4 Antworten, Schwierigkeit 1-3, Zeitpunkt vom Server", async () => {
  const ref = doc(as("coach"), t("puzzles/r3"));
  const ok = { ...puzzle, updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(ref, ok));
  await assertFails(setDoc(ref, { ...ok, correct: 1 })); // Loesung gehoert nicht ins Raetsel
  await assertFails(setDoc(ref, { ...ok, title: "" }));
  await assertFails(setDoc(ref, { ...ok, mediaUrl: "http://example.org/x.jpg" }));
  await assertFails(setDoc(ref, { ...ok, mediaUrl: "javascript:alert(1)" }));
  await assertFails(setDoc(ref, { ...ok, media: "audio" }));
  await assertFails(setDoc(ref, { ...ok, answers: ["nur eine"] }));
  await assertFails(setDoc(ref, { ...ok, answers: ["A", "B", "C", "D", "E"] }));
  await assertFails(setDoc(ref, { ...ok, level: 4 }));
  await assertFails(setDoc(ref, { ...ok, videoStart: -1 }));
  await assertFails(setDoc(ref, { ...ok, updatedAt: Timestamp.fromMillis(0) }));
  const sol = doc(as("coach"), t("puzzleSolutions/r3"));
  await assertSucceeds(setDoc(sol, { ...solution, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(sol, { ...solution, correct: 4, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(sol, { ...solution, explanation: "x".repeat(1001), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(sol, { ...solution, note: "x", updatedAt: serverTimestamp() }));
});

test("Spieler und Eltern lesen die Raetsel, aendern sie aber nicht", async () => {
  for (const uid of ["pl1", "parent1", "pl2"]) {
    const db = as(uid);
    await assertSucceeds(getDoc(doc(db, t("puzzles/r1"))));
    await assertSucceeds(getDocs(collection(db, t("puzzles"))));
    await assertFails(setDoc(doc(db, t("puzzles/r9")), { ...puzzle, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, t("puzzles/r1")), { title: "Gekapert", updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, t("puzzles/r1"))));
    await assertFails(setDoc(doc(db, t("puzzleSolutions/r1")), { correct: 0, explanation: "", updatedAt: serverTimestamp() }));
  }
});

test("Loesung erst nach der eigenen Antwort - nie als Liste, nie vorher", async () => {
  // p1 hat beantwortet: Spieler und Eltern lesen die Loesung.
  await assertSucceeds(getDoc(doc(as("pl1"), t("puzzleSolutions/r1"))));
  await assertSucceeds(getDoc(doc(as("parent1"), t("puzzleSolutions/r1"))));
  // p2 noch nicht: weder Spieler noch Eltern.
  await assertFails(getDoc(doc(as("pl2"), t("puzzleSolutions/r1"))));
  await assertFails(getDoc(doc(as("parent2"), t("puzzleSolutions/r1"))));
  for (const uid of ["pl1", "parent1", "pl2"]) await assertFails(getDocs(collection(as(uid), t("puzzleSolutions"))));
  // Nach der Antwort klappt es.
  await assertSucceeds(setDoc(doc(as("pl2"), t("puzzleAnswers/r1_p2")), answer("p2")));
  await assertSucceeds(getDoc(doc(as("pl2"), t("puzzleSolutions/r1"))));
});

test("Spieler antwortet einmal, nur fuer sich, nur mit einer vorhandenen Antwort", async () => {
  const db = as("pl2");
  await assertFails(setDoc(doc(db, t("puzzleAnswers/r1_p1")), answer("p1"))); // fuer einen anderen
  await assertFails(setDoc(doc(db, t("puzzleAnswers/r1_p2")), answer("p1"))); // falsche playerId
  await assertFails(setDoc(doc(db, t("puzzleAnswers/x_p2")), answer("p2"))); // ID passt nicht
  await assertFails(setDoc(doc(db, t("puzzleAnswers/r9_p2")), answer("p2", 0, "r9"))); // Raetsel gibt es nicht
  await assertFails(setDoc(doc(db, t("puzzleAnswers/r1_p2")), answer("p2", 3))); // nur 3 Antworten (0-2)
  await assertFails(setDoc(doc(db, t("puzzleAnswers/r1_p2")), answer("p2", -1)));
  await assertFails(setDoc(doc(db, t("puzzleAnswers/r1_p2")), { ...answer("p2"), choice: "1" }));
  await assertFails(setDoc(doc(db, t("puzzleAnswers/r1_p2")), { ...answer("p2"), rating: 2000 })); // keine Wertung schreiben
  await assertFails(setDoc(doc(db, t("puzzleAnswers/r1_p2")), { ...answer("p2"), by: "trainer" }));
  await assertFails(setDoc(doc(db, t("puzzleAnswers/r1_p2")), { ...answer("p2"), answeredAt: Timestamp.fromMillis(0) }));
  await assertSucceeds(setDoc(doc(db, t("puzzleAnswers/r1_p2")), answer("p2", 2)));
  // Keine zweite Chance nach der Erklaerung: aendern und loeschen geht nicht.
  await assertFails(setDoc(doc(db, t("puzzleAnswers/r1_p2")), answer("p2", 1)));
  await assertFails(updateDoc(doc(db, t("puzzleAnswers/r1_p2")), { choice: 1 }));
  await assertFails(deleteDoc(doc(db, t("puzzleAnswers/r1_p2"))));
});

test("Eltern antworten nicht fuer ihr Kind", async () => {
  await assertFails(setDoc(doc(as("parent2"), t("puzzleAnswers/r1_p2")), answer("p2")));
  await assertFails(setDoc(doc(as("parent2"), t("puzzleAnswers/r1_p2")), { ...answer("p2"), by: "parent" }));
});

test("Antworten lesen: Trainer alle, Spieler und Eltern nur die eigenen (Liste nur mit Filter)", async () => {
  await assertSucceeds(getDocs(collection(as("coach"), t("puzzleAnswers"))));
  for (const uid of ["pl1", "parent1"]) {
    const db = as(uid);
    await assertSucceeds(getDoc(doc(db, t("puzzleAnswers/r1_p1"))));
    await assertSucceeds(getDocs(query(collection(db, t("puzzleAnswers")), where("playerId", "==", "p1"))));
    await assertFails(getDocs(collection(db, t("puzzleAnswers"))));
    await assertFails(getDocs(query(collection(db, t("puzzleAnswers")), where("playerId", "==", "p2"))));
  }
  await assertFails(getDoc(doc(as("pl2"), t("puzzleAnswers/r1_p1"))));
  await assertFails(getDoc(doc(as("parent2"), t("puzzleAnswers/r1_p1"))));
});

test("Medizin, Scout, abgelaufene Zugaenge, Fremde und Nicht-Angemeldete: nichts", async () => {
  for (const uid of ["medic", "scout", "legacyScout", "oldpl", "oldCoach", "fremd", null]) {
    const db = as(uid);
    await assertFails(getDoc(doc(db, t("puzzles/r1"))));
    await assertFails(getDocs(collection(db, t("puzzles"))));
    await assertFails(getDoc(doc(db, t("puzzleSolutions/r1"))));
    await assertFails(getDocs(collection(db, t("puzzleAnswers"))));
    await assertFails(getDoc(doc(db, t("puzzleAnswers/r1_p1"))));
    await assertFails(setDoc(doc(db, t("puzzles/r9")), { ...puzzle, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, t("puzzleAnswers/r1_p3")), answer("p3")));
  }
});

test("Andere Teams: Trainer und Spieler eines fremden Teams erreichen nichts (auch nicht mit gleicher playerId)", async () => {
  for (const uid of ["otherCoach", "otherPl"]) {
    const db = as(uid);
    await assertFails(getDoc(doc(db, t("puzzles/r1"))));
    await assertFails(getDoc(doc(db, t("puzzleSolutions/r1"))));
    await assertFails(getDocs(query(collection(db, t("puzzleAnswers")), where("playerId", "==", "p2"))));
    await assertFails(setDoc(doc(db, t("puzzleAnswers/r1_p2")), answer("p2")));
  }
});
