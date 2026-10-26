import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-26: Eine geleerte Aufstellung darf von renderPitch() nicht automatisch wieder
// befuellt werden (nur lokal, nie gespeichert). Die Empfehlung kommt per Button.
const teams = ["team-manager", "u15", "u17"];

function body(source, header) {
  const start = source.indexOf(header);
  assert.ok(start >= 0, `${header} fehlt`);
  return source.slice(start, source.indexOf("\n}\n", start));
}

for (const team of teams) {
  test(`${team}: renderPitch befuellt eine leere Aufstellung nicht automatisch`, async () => {
    const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
    const render = body(source, "function renderPitch()");
    assert.doesNotMatch(render, /state\.lineup\s*=\s*\{\s*assignments:\s*assignedToAssignments/);
    assert.doesNotMatch(render, /FORMATION_PRESETS\.map/);
  });

  test(`${team}: Button "Empfohlene Elf uebernehmen" wendet die Formation an und speichert`, async () => {
    const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
    const html = await readFile(new URL(`../outputs/${team}/index.html`, import.meta.url), "utf8");
    assert.match(html, /id="suggestLineupBtn"/);
    assert.match(source, /on\("#suggestLineupBtn", "click", applySuggestedLineup\)/);
    assert.match(body(source, "function applySuggestedLineup()"), /applyFormationPreset\(/);
    assert.match(body(source, "function applyFormationPreset("), /saveBoardLineup\(\)/);
  });
}
