// Emulator-Tests fuer den Einmalverbrauch von Einladungscodes (SCRUM-77).
// Starten: siehe tests/rules/README.md (braucht Java 21 + firebase-tools; in der CI: .github/workflows/rules-tests.yml).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from "firebase/firestore";

const TEAM = "TESTTEAM";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-invite-claim",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function seedInvite(code, extra = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `teams/${TEAM}/invites/${code}`), {
      role: "player", playerId: "p1", expiresAt: null, ...extra
    });
  });
}

function claim(db, uid, code, member = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, `teams/${TEAM}/members/${uid}`), {
    role: "player", playerId: "p1", claimedInviteCode: code, expiresAt: null, createdAt: serverTimestamp(), ...member
  });
  batch.delete(doc(db, `teams/${TEAM}/invites/${code}`));
  return batch.commit();
}

test("gueltiger Erst-Claim (Mitglied + Code loeschen im Batch) gelingt", async () => {
  await seedInvite("abc");
  await assertSucceeds(claim(env.authenticatedContext("u1").firestore(), "u1", "abc"));
});

test("zweiter Claim mit demselben Code scheitert, weil der Code verbraucht ist", async () => {
  await seedInvite("abc");
  await assertSucceeds(claim(env.authenticatedContext("u1").firestore(), "u1", "abc"));
  await assertFails(claim(env.authenticatedContext("u2").firestore(), "u2", "abc"));
});

test("members-Create ohne Loeschen des Codes wird abgewiesen", async () => {
  await seedInvite("abc");
  const db = env.authenticatedContext("u1").firestore();
  await assertFails(setDoc(doc(db, `teams/${TEAM}/members/u1`), {
    role: "player", playerId: "p1", claimedInviteCode: "abc", expiresAt: null, createdAt: serverTimestamp()
  }));
});

test("members-Create fuer nicht vorhandenen Code wird abgewiesen", async () => {
  const db = env.authenticatedContext("u1").firestore();
  await assertFails(claim(db, "u1", "gibtsnicht"));
});

test("abgelaufener Code wird abgewiesen", async () => {
  await seedInvite("alt", { expiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
  await assertFails(claim(env.authenticatedContext("u1").firestore(), "u1", "alt", {
    expiresAt: Timestamp.fromMillis(Date.now() - 60_000)
  }));
});

test("Code fuer anderen Spieler / andere Rolle wird abgewiesen", async () => {
  await seedInvite("abc");
  const db = env.authenticatedContext("u1").firestore();
  await assertFails(claim(db, "u1", "abc", { playerId: "p2" }));
  await assertFails(claim(db, "u1", "abc", { role: "parent" }));
});

test("parallele Claims: hoechstens einer gelingt", async () => {
  await seedInvite("abc");
  const results = await Promise.allSettled(
    ["u1", "u2", "u3", "u4"].map((uid) => claim(env.authenticatedContext(uid).firestore(), uid, "abc"))
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});

test("Trainer legt Trainer-/Medizin-Konto weiter ohne Code an", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `teams/${TEAM}/members/coach`), { role: "trainer", createdAt: Timestamp.now() });
  });
  const db = env.authenticatedContext("coach").firestore();
  await assertSucceeds(setDoc(doc(db, `teams/${TEAM}/members/med1`), { role: "medical", createdAt: Timestamp.now() }));
});

test("Trainer darf Codes weiter anlegen und loeschen", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `teams/${TEAM}/members/coach`), { role: "trainer", createdAt: Timestamp.now() });
  });
  const db = env.authenticatedContext("coach").firestore();
  await assertSucceeds(setDoc(doc(db, `teams/${TEAM}/invites/neu`), { role: "player", playerId: "p1", expiresAt: null }));
  await assertSucceeds(deleteDoc(doc(db, `teams/${TEAM}/invites/neu`)));
});
