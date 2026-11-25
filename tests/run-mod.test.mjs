import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-239: Der Run-Mod muss im Repo liegen und über die Projekteinstellungen
// in jeder Sitzung geladen werden, sonst ist er mit dem Container wieder weg.
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));

const PLUGIN_DIR = ".claude/plugins/jira-run-mod";

test("Plugin-Ordner hat Manifest, Hooks und Typvertrag", async () => {
  const manifest = await readJson(`${PLUGIN_DIR}/.claude-plugin/plugin.json`);
  assert.equal(manifest.name, "jira-run-mod");
  assert.equal(manifest.types, "./types/index.d.ts");
  const hooks = await readJson(`${PLUGIN_DIR}/hooks/hooks.json`);
  assert.deepEqual(hooks.modules, ["./register.tsx"]);
  const types = await readFile(new URL(`../${PLUGIN_DIR}/types/index.d.ts`, import.meta.url), "utf8");
  assert.match(types, /'jira-run-mod':/);
});

test(".claude/settings.json lädt den Run-Mod in jeder Sitzung", async () => {
  const settings = await readJson(".claude/settings.json");
  assert.equal(settings.enabledPlugins?.["jira-run-mod@teamkompass"], true);
  const marketplace = settings.extraKnownMarketplaces?.teamkompass;
  assert.deepEqual(marketplace?.source, { source: "github", repo: "prdcvh/teamkompass" });
});

test("der Marketplace im Repo verweist auf den Plugin-Ordner", async () => {
  const marketplace = await readJson(".claude-plugin/marketplace.json");
  assert.equal(marketplace.name, "teamkompass");
  const entry = marketplace.plugins.find((p) => p.name === "jira-run-mod");
  assert.equal(entry?.source, `./${PLUGIN_DIR}`);
});

test("der SessionStart-Hook bleibt neben dem Plugin erhalten", async () => {
  const settings = await readJson(".claude/settings.json");
  assert.ok(settings.hooks?.SessionStart?.length > 0);
});

test("der Skill jira-run erwähnt den Mod", async () => {
  const skill = await readFile(new URL("../.claude/skills/jira-run/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /jira-run-mod/);
});
