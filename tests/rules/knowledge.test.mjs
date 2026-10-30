// Emulator-Tests: Wissen (SCRUM-106). Die Wissen-Einträge liegen als Map `knowledge.{id}` im Trainer-Dokument
// teams/{teamId}/meta/settings. Geprüft wird: nur Trainer lesen und schreiben, alle anderen Rollen nicht – und dass
// eine NEUE Unter-Sammlung ohne Regeländerung für niemanden erreichbar wäre (deshalb wird keine verwendet).
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteField, doc, getDoc, getDocs, setDoc, Timestamp } from "firebase/firestore";

const TEAM = "TESTTEAM";
const OTHER = "ANDERESTEAM";
const t = (path, team = TEAM) => `teams/${team}/${path}`;
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-knowledge",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const past = () => Timestamp.fromMillis(Date.now() - 86_400_000);
const entry = { type: "link", title: "Pressing", url: "https://example.com/v", description: "", category: "Taktik" };

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = {
      coach: { role: "trainer" },
      oldCoach: { role: "trainer", expiresAt: past() },
      medic: { role: "physio" },
      scout: { role: "scout" },
      legacyScout: { role: "medical" },
      pl1: { role: "player", playerId: "p1", expiresAt: null },
      parent1: { role: "parent", playerId: "p1", expiresAt: null }
    };
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
    await setDoc(doc(db, t("meta/settings")), { defaultLocation: { text: "Heimplatz", coords: null }, knowledge: { k1: entry } });
    await setDoc(doc(db, t("knowledge/k1")), entry);
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

test("Trainer liest, legt an, ändert und löscht Wissen-Einträge (Map im Dokument meta/settings)", async () => {
  const db = as("coach");
  const ref = doc(db, t("meta/settings"));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, { knowledge: { k2: { ...entry, title: "Neu" } } }, { merge: true }));
  await assertSucceeds(setDoc(ref, { knowledge: { k2: { ...entry, title: "Geändert" } } }, { merge: true }));
  await assertSucceeds(setDoc(ref, { knowledge: { k2: deleteField() } }, { merge: true }));
});

test("Spieler, Eltern, Medizin, Scout, abgelaufene Trainer, Fremde und Nicht-Angemeldete lesen und schreiben kein Wissen", async () => {
  for (const uid of ["pl1", "parent1", "medic", "scout", "legacyScout", "oldCoach", "fremd", null]) {
    const ref = doc(as(uid), t("meta/settings"));
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { knowledge: { k9: entry } }, { merge: true }));
    await assertFails(setDoc(ref, { knowledge: { k1: deleteField() } }, { merge: true }));
  }
});

test("Ein Trainer eines anderen Teams erreicht das Wissen dieses Teams nicht", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), t("members/otherCoach", OTHER)), { role: "trainer" });
  });
  await assertFails(getDoc(doc(as("otherCoach"), t("meta/settings"))));
  await assertFails(setDoc(doc(as("otherCoach"), t("meta/settings")), { knowledge: { k9: entry } }, { merge: true }));
});

test("Befund: eine neue Unter-Sammlung teams/{teamId}/knowledge wäre ohne Regeländerung für alle gesperrt, auch für Trainer", async () => {
  await assertFails(getDoc(doc(as("coach"), t("knowledge/k1"))));
  await assertFails(getDocs(collection(as("coach"), t("knowledge"))));
  await assertFails(setDoc(doc(as("coach"), t("knowledge/k2")), entry));
  for (const uid of ["pl1", "parent1", "medic", "scout"]) await assertFails(getDoc(doc(as(uid), t("knowledge/k1"))));
});
