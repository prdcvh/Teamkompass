// SCRUM-392: Messplan-Entscheidungen liegen im Trainer-Dokument meta/measurementPlan, nicht in meta/settings
// (das liest auch der Vereinsadmin). Die Regel selbst prüft tests/rules/measurement-plan.test.mjs (Emulator).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("measurement-plan: Abo und Speichern gehen auf meta/measurementPlan, meta/settings nur für die einmalige Übernahme", async () => {
  const source = await readFile(new URL("../angular/src/app/core/firebase/measurement-plan.api.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const settings = code.match(/'meta', 'settings'/g) ?? [];
  assert.equal(settings.length, 1, "meta/settings darf nur in migrateLegacyPlan vorkommen");
  const migration = code.slice(code.indexOf("migrateLegacyPlan(): Promise<void>"));
  assert.ok(migration.indexOf("'meta', 'settings'") > 0, "meta/settings steht in migrateLegacyPlan");
  assert.ok((code.match(/'meta', 'measurementPlan'/g) ?? []).length >= 3);
});

test("measurement-plan: Firestore-Regel nur für Trainer", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  const block = rules.match(/match \/meta\/measurementPlan \{([\s\S]*?)\n\s*\}/);
  assert.ok(block, "Regel für meta/measurementPlan fehlt");
  assert.match(block[1], /allow read, write: if isTrainer\(\);/);
  assert.doesNotMatch(block[1], /isClubAdminOfTeam/);
});
