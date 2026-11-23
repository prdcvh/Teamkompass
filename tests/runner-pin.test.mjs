import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

// SCRUM-391: ubuntu-latest wurde zu Ubuntu 26.04, dort kann Playwright kein Chromium installieren.
// Alle Jobs muessen auf eine feste Runner-Version zeigen.
test("Kein Workflow nutzt einen schwebenden Runner (ubuntu-latest) (SCRUM-391)", async () => {
  const dir = new URL("../.github/workflows/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => /\.ya?ml$/.test(name));
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = await readFile(new URL(file, dir), "utf8");
    const runners = text.split("\n").filter((l) => /^\s*runs-on:/.test(l));
    assert.ok(runners.length > 0, `${file}: kein runs-on gefunden`);
    for (const line of runners) {
      assert.match(line, /^\s*runs-on:\s*ubuntu-24\.04\b/, `${file}: Runner nicht fest gepinnt: ${line.trim()}`);
    }
  }
});
