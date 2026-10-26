// SCRUM-206/SCRUM-218: PR-Vorschauen duerfen keinen Build mit Live-Team-Konfiguration (echte Daten) ausliefern.
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

test("PR-Vorschauen laufen nur mit dem Testteam U14, nie mit einem Live-Team – ohne Ausnahme (SCRUM-206, SCRUM-218)", async () => {
  const { deployments, problems } = await checkPreviewWorkflow(await repo());
  assert.deepEqual(problems, []);
  assert.equal(guard.LEGACY_PREVIEW_EXCEPTIONS, undefined, "keine Ausnahmen mehr in der Pruefung");

  assert.deepEqual(deployments.map(({ target, publicDir, teamId, legacyPreview }) => ({ target, publicDir, teamId, legacyPreview })), [
    // Alt-App: Vorschau-Kopie von outputs/team-manager mit dem Testteam (SCRUM-218).
    { target: "main", publicDir: "outputs/team-manager", teamId: "U14", legacyPreview: true },
    // Angular: Standard-Build (Testteam U14) auf der Test-Site u14 (SCRUM-206).
    { target: "u14", publicDir: "angular/dist/teamkompass-angular/browser", teamId: "U14", legacyPreview: false },
  ]);
  for (const entry of deployments) {
    assert.ok(PREVIEW_TEAM_IDS.includes(entry.teamId), `${entry.target}: ${entry.teamId}`);
    assert.equal(entry.buildProjectId, entry.deployProjectId, `${entry.target}: Projekt-ID`);
  }
  assert.ok(!deployments.some((entry) => entry.target === "u17" || entry.target === "u15"), "keine Vorschau auf Live-Sites der U17/U15");
});

test("Pruefung schlaegt an, wenn die Alt-App wieder direkt aus dem Repo (mein-team) in die Vorschau geht (SCRUM-218)", async () => {
  const base = await repo();
  // Stand vor SCRUM-218: kein Leeren/Laden der Vorschau-Kopie, deployt wird outputs/team-manager aus dem Repo.
  const workflow = base.workflow
    .replace(/\n {6}- name: Alt-App-Ordner leeren\n {8}run: rm -rf outputs\/team-manager/, "")
    .replace(/\n {6}- uses: actions\/download-artifact@v8\n {8}with:\n {10}name: legacy-preview\n {10}path: outputs\/team-manager/, "");
  assert.doesNotMatch(workflow, /path: outputs\/team-manager/);
  const { problems } = await checkPreviewWorkflow({ ...base, workflow });
  assert.ok(problems.some((text) => /Ziel main.*Team-ID "mein-team".*Live-Team/.test(text)), problems.join("\n"));
});

test("Pruefung schlaegt an, wenn die Alt-App-Vorschau-Kopie nicht sauber gebaut oder ausgetauscht wird", async () => {
  const base = await repo();
  // Artefakt aus dem Repo-Ordner statt aus der Vorschau-Kopie hochgeladen.
  const wrongUpload = base.workflow.replace("path: dist/preview/team-manager", "path: outputs/team-manager");
  let result = await checkPreviewWorkflow({ ...base, workflow: wrongUpload });
  assert.ok(result.problems.some((text) => /Ziel main.*erwartet wird die Vorschau-Kopie dist\/preview\/team-manager/.test(text)), result.problems.join("\n"));

  // Bau-Schritt baut einen anderen Ordner (oder fehlt).
  const otherBuild = base.workflow.replace("run: node scripts/legacy-preview.mjs outputs/team-manager", "run: node scripts/legacy-preview.mjs outputs/u15");
  assert.notEqual(otherBuild, base.workflow);
  result = await checkPreviewWorkflow({ ...base, workflow: otherBuild });
  assert.ok(result.problems.some((text) => /Ziel main.*nicht mit "node scripts\/legacy-preview\.mjs outputs\/team-manager" gebaut/.test(text)), result.problems.join("\n"));

  // Nachtraegliches Ueberschreiben im Vorschau-Job (laeuft mit dem Secret) wird nicht akzeptiert.
  const overwrite = base.workflow.replace(
    "      - uses: actions/download-artifact@v8\n        with:\n          name: legacy-preview",
    "      - run: cp outputs/u17/firebase-config.js outputs/team-manager/firebase-config.js\n      - uses: actions/download-artifact@v8\n        with:\n          name: legacy-preview",
  );
  assert.notEqual(overwrite, base.workflow);
  result = await checkPreviewWorkflow({ ...base, workflow: overwrite });
  assert.ok(result.problems.some((text) => /run-Schritt im Vorschau-Job wird nicht geprueft: cp /.test(text)), result.problems.join("\n"));

  // Download in einen Oberordner wuerde outputs/team-manager ungeprueft ersetzen.
  const parent = base.workflow.replace("          name: legacy-preview\n          path: outputs/team-manager", "          name: legacy-preview\n          path: outputs");
  assert.notEqual(parent, base.workflow);
  result = await checkPreviewWorkflow({ ...base, workflow: parent });
  assert.ok(result.problems.some((text) => /nach outputs geladen.*outputs\/team-manager/.test(text)), result.problems.join("\n"));
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
  assert.equal(legacyPreviewDir("outputs/team-manager"), "dist/preview/team-manager");
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

function withPreviewSteps(workflow, steps, upload = "") {
  const [verify, deploy] = workflow.split(/\n {2}build_and_preview:/);
  return `${verify.replace(/\n$/, "")}${upload}\n  build_and_preview:${deploy.replace(/\n*$/, "")}${steps}`;
}

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

test("Pruefung schlaegt an bei einer Angular-Vorschau von mein-team oder einer Alt-App-Vorschau der U15 (wie in PR #244)", async () => {
  const base = await repo();
  const firebaseJson = structuredClone(base.firebaseJson);
  firebaseJson.hosting.find((entry) => entry.target === "main").public = "angular/dist/team-mein-team/browser";
  const upload = `
      - uses: actions/upload-artifact@v7
        with:
          name: angular-dist-mein-team
          path: angular/dist/team-mein-team/browser`;
  const steps = `
      - uses: actions/download-artifact@v8
        with:
          name: angular-dist-mein-team
          path: angular/dist/team-mein-team/browser
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          projectId: teamkompass-b8aac
          target: u15
`;
  const { problems } = await checkPreviewWorkflow({ ...base, firebaseJson, workflow: withPreviewSteps(base.workflow, steps, upload) });
  // main ist nun Angular mein-team: die Alt-App-Ausnahme greift dafuer nicht.
  assert.ok(problems.some((text) => /Ziel main.*Team-ID "mein-team"/.test(text)), problems.join("\n"));
  assert.ok(problems.some((text) => /Ziel u15.*Team-ID "U15"/.test(text)), problems.join("\n"));
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
