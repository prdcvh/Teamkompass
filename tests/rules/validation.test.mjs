// Emulator-Tests: Eingabevalidierung in den Regeln (SCRUM-63).
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, writeBatch, serverTimestamp, Timestamp } from "firebase/firestore";

const TEAM = "TESTTEAM";
const t = (path) => `teams/${TEAM}/${path}`;
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-validation",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, t("members/pl1")), { role: "player", playerId: "p1", expiresAt: null });
    await setDoc(doc(db, t("players/p1/developmentPlans/f1")), { playerId: "p1", focus: "x", selfReflection: "", selfReflectionAt: "" });
    await setDoc(doc(db, t("invites/code1")), { role: "player", playerId: "p1", expiresAt: null });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

test("Selbstreflexion: Text bis 400 Zeichen und ISO-Zeitpunkt sind erlaubt", async () => {
  const plan = doc(as("pl1"), t("players/p1/developmentPlans/f1"));
  await assertSucceeds(updateDoc(plan, { selfReflection: "a".repeat(400), selfReflectionAt: new Date().toISOString() }));
});

test("Selbstreflexion: zu langer Text, falsche Typen und lange Zeitangaben werden abgewiesen", async () => {
  const plan = doc(as("pl1"), t("players/p1/developmentPlans/f1"));
  await assertFails(updateDoc(plan, { selfReflection: "a".repeat(401), selfReflectionAt: "2026-10-12" }));
  await assertFails(updateDoc(plan, { selfReflection: 42, selfReflectionAt: "2026-10-12" }));
  await assertFails(updateDoc(plan, { selfReflection: "ok", selfReflectionAt: Timestamp.now() }));
  await assertFails(updateDoc(plan, { selfReflection: "ok", selfReflectionAt: "x".repeat(41) }));
});

function claim(db, uid, extra = {}, createdAt = serverTimestamp()) {
  const batch = writeBatch(db);
  const data = { role: "player", playerId: "p1", claimedInviteCode: "code1", expiresAt: null, createdAt, ...extra };
  if (createdAt === null) delete data.createdAt;
  batch.set(doc(db, t(`members/${uid}`)), data);
  batch.delete(doc(db, t("invites/code1")));
  return batch.commit();
}

test("Einladung einlösen: genau die vorgesehenen Felder mit Server-Zeitstempel", async () => {
  await assertSucceeds(claim(as("neu1"), "neu1"));
});

test("Einladung einlösen: Zusatzfelder und selbst gesetzter Zeitstempel werden abgewiesen", async () => {
  await assertFails(claim(as("neu2"), "neu2", { isAdmin: true }));
  await assertFails(claim(as("neu3"), "neu3", {}, Timestamp.fromMillis(0)));
  await assertFails(claim(as("neu4"), "neu4", {}, null));
});
