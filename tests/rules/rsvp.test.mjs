// Emulator-Tests: Zu-/Absagen (SCRUM-175) unter events/{eventId}/responses/{playerId}.
// Spieler und Eltern schreiben nur die Rueckmeldung des eigenen Spielers, nur erlaubte Felder; lesen duerfen
// sie nur der Trainer und der eigene Spieler/die eigenen Eltern (der Grund kann ein Gesundheitsdatum sein).
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

const TEAM = "TESTTEAM";
const t = (path) => `teams/${TEAM}/${path}`;
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rsvp",
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
      medic: { role: "physio" },
      scout: { role: "scout" },
      pl1: { role: "player", playerId: "p1", expiresAt: null },
      parent1: { role: "parent", playerId: "p1", expiresAt: null },
      pl2: { role: "player", playerId: "p2", expiresAt: null },
      oldpl: { role: "player", playerId: "p1", expiresAt: Timestamp.fromMillis(Date.now() - 86_400_000) }
    };
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
    await setDoc(doc(db, t("events/e1")), { title: "Training", date: "2026-11-03" });
    await setDoc(doc(db, t("events/e1/responses/p2")), { playerId: "p2", status: "no", reason: "Familienfeier", by: "player", updatedAt: Timestamp.now() });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const response = (uid, playerId = "p1", eventId = "e1") => doc(as(uid), t(`events/${eventId}/responses/${playerId}`));
const answer = (status, by, extra = {}) => ({ playerId: "p1", status, reason: "", by, updatedAt: serverTimestamp(), ...extra });

test("Spieler und Eltern sagen für den eigenen Spieler zu, ab und wieder zu", async () => {
  await assertSucceeds(setDoc(response("pl1"), answer("no", "player", { reason: "Familienfeier" })));
  await assertSucceeds(setDoc(response("pl1"), answer("yes", "player")));
  await assertSucceeds(setDoc(response("parent1"), answer("no", "parent")));
  await assertSucceeds(getDoc(response("pl1")));
  await assertSucceeds(getDoc(response("parent1")));
});

test("Niemand antwortet für einen fremden Spieler", async () => {
  await assertFails(setDoc(response("pl2", "p1"), answer("no", "player")));
  await assertFails(setDoc(response("pl1", "p2"), { ...answer("yes", "player"), playerId: "p2" }));
  await assertFails(setDoc(response("pl1", "p2"), answer("yes", "player")));
  await assertFails(setDoc(response("parent1", "p2"), { ...answer("yes", "parent"), playerId: "p2" }));
  for (const uid of [null, "fremd", "oldpl", "medic", "scout", "coach"]) {
    await assertFails(setDoc(response(uid), answer("yes", "player")));
  }
});

test("Nur erlaubte Felder und Werte", async () => {
  await assertFails(setDoc(response("pl1"), answer("vielleicht", "player")));
  await assertFails(setDoc(response("pl1"), answer("yes", "player", { attendance: "present" })));
  await assertFails(setDoc(response("pl1"), answer("no", "player", { reason: "x".repeat(201) })));
  await assertFails(setDoc(response("pl1"), answer("yes", "player", { reason: "Grund bei Zusage" })));
  await assertFails(setDoc(response("pl1"), answer("no", "player", { reason: 3 })));
  // "by" muss zur eigenen Rolle passen: ein Spieler gibt sich nicht als Eltern aus und umgekehrt.
  await assertFails(setDoc(response("pl1"), answer("yes", "parent")));
  await assertFails(setDoc(response("parent1"), answer("yes", "player")));
  // Zeitstempel kommt vom Server.
  await assertFails(setDoc(response("pl1"), answer("yes", "player", { updatedAt: Timestamp.fromMillis(0) })));
  // Nur für ein bestehendes Event.
  await assertFails(setDoc(response("pl1", "p1", "gibtsnicht"), answer("yes", "player")));
  await assertSucceeds(setDoc(response("pl1"), answer("no", "player", { reason: "x".repeat(200) })));
});

test("Rückmeldungen lesen nur Trainer und der eigene Spieler bzw. die eigenen Eltern", async () => {
  await assertSucceeds(getDoc(doc(as("coach"), t("events/e1/responses/p2"))));
  await assertSucceeds(getDocs(collection(as("coach"), t("events/e1/responses"))));
  await assertSucceeds(getDoc(doc(as("pl2"), t("events/e1/responses/p2"))));
  for (const uid of ["pl1", "parent1", "medic", "scout", "oldpl", "fremd", null]) {
    await assertFails(getDoc(doc(as(uid), t("events/e1/responses/p2"))));
  }
  for (const uid of ["pl1", "parent1", "pl2", "medic", "scout"]) {
    await assertFails(getDocs(collection(as(uid), t("events/e1/responses"))));
  }
});

test("Löschen darf nur der Trainer; Bewertungen schreiben Spieler weiterhin nicht", async () => {
  await assertFails(deleteDoc(doc(as("pl2"), t("events/e1/responses/p2"))));
  await assertFails(setDoc(doc(as("pl1"), t("events/e1/ratings/p1")), { playerId: "p1", attendance: "absent" }));
  await assertSucceeds(deleteDoc(doc(as("coach"), t("events/e1/responses/p2"))));
});
