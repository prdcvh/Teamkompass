// SCRUM-206/SCRUM-218/SCRUM-210: PR-Vorschauen duerfen keinen Build mit Live-Team-Konfiguration (echte Daten) ausliefern.
// Seit SCRUM-210 laeuft keine Alt-App (outputs/*) mehr live und es gibt keine Alt-App-Vorschau mehr. Die Pruefung der
// Alt-App-Vorschau-Kopie (scripts/legacy-preview.mjs) bleibt fuer den Rueckweg erhalten und wird hier an einem
// Rueckweg-Stand getestet (legacyRepo: Ziel u15 wieder auf outputs/u15, Vorschau-Kopie mit Testteam im Workflow).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { LEGACY_PREVIEW_TEAM_ID, legacyPreviewConfig, legacyPreviewDir } from "../scripts/legacy-preview-lib.mjs";
import * as guard from "../scripts/preview-guard-lib.mjs";

const { checkPreviewWorkflow, PREVIEW_TEAM_IDS } = guard;

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const PR_WORKFLOW = ".github/workflows/firebase-hosting-pull-request.yml";

async function repo() {
  return {
    workflow: await read(PR_WORKFLOW),
    firebaseJson: JSON.parse(await read("firebase.json")),
    firebaserc: JSON.parse(await read(".firebaserc")),
    angularJson: JSON.parse(await read("angular/angular.json")),
    readText: read,
  };
}

function withPreviewSteps(workflow, steps, upload = "") {
  const [verify, deploy] = workflow.split(/\n {2}build_and_preview:/);
  return `${verify.replace(/\n$/, "")}${upload}\n  build_and_preview:${deploy.replace(/\n*$/, "")}${steps}`;
}

// Alt-App-Vorschau, wie sie bis SCRUM-210 im PR-Workflow stand (Kopie von outputs/u15 mit dem Testteam).
const LEGACY_UPLOAD = `
      - name: Alt-App-Vorschau mit Testteam bauen
        run: node scripts/legacy-preview.mjs outputs/u15
      - uses: actions/upload-artifact@v7
        with:
          name: legacy-preview
          path: dist/preview/u15
          if-no-files-found: error
          retention-days: 1`;
const LEGACY_STEPS = `
      - name: Alt-App-Ordner leeren
        run: rm -rf outputs/u15
      - uses: actions/download-artifact@v8
        with:
          name: legacy-preview
          path: outputs/u15
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: \${{ secrets.GITHUB_TOKEN }}
          projectId: teamkompass-b8aac
          target: u15
`;

/** Rueckweg-Stand: Ziel u15 liefert wieder outputs/u15 aus, die Vorschau ist die Alt-App-Kopie mit dem Testteam. */
async function legacyRepo() {
  const base = await repo();
  const firebaseJson = structuredClone(base.firebaseJson);
  firebaseJson.hosting.find((entry) => entry.target === "u15").public = "outputs/u15";
  return { ...base, firebaseJson, workflow: withPreviewSteps(base.workflow, LEGACY_STEPS, LEGACY_UPLOAD) };
}

