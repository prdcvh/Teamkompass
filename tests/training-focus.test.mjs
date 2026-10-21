import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-163: Trainingsfokus zaehlt nur Trainings mit Datum heute oder frueher (keine kommenden,
// keine Spiele). Gilt fuer die Referenzkopie und jede Team-Kopie.
const copies = ["app.js", "outputs/team-manager/app.js", "outputs/u15/app.js", "outputs/u17/app.js"];
const TODAY = "2026-10-17";

for (const copy of copies) {
  test(`${copy}: Trainingsfokus zaehlt nur vergangene und heutige Trainings`, async () => {
    const source = await readFile(new URL(`../${copy}`, import.meta.url), "utf8");
    const match = source.match(/function trainingFocusCounts\(\) \{[\s\S]*?\n\}\n/);
    assert.ok(match, "trainingFocusCounts fehlt");
    const state = {
      events: [
        { type: "Training", date: "2026-10-16", trainingFocus: "Umschalten" },
        { type: "Training", date: TODAY, trainingFocus: "" },
        { type: "Training", date: "2026-10-18", trainingFocus: "Gegnerischer Ballbesitz" },
        { type: "Training", date: "2027-01-01", trainingFocus: "" },
        { type: "Spiel", date: "2026-10-10", trainingFocus: "" }
      ]
    };
    const counts = new Function("state", "localIsoDate", `${match[0]} return trainingFocusCounts();`)(state, () => TODAY);
    assert.deepEqual(counts, { "Eigener Ballbesitz": 1, "Gegnerischer Ballbesitz": 0, Umschalten: 1 });
  });
}
