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

test("Kein Workflow ruft firebase-tools ungepinnt per npx/npm exec auf (SCRUM-90)", async () => {
  const dir = new URL("../.github/workflows/", import.meta.url);
  for (const file of (await readdir(dir)).filter((name) => /\.ya?ml$/.test(name))) {
    const text = await readFile(new URL(file, dir), "utf8");
    for (const line of text.split("\n")) {
      if (/^\s*#/.test(line)) continue;
      if (/\b(npx|npm exec|npm x)\b[^\n]*firebase-tools(?!@\d)/.test(line)) assert.fail(`${file}: ungepinnter firebase-tools-Aufruf: ${line.trim()}`);
    }
  }
});
