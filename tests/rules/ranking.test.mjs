// Emulator-Tests: MVP-Rangliste (SCRUM-105) unter teams/{teamId}/meta/ranking.
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, Timestamp } from "firebase/firestore";

const TEAM = "TESTTEAM";
const OTHER = "ANDERES";
const t = (path, team = TEAM) => `teams/${team}/${path}`;
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-ranking",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const ranking = () => ({
  week: { from: "2026-10-19", to: "2026-10-25", entries: [{ rank: 1, name: "Ali", points: 12 }, { rank: 2, name: "Ben", points: 7 }] },
  month: { from: "2026-10-01", to: "2026-10-31", entries: [{ rank: 1, name: "Ali", points: 30 }] },
  updatedAt: "2026-10-23T08:00:00.000Z"
});

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
      oldpl: { role: "player", playerId: "p1", expiresAt: Timestamp.fromMillis(Date.now() - 86_400_000) }
    };
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
    await setDoc(doc(db, t("meta/ranking")), ranking());
    await setDoc(doc(db, t("events/e1/privateNotes/p2")), { playerId: "p2", points: 5 });
    // Spieler eines anderen Teams
    await setDoc(doc(db, t("members/otherpl", OTHER)), { role: "player", playerId: "x1", expiresAt: null });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const ref = (uid, path = "meta/ranking", team = TEAM) => doc(as(uid), t(path, team));

test("Rangliste lesen: Trainer sowie Spieler und Eltern des Teams", async () => {
  for (const uid of ["coach", "pl1", "parent1"]) await assertSucceeds(getDoc(ref(uid)));
});

test("Rangliste lesen: Fremde, abgelaufene Zugänge, andere Teams, Scout und Medizin nicht", async () => {
  for (const uid of [null, "fremd", "oldpl", "otherpl", "scout", "medic"]) await assertFails(getDoc(ref(uid)));
});

test("Spieler eines anderen Teams liest weder dieses Dokument noch das eigene Team über fremde Pfade", async () => {
  await assertFails(getDoc(ref("otherpl", "meta/ranking", TEAM)));
});

test("Rangliste schreiben: nur der Trainer, nur mit den drei Feldern", async () => {
  await assertSucceeds(setDoc(ref("coach"), ranking()));
  await assertFails(setDoc(ref("coach"), { ...ranking(), extra: "x" }));
  await assertSucceeds(deleteDoc(ref("coach")));
  for (const uid of [null, "fremd", "pl1", "parent1", "oldpl", "otherpl", "scout", "medic"]) {
    await assertFails(setDoc(ref(uid), ranking()));
    await assertFails(deleteDoc(ref(uid)));
  }
});

test("Die Einzelpunkte im Trainer-Pfad bleiben für Spieler gesperrt", async () => {
  await assertSucceeds(getDoc(ref("coach", "events/e1/privateNotes/p2")));
  for (const uid of ["pl1", "parent1"]) await assertFails(getDoc(ref(uid, "events/e1/privateNotes/p2")));
});

test("Andere Dokumente unter meta bleiben unverändert gesperrt", async () => {
  for (const path of ["meta/ranking2", "meta/lineup", "meta/settings", "meta/planning"]) await assertFails(getDoc(ref("pl1", path)));
});
