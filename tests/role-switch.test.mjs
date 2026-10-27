import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-24: Rollenwechsel ohne Neuladen (Spieler -> Trainer) darf die Einschränkungen
// der vorherigen Rolle nicht behalten (mobile Bereichsauswahl und Ansicht).
const teams = ["team-manager", "u15", "u17"];
const FULL = '<option value="dashboard">Dashboard</option><option value="squad">Kader</option><option value="profiles">Profile</option>';

async function load(team) {
  const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
  const fnStart = source.indexOf("function applyRoleRestrictions");
  assert.ok(fnStart >= 0, "applyRoleRestrictions fehlt");
  const marker = source.indexOf("let fullMobileViewOptions");
  const from = marker >= 0 && marker < fnStart ? marker : fnStart;
  const end = source.indexOf("\n}\n", fnStart) + 3;
  const code = source.slice(from, end);
  const select = { innerHTML: FULL, value: "dashboard" };
  const el = () => ({ hidden: false, disabled: false, textContent: "" });
  const els = { "#mobileViewSelect": select };
  const $ = (sel) => (els[sel] ??= el());
  const state = { views: [], trainer: false };
  const body = { classList: { toggle() {} } };
  const factory = new Function(
    "$", "document", "state", "isCloudTrainer", "isCloudActive", "canManageRecords",
    "setView", "renderAccessManager", "syncLoadReportButton",
    `let currentRole = null; ${code}
     return (role) => { currentRole = role; applyRoleRestrictions(); };`
  );
  const apply = factory($, { body }, state, () => state.trainer, () => true, () => true,
    (v) => { state.views.push(v); select.value = v; }, () => {}, () => {});
  return { apply, select, state };
}

for (const team of teams) {
  test(`${team}: Spieler -> Trainer stellt Bereichsauswahl und Dashboard wieder her`, async () => {
    const { apply, select, state } = await load(team);
    apply("player");
    assert.equal(select.innerHTML, '<option value="profiles">Profile</option>');
    state.trainer = true;
    apply("trainer");
    assert.equal(select.innerHTML, FULL);
    assert.equal(state.views.at(-1), "dashboard");
  });

  test(`${team}: Trainer-Erstanmeldung wechselt die Ansicht nicht`, async () => {
    const { apply, select, state } = await load(team);
    apply("trainer");
    assert.equal(select.innerHTML, FULL);
    assert.deepEqual(state.views, []);
  });

  test(`${team}: Physio -> Trainer stellt Auswahl wieder her`, async () => {
    const { apply, select } = await load(team);
    apply("physio");
    assert.notEqual(select.innerHTML, FULL);
    apply("trainer");
    assert.equal(select.innerHTML, FULL);
  });
}