test("PR-Vorschauen laufen nur mit dem Testteam U14, nie mit einem Live-Team – ohne Ausnahme (SCRUM-206, SCRUM-218, SCRUM-210)", async () => {
  const base = await repo();
  const { deployments, problems } = await checkPreviewWorkflow(base);
  assert.deepEqual(problems, []);
  assert.equal(guard.LEGACY_PREVIEW_EXCEPTIONS, undefined, "keine Ausnahmen mehr in der Pruefung");

  // Einzige Vorschau: Angular-Standard-Build (Testteam U14) auf der Test-Site u14 (SCRUM-206). Seit SCRUM-210 keine
  // Alt-App-Vorschau mehr (Ziel u15 ist der Angular-Build der U15 mit echten Daten).
  assert.deepEqual(deployments.map(({ target, publicDir, teamId, legacyPreview }) => ({ target, publicDir, teamId, legacyPreview })), [
    { target: "u14", publicDir: "angular/dist/teamkompass-angular/browser", teamId: "U14", legacyPreview: false },
  ]);
  for (const entry of deployments) {
    assert.ok(PREVIEW_TEAM_IDS.includes(entry.teamId), `${entry.target}: ${entry.teamId}`);
    assert.equal(entry.buildProjectId, entry.deployProjectId, `${entry.target}: Projekt-ID`);
  }
  assert.ok(!deployments.some((entry) => ["main", "u15", "u17"].includes(entry.target)), "keine Vorschau auf den Live-Sites main, u15, u17");
  assert.doesNotMatch(base.workflow.replace(/^\s*#.*$/gm, ""), /legacy-preview|outputs\//, "keine Alt-App-Vorschau mehr (SCRUM-210)");
  // Kein Hosting-Ziel liefert mehr die Alt-App aus (sonst braeuchte es wieder eine Testteam-Vorschau-Kopie).
  assert.deepEqual(base.firebaseJson.hosting.filter((entry) => !entry.public.startsWith("angular/")).map((entry) => entry.target), []);
});

test("Rueckweg-Stand: Alt-App-Vorschau-Kopie mit Testteam wird weiter akzeptiert (SCRUM-218, fuer FIREBASE_SETUP.md §11)", async () => {
  const { deployments, problems } = await checkPreviewWorkflow(await legacyRepo());
  assert.deepEqual(problems, []);
  assert.deepEqual(deployments.map(({ target, publicDir, teamId, legacyPreview }) => ({ target, publicDir, teamId, legacyPreview })), [
    { target: "u14", publicDir: "angular/dist/teamkompass-angular/browser", teamId: "U14", legacyPreview: false },
    { target: "u15", publicDir: "outputs/u15", teamId: "U14", legacyPreview: true },
  ]);
});

test("Pruefung schlaegt an, wenn eine Vorschau auf Ziel u15 (Angular-Build der U15, echte Daten) entsteht (SCRUM-210)", async () => {
  const base = await repo();
  // Die bisherige Alt-App-Vorschau unveraendert gegen das umgestellte Ziel u15: dort liegt jetzt der U15-Build.
  let result = await checkPreviewWorkflow({ ...base, workflow: withPreviewSteps(base.workflow, LEGACY_STEPS, LEGACY_UPLOAD) });
  assert.ok(result.problems.some((text) => /Ziel u15.*Team-ID "U15".*Live-Team/.test(text)), result.problems.join("\n"));

  // Der U15-Build selbst als Vorschau.
  const upload = `
      - uses: actions/upload-artifact@v7
        with:
          name: angular-dist-u15
          path: angular/dist/team-u15/browser`;
  const steps = `
      - uses: actions/download-artifact@v8
        with:
          name: angular-dist-u15
          path: angular/dist/team-u15/browser
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          projectId: teamkompass-b8aac
          target: u15
`;
  result = await checkPreviewWorkflow({ ...base, workflow: withPreviewSteps(base.workflow, steps, upload) });
  assert.ok(result.problems.some((text) => /Ziel u15.*Team-ID "U15".*Live-Team/.test(text)), result.problems.join("\n"));
});

test("Pruefung schlaegt an, wenn die Alt-App wieder direkt aus dem Repo (U15) in die Vorschau geht (SCRUM-218)", async () => {
  const base = await legacyRepo();
  // Stand vor SCRUM-218 (damals mein-team): kein Leeren/Laden der Vorschau-Kopie, deployt wird outputs/u15 aus dem Repo.
  const workflow = base.workflow
    .replace(/\n {6}- name: Alt-App-Ordner leeren\n {8}run: rm -rf outputs\/u15/, "")
    .replace(/\n {6}- uses: actions\/download-artifact@v8\n {8}with:\n {10}name: legacy-preview\n {10}path: outputs\/u15/, "");
  assert.doesNotMatch(workflow, /path: outputs\/u15/);
  const { problems } = await checkPreviewWorkflow({ ...base, workflow });
  assert.ok(problems.some((text) => /Ziel u15.*Team-ID "U15".*Live-Team/.test(text)), problems.join("\n"));
});

test("Pruefung schlaegt an, wenn die Alt-App-Vorschau-Kopie nicht sauber gebaut oder ausgetauscht wird", async () => {
  const base = await legacyRepo();
  // Artefakt aus dem Repo-Ordner statt aus der Vorschau-Kopie hochgeladen.
  const wrongUpload = base.workflow.replace("path: dist/preview/u15", "path: outputs/u15");
  let result = await checkPreviewWorkflow({ ...base, workflow: wrongUpload });
  assert.ok(result.problems.some((text) => /Ziel u15.*erwartet wird die Vorschau-Kopie dist\/preview\/u15/.test(text)), result.problems.join("\n"));

  // Bau-Schritt baut einen anderen Ordner (oder fehlt).
  const otherBuild = base.workflow.replace("run: node scripts/legacy-preview.mjs outputs/u15", "run: node scripts/legacy-preview.mjs outputs/u17");
  assert.notEqual(otherBuild, base.workflow);
  result = await checkPreviewWorkflow({ ...base, workflow: otherBuild });
  assert.ok(result.problems.some((text) => /Ziel u15.*nicht mit "node scripts\/legacy-preview\.mjs outputs\/u15" gebaut/.test(text)), result.problems.join("\n"));

  // Nachtraegliches Ueberschreiben im Vorschau-Job (laeuft mit dem Secret) wird nicht akzeptiert.
  const overwrite = base.workflow.replace(
    "      - uses: actions/download-artifact@v8\n        with:\n          name: legacy-preview",
    "      - run: cp outputs/u17/firebase-config.js outputs/u15/firebase-config.js\n      - uses: actions/download-artifact@v8\n        with:\n          name: legacy-preview",
  );
  assert.notEqual(overwrite, base.workflow);
  result = await checkPreviewWorkflow({ ...base, workflow: overwrite });
  assert.ok(result.problems.some((text) => /run-Schritt im Vorschau-Job wird nicht geprueft: cp /.test(text)), result.problems.join("\n"));

  // Download in einen Oberordner wuerde outputs/u15 ungeprueft ersetzen.
  const parent = base.workflow.replace("          name: legacy-preview\n          path: outputs/u15", "          name: legacy-preview\n          path: outputs");
  assert.notEqual(parent, base.workflow);
  result = await checkPreviewWorkflow({ ...base, workflow: parent });
  assert.ok(result.problems.some((text) => /nach outputs geladen.*outputs\/u15/.test(text)), result.problems.join("\n"));
});

test("Pruefung schlaegt an, wenn wieder eine Vorschau auf Ziel main (Angular mein-team, echte Daten) u17 oder u15 entsteht (SCRUM-208, SCRUM-210)", async () => {
  const base = await repo();
  const step = (target, artifact, path) =>
    `      - uses: actions/download-artifact@v8\n        with:\n          name: ${artifact}\n          path: ${path}\n      - uses: FirebaseExtended/action-hosting-deploy@v0\n        with:\n          projectId: teamkompass-b8aac\n          target: ${target}\n`;
  for (const [target, path, team] of [["main", "angular/dist/team-mein-team/browser", "mein-team"], ["u17", "angular/dist/team-u17/browser", "U17"], ["u15", "angular/dist/team-u15/browser", "U15"]]) {
    const workflow = `${base.workflow}${step(target, "angular-dist", path)}`;
    const { problems } = await checkPreviewWorkflow({ ...base, workflow });
    assert.ok(problems.some((text) => new RegExp(`Ziel ${target}.*Team-ID "${team}".*Live-Team`).test(text)), problems.join("\n"));
  }
});

test("Vorschau-Kopie der Alt-App: nur teamId (Testteam) und Name aendern sich (SCRUM-218)", async () => {
  const strip = (text) => text.replace(/^.*(teamId|teamName|textContent).*$/gm, "");
  for (const dir of ["outputs/team-manager", "outputs/u15", "outputs/u17"]) {
    const original = await read(`${dir}/firebase-config.js`);
    const preview = legacyPreviewConfig(original);
    assert.match(preview, new RegExp(`teamId: "${LEGACY_PREVIEW_TEAM_ID}"`), dir);
    assert.doesNotMatch(preview, /teamId: "(mein-team|U15|U17)"/, dir);
    assert.match(preview, /teamName: "[^"]*\(Vorschau\)"/, dir);
    assert.equal(strip(preview), strip(original), `${dir}: sonst unveraendert`);
  }
  assert.throws(() => legacyPreviewConfig("window.TEAMKOMPASS_CONFIG = {};"), /genau eine teamId/);
  assert.throws(() => legacyPreviewConfig('a = { teamId: "mein-team" }; b = { teamId: "U17" };'), /genau eine teamId/);
  assert.equal(legacyPreviewDir("outputs/u15"), "dist/preview/u15");
  assert.throws(() => legacyPreviewDir("angular/dist/x"), /Kein Alt-App-Ordner/);
  assert.throws(() => legacyPreviewDir("outputs/../secret"), /Kein Alt-App-Ordner/);
});

test("scripts/legacy-preview.mjs baut eine vollstaendige Kopie mit Testteam-Konfiguration (SCRUM-218)", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  await promisify(execFile)(process.execPath, ["scripts/legacy-preview.mjs", "outputs/team-manager"], { cwd: root });
  const list = async (dir) => (await readdir(new URL(`../${dir}`, import.meta.url), { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath ?? entry.path}/${entry.name}`.slice(fileURLToPath(new URL(`../${dir}/`, import.meta.url)).length))
    .sort();
  const files = await list("outputs/team-manager");
  assert.deepEqual(await list("dist/preview/team-manager"), files);
  for (const file of files) {
    const [original, copy] = await Promise.all([
      readFile(new URL(`../outputs/team-manager/${file}`, import.meta.url)),
      readFile(new URL(`../dist/preview/team-manager/${file}`, import.meta.url)),
    ]);
    if (file === "firebase-config.js") assert.equal(copy.toString("utf8"), legacyPreviewConfig(original.toString("utf8")));
    else assert.ok(copy.equals(original), file);
  }
});

// Der alte Stand (SCRUM-169): Vorschau des U17-Builds auf dem Live-Ziel u17.
const U17_PREVIEW_STEPS = `
      - uses: actions/download-artifact@v8
        with:
          name: angular-dist-u17
          path: angular/dist/team-u17/browser
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: \${{ secrets.GITHUB_TOKEN }}
          projectId: teamkompass-b8aac
          target: u17
`;

test("Pruefung schlaegt an, wenn eine Vorschau den U17-Build (echte Daten) ausliefert", async () => {
  const base = await repo();
  const upload = `
      - uses: actions/upload-artifact@v7
        with:
          name: angular-dist-u17
          path: angular/dist/team-u17/browser`;
  const { problems } = await checkPreviewWorkflow({ ...base, workflow: withPreviewSteps(base.workflow, U17_PREVIEW_STEPS, upload) });
  assert.ok(problems.some((text) => /Ziel u17.*Team-ID "U17".*Live-Team/.test(text)), problems.join("\n"));
});

test("Pruefung erkennt vertauschte Artefakte und Live-Deploys", async () => {
  const base = await repo();
  // U17-Build unter falschem Namen an den U14-Pfad gelegt.
  const upload = `
      - uses: actions/upload-artifact@v7
        with:
          name: angular-dist-u17
          path: angular/dist/team-u17/browser`;
  const swapped = `
      - uses: actions/download-artifact@v8
        with:
          name: angular-dist-u17
          path: angular/dist/teamkompass-angular/browser
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          projectId: teamkompass-b8aac
          channelId: live
          target: u14
`;
  const { problems } = await checkPreviewWorkflow({ ...base, workflow: withPreviewSteps(base.workflow, swapped, upload) });
  assert.ok(problems.some((text) => /angular-dist-u17.*team-u17/.test(text)), problems.join("\n"));
  assert.ok(problems.some((text) => /nie live/.test(text)), problems.join("\n"));

  const run = `
      - run: npx firebase-tools hosting:channel:deploy pr1 --only u17
`;
  const viaRun = await checkPreviewWorkflow({ ...base, workflow: withPreviewSteps(base.workflow, run) });
  assert.ok(viaRun.problems.some((text) => /run: firebase/.test(text)), viaRun.problems.join("\n"));
});

test("Pruefung schlaegt an, wenn der Standard-Build auf eine Live-Team-ID umgestellt wird", async () => {
  const base = await repo();
  const readText = async (path) => {
    const text = await read(path);
    return path === "angular/src/environments/environment.ts" ? text.replace("teamId: 'U14'", "teamId: 'U17'") : text;
  };
  const { problems } = await checkPreviewWorkflow({ ...base, readText });
  assert.ok(problems.some((text) => /Ziel u14.*Team-ID "U17"/.test(text)), problems.join("\n"));
});

test("Pruefung schlaegt an, wenn sie einen Deploy-Schritt nicht lesen kann", async () => {
  const base = await repo();
  const odd = `
  sneaky:
    runs-on: ubuntu-latest
    steps:
        - uses: FirebaseExtended/action-hosting-deploy@v0
          with:
            target: u17
`;
  const { problems } = await checkPreviewWorkflow({ ...base, workflow: `${base.workflow.replace(/\n*$/, "")}\n${odd}` });
  assert.ok(problems.some((text) => /Deploy-Schritten erkannt/.test(text)), problems.join("\n"));
});
