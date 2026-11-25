// SCRUM-198: Backend-Grundgerüst mit Firebase Cloud Functions (functions/). Prüft Konfiguration, Region,
// Deploy-Kette und dass keine Vorschau und kein Geheimnis dazukommt.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { parseSteps, splitJobs } from "../scripts/preview-guard-lib.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const LOCAL_BIN = "tests/rules/node_modules/.bin/firebase";

async function sourceFiles(dir) {
  const base = new URL(`../${dir}/`, import.meta.url);
  const names = (await readdir(base, { recursive: true })).filter((name) => /\.(ts|mjs|json)$/.test(name) && !name.startsWith("node_modules") && !name.startsWith("lib"));
  return Promise.all(names.map(async (name) => ({ name, text: await readFile(new URL(name, base), "utf8") })));
}

test("firebase.json: Functions aus functions/, Node 22, Quelltext und Tests werden nicht hochgeladen (SCRUM-198)", async () => {
  const config = JSON.parse(await read("firebase.json"));
  assert.equal(config.functions.length, 1);
  const [fn] = config.functions;
  assert.equal(fn.source, "functions");
  assert.equal(fn.codebase, "default");
  assert.equal(fn.runtime, "nodejs22");
  for (const entry of ["node_modules", "*.local"]) assert.ok(fn.ignore.includes(entry), `ignore: ${entry} fehlt`);
  // Die CLI vergleicht Muster ohne "/" mit jedem Datei-/Ordnernamen (matchBase): "src" oder "lib" wuerde auch
  // lib/functions/src/index.js ausschliessen. Ob lib/ wirklich hochgeladen wird, prueft functions/test/upload.test.mjs.
  for (const entry of ["lib", "src", "functions", "angular", "app", "core", "ratings"]) assert.ok(!fn.ignore.includes(entry), `ignore: ${entry} schliesst gebaute Funktionen aus`);
  const pkg = JSON.parse(await read("functions/package.json"));
  assert.equal(pkg.engines.node, "22");
  assert.equal(pkg.main, "lib/functions/src/index.js");
  // Cloud Build soll nicht selbst bauen: der Build braucht den App-Quelltext ausserhalb von functions/.
  assert.equal(pkg.scripts["gcp-build"], "");
});

