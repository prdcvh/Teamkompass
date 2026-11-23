// SCRUM-278: Logik des Einmal-Skripts scripts/clean-orphans.mjs (verwaiste Unterdaten geloeschter Spieler).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseArgs, planCleanup, summarize } from "../scripts/clean-orphans-lib.mjs";

test("clean-orphans: Probelauf ist Standard, geloescht wird nur mit --apply", () => {
  assert.deepEqual(parseArgs(["U17"]), { teamId: "U17", apply: false });
  assert.deepEqual(parseArgs(["U17", "--apply"]), { teamId: "U17", apply: true });
  assert.throws(() => parseArgs([]));
  assert.throws(() => parseArgs(["U17", "U15"]));
  assert.throws(() => parseArgs(["U17", "--force"]));
  assert.throws(() => parseArgs(["../U17"]));
});

test("clean-orphans: nur Unterdaten nicht mehr vorhandener Spieler werden geplant", () => {
  const orphans = planCleanup([
    { id: "p1", exists: true, collections: { wellness: ["teams/U17/players/p1/wellness/e1"] } },
    {
      id: "gone",
      exists: false,
      collections: {
        wellness: ["teams/U17/players/gone/wellness/e1", "teams/U17/players/gone/wellness/e2"],
        selfReports: ["teams/U17/players/gone/selfReports/e1"],
        absences: [],
      },
    },
    { id: "empty", exists: false, collections: {} },
  ]);
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].id, "gone");
  assert.deepEqual(orphans[0].counts, { wellness: 2, selfReports: 1 });
  assert.equal(orphans[0].paths.length, 3);
  assert.ok(orphans[0].paths.every((path) => path.startsWith("teams/U17/players/gone/")));
});

test("clean-orphans: Ausgabe sagt im Probelauf, dass nichts veraendert wurde", () => {
  const orphans = [{ id: "gone", counts: { wellness: 2 }, paths: ["a", "b"] }];
  const dry = summarize("U17", orphans, false).join("\n");
  assert.match(dry, /\[Probelauf\] Wuerde loeschen: teams\/U17\/players\/gone/);
  assert.match(dry, /Nichts veraendert/);
  assert.doesNotMatch(summarize("U17", orphans, true).join("\n"), /Probelauf|Nichts veraendert/);
  assert.match(summarize("U17", [], false).join("\n"), /keine verwaisten Spielerdaten/);
});

test("clean-orphans: Skript loescht nur mit --apply und nur unter nicht vorhandenen Spielern", async () => {
  const script = await readFile(new URL("../scripts/clean-orphans.mjs", import.meta.url), "utf8");
  assert.match(script, /if \(apply && orphans\.length\)/, "Loeschen nur mit --apply");
  assert.match(script, /planCleanup\(players\)/);
  assert.doesNotMatch(script, /recursiveDelete/, "kein rekursives Loeschen ganzer Teams");
});
