// Emulator-Tests: Messplan (SCRUM-392). Die Entscheidungen des Trainers liegen im eigenen Dokument
// teams/{teamId}/meta/measurementPlan (nicht mehr in meta/settings, das der Vereinsadmin mitliest). Geprüft wird:
// Trainer lesen/schreiben/entfernen Einträge, Vereinsadmin, Spieler, Eltern, Medizin, Scout, abgelaufene Trainer,
// Fremde und Nicht-Angemeldete nicht, und ein Trainer/Vereinsadmin eines anderen Teams/Vereins ebenfalls nicht.
// Starten: siehe tests/rules/README.md. Nur erfundene Testdaten im Emulator.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { Timestamp, deleteField, doc, FieldPath, getDoc, setDoc } from "firebase/firestore";

const TEAM = "A1";
const OTHER = "B1";
const t = (path, team = TEAM) => `teams/${team}/${path}`;
const PLAN = t("meta/measurementPlan");
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-measurement-plan",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const past = () => Timestamp.fromMillis(Date.now() - 86_400_000);

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "clubs/A"), { name: "Verein A", logoUrl: null });
    await setDoc(doc(db, "clubs/B"), { name: "Verein B", logoUrl: null });
    await setDoc(doc(db, "clubs/A/admins/adminA"), { uid: "adminA", role: "admin" });
    await setDoc(doc(db, "clubs/B/admins/adminB"), { uid: "adminB", role: "admin" });
    await setDoc(doc(db, `teams/${TEAM}`), { clubId: "A", name: "Team A1", label: "U14", hasTrainer: true });
    await setDoc(doc(db, `teams/${OTHER}`), { clubId: "B", name: "Team B1", label: "U14", hasTrainer: true });
    const members = {
      coach: { role: "trainer" },
      oldCoach: { role: "trainer", expiresAt: past() },
      medic: { role: "physio" },
      scout: { role: "scout" },
      pl1: { role: "player", playerId: "p1", expiresAt: null },
      parent1: { role: "parent", playerId: "p1", expiresAt: null }
    };
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
    await setDoc(doc(db, t("members/otherCoach", OTHER)), { role: "trainer" });
    await setDoc(doc(db, t("meta/settings")), { defaultLocation: { text: "Heimplatz", coords: null } });
    await setDoc(doc(db, PLAN), { measurementPlan: { p1: { intervalMonths: 4 } } });
    await setDoc(doc(db, t("meta/measurementPlan", OTHER)), { measurementPlan: { p1: { intervalMonths: 2 } } });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const entryPath = (id) => new FieldPath("measurementPlan", id);

test("Trainer liest den Messplan, setzt, ändert und entfernt einzelne Spielereinträge", async () => {
  const ref = doc(as("coach"), PLAN);
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, { measurementPlan: { p2: { paused: true } } }, { mergeFields: [entryPath("p2")] }));
  await assertSucceeds(setDoc(ref, { measurementPlan: { p2: { intervalMonths: 5 } } }, { mergeFields: [entryPath("p2")] }));
  await assertSucceeds(setDoc(ref, { measurementPlan: { p2: deleteField() } }, { mergeFields: [entryPath("p2")] }));
});

test("Vereinsadmin des eigenen Vereins liest und schreibt den Messplan nicht, liest meta/settings aber weiter", async () => {
  const db = as("adminA");
  await assertFails(getDoc(doc(db, PLAN)));
  await assertFails(setDoc(doc(db, PLAN), { measurementPlan: { p9: { paused: true } } }, { mergeFields: [entryPath("p9")] }));
  await assertFails(setDoc(doc(db, PLAN), { measurementPlan: { p1: deleteField() } }, { mergeFields: [entryPath("p1")] }));
  await assertSucceeds(getDoc(doc(db, t("meta/settings"))));
});

test("Spieler, Eltern, Medizin, Scout, abgelaufene Trainer, Fremde und Nicht-Angemeldete lesen und schreiben den Messplan nicht", async () => {
  for (const uid of ["pl1", "parent1", "medic", "scout", "oldCoach", "fremd", null]) {
    const ref = doc(as(uid), PLAN);
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { measurementPlan: { p9: { paused: true } } }, { mergeFields: [entryPath("p9")] }));
    await assertFails(setDoc(ref, { measurementPlan: { p1: deleteField() } }, { mergeFields: [entryPath("p1")] }));
  }
});

test("Mandantentrennung: Trainer und Vereinsadmin eines anderen Teams/Vereins erreichen den Messplan nicht", async () => {
  await assertFails(getDoc(doc(as("otherCoach"), PLAN)));
  await assertFails(setDoc(doc(as("otherCoach"), PLAN), { measurementPlan: { p9: { paused: true } } }, { mergeFields: [entryPath("p9")] }));
  await assertFails(getDoc(doc(as("adminB"), PLAN)));
  await assertFails(getDoc(doc(as("adminA"), t("meta/measurementPlan", OTHER))));
  await assertFails(getDoc(doc(as("coach"), t("meta/measurementPlan", OTHER))));
  await assertSucceeds(getDoc(doc(as("otherCoach"), t("meta/measurementPlan", OTHER))));
});
