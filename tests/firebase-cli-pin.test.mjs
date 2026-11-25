import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Rules-Deploy nutzt die gepinnte Firebase-CLI aus dem Lockfile, kein ungepinntes npx (SCRUM-90)", async () => {
  const deploy = await read(".github/workflows/firestore-rules-deploy.yml");
  const pkg = JSON.parse(await read("tests/rules/package.json"));
  const lock = JSON.parse(await read("tests/rules/package-lock.json"));
  const version = pkg.devDependencies["firebase-tools"];
  assert.match(version, /^\d+\.\d+\.\d+$/, "firebase-tools muss exakt gepinnt sein (ohne ^ oder ~)");
  assert.equal(lock.packages["node_modules/firebase-tools"].version, version);
  assert.equal(lock.packages[""].devDependencies["firebase-tools"], version);
  assert.match(deploy, /npm ci --ignore-scripts --prefix tests\/rules/);
  assert.match(deploy, /tests\/rules\/node_modules\/\.bin\/firebase deploy --only firestore:rules/);
  assert.ok(deploy.indexOf("npm ci") < deploy.indexOf("Write service account key"), "Install muss vor dem Schreiben des Schluessels laufen");
});

const LOCAL_BIN = "tests/rules/node_modules/.bin/firebase";
const INSTALL = /npm ci --ignore-scripts --prefix tests\/rules/;

async function workflows() {
  const dir = new URL("../.github/workflows/", import.meta.url);
  const result = [];
  for (const file of (await readdir(dir)).filter((name) => /\.ya?ml$/.test(name))) {
    const text = await readFile(new URL(file, dir), "utf8");
    const lines = text.split("\n").filter((line) => !/^\s*#/.test(line));
    result.push({ file, text: lines.join("\n"), lines });
  }
  return result;
}

test("Kein Workflow laedt firebase-tools per npx/npm exec/dlx oder global aus dem Netz (SCRUM-90, SCRUM-229)", async () => {
  for (const { file, lines } of await workflows()) {
    for (const line of lines) {
      if (/\b(npx|npm exec|npm x|pnpm dlx|yarn dlx|bunx)\b[^\n]*firebase-tools/.test(line)) assert.fail(`${file}: firebase-tools per npx o. ae.: ${line.trim()}`);
      if (/\b(npm|pnpm|yarn)\b[^\n]*\b(install|i|add)\b[^\n]*firebase-tools/.test(line)) assert.fail(`${file}: firebase-tools nachinstalliert: ${line.trim()}`);
      if (/\bnpx\b[^\n]*\bfirebase\b/.test(line)) assert.fail(`${file}: firebase per npx: ${line.trim()}`);
    }
  }
});

test("Jeder Workflow, der die Firebase-CLI selbst aufruft, nutzt die gelockte Binary aus tests/rules nach npm ci (SCRUM-229)", async () => {
  const users = [];
  for (const { file, text, lines } of await workflows()) {
    const cmd = /(\$FIREBASE"?|\S*\/\.bin\/firebase|(?<![\w./-])firebase)\s+(deploy|hosting:|emulators|projects|use)\b/;
    if (!lines.some((line) => cmd.test(line))) continue;
    users.push(file);
    for (const line of lines) {
      const m = cmd.exec(line);
      if (m && m[1] !== LOCAL_BIN && m[1].replace('"', "") !== "$FIREBASE") assert.fail(`${file}: Firebase-CLI nicht aus dem Lockfile: ${line.trim()}`);
    }
    assert.match(text, INSTALL, `${file}: npm ci --ignore-scripts --prefix tests/rules fehlt`);
    assert.ok(text.search(INSTALL) < text.search(/firebase-sa\.json|sa\.json|GOOGLE_APPLICATION_CREDENTIALS/), `${file}: Install muss vor dem Schreiben des Schluessels laufen`);
  }
  assert.ok(users.includes("firestore-rules-deploy.yml") && users.includes("firebase-preview-cleanup.yml"), `erwartet: Rules-Deploy und Vorschau-Aufraeumen, gefunden: ${users.join(", ")}`);
});

test("Vorschau-Aufraeumen nutzt dieselbe gelockte CLI wie der Rules-Deploy (SCRUM-229)", async () => {
  const cleanup = await read(".github/workflows/firebase-preview-cleanup.yml");
  assert.match(cleanup, /npm ci --ignore-scripts --prefix tests\/rules/);
  assert.ok(cleanup.includes(`FIREBASE: ${LOCAL_BIN}`));
  assert.match(cleanup, /"\$FIREBASE" hosting:channel:list/);
  assert.match(cleanup, /"\$FIREBASE" hosting:channel:delete/);
  assert.doesNotMatch(cleanup, /firebase-tools@\d/, "keine zweite, abweichende Versionsangabe");
});

test("Keine Versionsangabe fuer firebase-tools in Workflows ausser dem Lockfile; Hosting-Actions sind die einzige bekannte Ausnahme (SCRUM-229)", async () => {
  const actions = new Set();
  for (const { file, lines } of await workflows()) {
    for (const line of lines) {
      if (/firebase-tools@/.test(line)) assert.fail(`${file}: eigene firebase-tools-Version im Workflow: ${line.trim()}`);
      const m = /uses:\s*(FirebaseExtended\/[\w-]+)@/.exec(line);
      if (m) actions.add(m[1]);
    }
  }
  // Diese Action bringt ihre CLI selbst mit (nicht ueber unser Lockfile steuerbar) - neue Firebase-Actions bewusst pruefen.
  assert.deepEqual([...actions], ["FirebaseExtended/action-hosting-deploy"]);
});
