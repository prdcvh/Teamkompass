// SCRUM-206/SCRUM-218/SCRUM-210/SCRUM-211: PR-Vorschauen duerfen keinen Build mit Live-Team-Konfiguration (echte Daten)
// ausliefern. Seit SCRUM-211 ist die Alt-App archiviert; die Pruefung kennt nur noch Angular-Builds und lehnt jedes
// andere Vorschau-Ziel ab.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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

test("PR-Vorschauen laufen nur mit dem Testteam U14, nie mit einem Live-Team – ohne Ausnahme (SCRUM-206, SCRUM-210, SCRUM-211)", async () => {
  const base = await repo();
  const { deployments, problems } = await checkPreviewWorkflow(base);
  assert.deepEqual(problems, []);
  assert.equal(guard.LEGACY_PREVIEW_EXCEPTIONS, undefined, "keine Ausnahmen mehr in der Pruefung");

  // Einzige Vorschau: Angular-Standard-Build (Testteam U14) auf der Test-Site u14 (SCRUM-206). Seit SCRUM-210 keine
  // Alt-App-Vorschau mehr (Ziel u15 ist der Angular-Build der U15 mit echten Daten).
  assert.deepEqual(deployments.map(({ target, publicDir, teamId }) => ({ target, publicDir, teamId })), [
    { target: "u14", publicDir: "angular/dist/teamkompass-angular/browser", teamId: "U14" },
  ]);
  for (const entry of deployments) {
    assert.ok(PREVIEW_TEAM_IDS.includes(entry.teamId), `${entry.target}: ${entry.teamId}`);
    assert.equal(entry.buildProjectId, entry.deployProjectId, `${entry.target}: Projekt-ID`);
  }
  assert.ok(!deployments.some((entry) => ["main", "u15", "u17"].includes(entry.target)), "keine Vorschau auf den Live-Sites main, u15, u17");
  assert.doesNotMatch(base.workflow.replace(/^\s*#.*$/gm, ""), /legacy-preview|outputs\//, "keine Alt-App-Vorschau mehr (SCRUM-210/211)");
  // Kein Hosting-Ziel liefert mehr die Alt-App aus (SCRUM-211: archiviert).
  assert.deepEqual(base.firebaseJson.hosting.filter((entry) => !entry.public.startsWith("angular/")).map((entry) => entry.target), []);
});

test("Pruefung schlaegt an, wenn eine Vorschau auf Ziel u15 (Angular-Build der U15, echte Daten) entsteht (SCRUM-210)", async () => {
  const base = await repo();
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
  const result = await checkPreviewWorkflow({ ...base, workflow: withPreviewSteps(base.workflow, steps, upload) });
  assert.ok(result.problems.some((text) => /Ziel u15.*Team-ID "U15".*Live-Team/.test(text)), result.problems.join("\n"));
});

test("Pruefung lehnt jedes Vorschau-Ziel ab, das keinen Angular-Build ausliefert (SCRUM-211)", async () => {
  const base = await repo();
  // Etwa eine aus dem Archiv zurueckgeholte Alt-App: Ziel u15 zeigt wieder auf einen Ordner im Repo.
  const firebaseJson = structuredClone(base.firebaseJson);
  firebaseJson.hosting.find((entry) => entry.target === "u15").public = "outputs/u15";
  const steps = `
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          projectId: teamkompass-b8aac
          target: u15
`;
  const { deployments, problems } = await checkPreviewWorkflow({ ...base, firebaseJson, workflow: withPreviewSteps(base.workflow, steps) });
  assert.ok(problems.some((text) => /Ziel u15.*outputs\/u15 ist kein Angular-Build/.test(text)), problems.join("\n"));
  assert.ok(!deployments.some((entry) => entry.target === "u15"), "nicht pruefbares Ziel darf nicht als geprueft gelten");
});

test("Pruefung lehnt jeden run-Schritt und Downloads in fremde Ordner im Vorschau-Job ab", async () => {
  const base = await repo();
  for (const run of ["rm -rf outputs/u15", "cp angular/src/environments/environment.u17.ts angular/src/environments/environment.ts"]) {
    const steps = `
      - run: ${run}
`;
    const { problems } = await checkPreviewWorkflow({ ...base, workflow: withPreviewSteps(base.workflow, steps) });
    assert.ok(problems.some((text) => text.includes(`run-Schritt im Vorschau-Job wird nicht geprueft: ${run}`)), problems.join("\n"));
  }
  // Download in einen Oberordner wuerde den ausgelieferten Build ungeprueft ersetzen.
  const parent = `
      - uses: actions/download-artifact@v8
        with:
          name: angular-dist
          path: angular/dist
`;
  const { problems } = await checkPreviewWorkflow({ ...base, workflow: withPreviewSteps(base.workflow, parent) });
  assert.ok(problems.some((text) => /nach angular\/dist geladen.*teamkompass-angular\/browser/.test(text)), problems.join("\n"));
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
