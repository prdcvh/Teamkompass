// SCRUM-202: Logik des Einmal-Skripts scripts/migrate-medical-role.mjs ("medical" -> "scout").
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NEW_ROLE, OLD_ROLE, parseArgs, planMigration } from "../scripts/migrate-medical-role-lib.mjs";

test("migrate-medical-role: Probelauf ist Standard, geschrieben wird nur mit --apply", () => {
  assert.deepEqual(parseArgs([]), { apply: false });
  assert.deepEqual(parseArgs(["--apply"]), { apply: true });
  assert.deepEqual(parseArgs(["--apply", "--dry-run"]), { apply: false });
  assert.throws(() => parseArgs(["--force"]), /Unbekannte Option/);
  assert.equal(OLD_ROLE, "medical");
  assert.equal(NEW_ROLE, "scout");
});

test("migrate-medical-role: stellt nur medical-Konten um, in allen Teams, und nur das Feld role", () => {
  const docs = [
    { path: "teams/mein-team/members/a", data: { role: "medical", email: "a@x.test" } },
    { path: "teams/mein-team/members/b", data: { role: "trainer" } },
    { path: "teams/U15/members/c", data: { role: "medical" } },
    { path: "teams/U17/members/d", data: { role: "scout" } },
    { path: "teams/U14/members/e", data: { role: "physio" } },
    { path: "teams/U14/members/f", data: { role: "medical" } },
    { path: "teams/U14/members/g", data: {} }
  ];
  const { writes, byTeam, skipped } = planMigration(docs);
  assert.deepEqual(writes, [
    { path: "teams/mein-team/members/a", data: { role: "scout" } },
    { path: "teams/U15/members/c", data: { role: "scout" } },
    { path: "teams/U14/members/f", data: { role: "scout" } }
  ]);
  assert.deepEqual(byTeam, { "mein-team": ["a"], U15: ["c"], U14: ["f"] });
  assert.deepEqual(skipped, []);
});

test("migrate-medical-role: ohne medical-Konten gibt es nichts zu tun; fremde Pfade werden nicht angefasst", () => {
  assert.deepEqual(planMigration([{ path: "teams/U17/members/a", data: { role: "scout" } }]), { writes: [], byTeam: {}, skipped: [] });
  const plan = planMigration([
    { path: "clubs/c1/members/x", data: { role: "medical" } },
    { path: "teams/U17/other/y", data: { role: "medical" } },
    { path: "teams/U17/members/z/sub/q", data: { role: "medical" } }
  ]);
  assert.deepEqual(plan.writes, []);
  assert.equal(plan.skipped.length, 3);
});

test("migrate-medical-role: das Skript schreibt vor dem --apply-Zweig nichts", async () => {
  const source = await readFile(new URL("../scripts/migrate-medical-role.mjs", import.meta.url), "utf8");
  const guard = source.indexOf("if (!apply)");
  assert.ok(guard > 0);
  assert.doesNotMatch(source.slice(0, guard), /bulkWriter|\.set\(|\.update\(|\.delete\(|\.create\(/);
  assert.match(source.slice(guard), /^if \(!apply\) \{[\s\S]*?process\.exit\(0\);\s*\}\s*\n\s*const writer/);
});