test("Alle Funktionen laufen in europe-west3 (Frankfurt), keine Funktion setzt eine eigene Region (SCRUM-198)", async () => {
  const options = await read("functions/src/options.ts");
  assert.match(options, /REGION = 'europe-west3'/);
  assert.match(options, /setGlobalOptions\(\{ region: REGION/);
  for (const { name, text } of await sourceFiles("functions/src")) {
    if (name === "options.ts") continue;
    assert.doesNotMatch(text, /\bregion\s*:/, `${name}: eigene Region`);
    assert.doesNotMatch(text, /(us|asia|australia|southamerica|northamerica|me|africa)-[a-z]+\d/, `${name}: Region ausserhalb der EU`);
    assert.doesNotMatch(text, /minInstances/, `${name}: minInstances erzeugt Dauerkosten`);
  }
});

test("Gemeinsame Logik: Backend kompiliert die App-Datei mit, sie bleibt frei von App-Abhaengigkeiten (SCRUM-198)", async () => {
  const shared = await read("functions/src/shared/rating.ts");
  assert.match(shared, /from '\.\.\/\.\.\/\.\.\/angular\/src\/app\/core\/ratings\/rating'/);
  const dir = "angular/src/app/core/ratings";
  for (const file of ["rating.ts", "rating-scale.ts", "grade-steps.ts"]) {
    const text = await read(`${dir}/${file}`);
    for (const [, from] of text.matchAll(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
      assert.match(from, /^\.\/(rating|rating-scale|grade-steps)$/, `${file}: Import ${from} – geteilte Logik darf nur reines TypeScript nutzen`);
    }
  }
});

test("npm run verify baut, lintet und testet functions/ inkl. Emulator-Test (SCRUM-198)", async () => {
  const root = JSON.parse(await read("package.json"));
  assert.match(root.scripts.verify, /npm run verify:functions/);
  assert.equal(root.scripts["verify:functions"], "npm --prefix functions run verify");
  const pkg = JSON.parse(await read("functions/package.json"));
  for (const step of ["npm run lint", "npm run build", "npm test", "npm run test:emulator"]) assert.ok(pkg.scripts.verify.includes(step), `verify: ${step} fehlt`);
  assert.ok(pkg.scripts["test:emulator"].includes(`${LOCAL_BIN} emulators:exec --only functions --project demo-`), "Emulator mit gelockter CLI und Demo-Projekt");
  for (const workflow of ["quality.yml", "firebase-hosting-pull-request.yml", "firebase-hosting-merge.yml"]) {
    const text = await read(`.github/workflows/${workflow}`);
    assert.match(text, /npm ci --ignore-scripts --prefix functions && npm ci --ignore-scripts --prefix tests\/rules/, `${workflow}: Installation fuer verify:functions fehlt`);
    assert.ok(text.indexOf("--prefix functions") < text.indexOf("npm run verify"), `${workflow}: Installation muss vor verify laufen`);
  }
});

test("Merge deployt Functions in eigenem Job: Fehler dort blockiert die Hosting-Deploys nicht (SCRUM-198)", async () => {
  const jobs = splitJobs(await read(".github/workflows/firebase-hosting-merge.yml"));
  const { build_functions: build, deploy_functions: deploy, build_and_deploy: hosting } = jobs;
  assert.ok(build && deploy, "Jobs build_functions/deploy_functions fehlen");
  assert.match(build, /^ {4}needs: verify\s*$/m);
  assert.match(deploy, /^ {4}needs: build_functions\s*$/m);
  assert.match(hosting, /^ {4}needs: verify\s*$/m, "Hosting wartet nur auf verify, nicht auf Functions");
  for (const job of [build, deploy]) assert.doesNotMatch(job, /continue-on-error/, "Fehler muss sichtbar (rot) bleiben");
  assert.doesNotMatch(hosting, /--only functions|functions:|functions-dist/, "Hosting-Job deployt keine Functions");
  // Build ohne Schluessel: lib/ und die Funktionsliste functions.yaml, als Artefakt weitergegeben.
  assert.doesNotMatch(build, /secrets\./);
  assert.match(build, /npm ci --ignore-scripts --prefix functions/);
  assert.match(build, /npm --prefix functions run build && npm --prefix functions run manifest/);
  assert.match(build, /name: functions-dist[\s\S]*functions\/lib[\s\S]*functions\/functions\.yaml[\s\S]*if-no-files-found: error/);
  // Deploy mit Schluessel: nur Artefakt + gelockte CLI, kein Projektcode (keine npm-Befehle fuer functions/).
  assert.match(deploy, /name: functions-dist\n {10}path: functions\n/);
  assert.doesNotMatch(deploy, /--prefix functions|npm run/);
  const runs = parseSteps(deploy).map((step) => step.run).join("\n");
  assert.match(runs, /test -f functions\/functions\.yaml/, "ohne Funktionsliste wuerde die CLI den Code ausfuehren");
  assert.match(runs, /"\$FIREBASE" deploy --only functions --project teamkompass-b8aac --non-interactive/);
  assert.match(deploy, new RegExp(`FIREBASE: ${LOCAL_BIN.replaceAll(".", "\\.")}`));
  assert.doesNotMatch(runs.replace(/setpolicy[^\n]*--force/, ""), /--force/, "Deploy ohne --force (nichts still loeschen)");
  assert.ok(deploy.indexOf("npm ci --ignore-scripts --prefix tests/rules") < deploy.indexOf("firebase-sa.json"), "CLI-Install vor dem Schluessel");
  assert.match(deploy, /secrets\.FIREBASE_SERVICE_ACCOUNT_TEAMKOMPASS_B8AAC/);
  const firebase = JSON.parse(await read("firebase.json"));
  assert.equal(firebase.functions[0].predeploy, undefined, "kein predeploy: der Deploy-Job fuehrt keinen Build aus");
});

test("Funktionsliste functions.yaml entsteht nur im CI und wird beim Build entfernt (SCRUM-198)", async () => {
  const pkg = JSON.parse(await read("functions/package.json"));
  assert.match(pkg.scripts.build, /rmSync\('functions\.yaml'/);
  assert.equal(pkg.scripts.manifest, "node scripts/write-manifest.mjs");
  assert.match(await read("functions/.gitignore"), /^functions\.yaml$/m);
  const script = await read("functions/scripts/write-manifest.mjs");
  assert.match(script, /FUNCTIONS_MANIFEST_OUTPUT_PATH/);
  assert.match(script, /europe-west3/, "Skript prueft die Region jeder Funktion");
});

test("PR-Vorschau und andere Workflows deployen nie Functions (SCRUM-198)", async () => {
  const dir = new URL("../.github/workflows/", import.meta.url);
  for (const file of (await readdir(dir)).filter((name) => /\.ya?ml$/.test(name))) {
    const text = (await readFile(new URL(file, dir), "utf8")).split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
    const deploysFunctions = /deploy[^\n]*--only[^\n]*functions|functions:(delete|artifacts)/.test(text);
    if (file === "firebase-hosting-merge.yml") assert.ok(deploysFunctions);
    else assert.ok(!deploysFunctions, `${file}: deployt Functions`);
  }
  const pr = await read(".github/workflows/firebase-hosting-pull-request.yml");
  assert.doesNotMatch(pr, /--only[^\n]*functions/);
});

test("Keine Zugangsdaten in functions/ (SCRUM-198)", async () => {
  for (const { name, text } of await sourceFiles("functions")) {
    assert.doesNotMatch(text, /-----BEGIN [A-Z ]*PRIVATE KEY-----|"private_key"|"type":\s*"service_account"|AIza[0-9A-Za-z_-]{30,}/, `${name}: sieht nach Zugangsdaten aus`);
  }
  const ignore = await read("functions/.gitignore");
  for (const entry of ["lib/", "node_modules/", "*.local", ".secret.local"]) assert.ok(ignore.includes(entry), `functions/.gitignore: ${entry}`);
});
