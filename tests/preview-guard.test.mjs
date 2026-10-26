// SCRUM-206: PR-Vorschauen duerfen keinen Build mit Live-Team-Konfiguration (echte Daten) ausliefern.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkPreviewWorkflow, LEGACY_PREVIEW_EXCEPTIONS, PREVIEW_TEAM_IDS } from "../scripts/preview-guard-lib.mjs";

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

test("PR-Vorschauen laufen nur mit dem Testteam U14, nie mit einem Live-Team (SCRUM-206)", async () => {
  const { deployments, problems } = await checkPreviewWorkflow(await repo());
  assert.deepEqual(problems, []);

  // Die Angular-Vorschau ist der Standard-Build (Testteam U14) auf der Test-Site u14.
  const angular = deployments.filter((entry) => entry.publicDir.startsWith("angular/"));
  assert.deepEqual(angular.map(({ target, publicDir, teamId }) => ({ target, publicDir, teamId })), [
    { target: "u14", publicDir: "angular/dist/teamkompass-angular/browser", teamId: "U14" },
  ]);
  assert.ok(!deployments.some((entry) => entry.target === "u17"), "keine Vorschau mehr auf der Live-Site der U17");
  for (const entry of deployments) assert.equal(entry.buildProjectId, entry.deployProjectId, `${entry.target}: Projekt-ID`);

  // Einzige Ausnahme: die Alt-App-Vorschau auf main (SCRUM-218), solange sie existiert.
  const others = deployments.filter((entry) => !PREVIEW_TEAM_IDS.includes(entry.teamId));
  assert.ok(others.every((entry) => LEGACY_PREVIEW_EXCEPTIONS.some((ex) => ex.target === entry.target && ex.public === entry.publicDir)));
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
