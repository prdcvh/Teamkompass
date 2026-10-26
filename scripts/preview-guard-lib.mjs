// SCRUM-206: Prueft, was die PR-Vorschauen (.github/workflows/firebase-hosting-pull-request.yml) ausliefern.
//
// Eine Vorschau zeigt Code, der noch nicht freigegeben ist. Sie darf deshalb nie mit der Konfiguration eines
// Live-Teams (echte Mannschaftsdaten) laufen, sondern nur mit dem Testteam. Fuer jeden Deploy-Schritt im
// Vorschau-Job wird ermittelt: Hosting-Ziel -> public-Ordner (firebase.json) -> welcher Build dort liegt
// (Angular-Build-Konfiguration bzw. Alt-App-Ordner) -> Team-ID und Firebase-Projekt dieses Builds.
// Unbekanntes wird abgelehnt (fail closed).

/** Team-IDs, mit denen eine Vorschau laufen darf (Testteam, siehe angular/src/environments/environment.ts). */
export const PREVIEW_TEAM_IDS = ["U14"];

/** Live-Teams mit echten Daten – nur fuer klarere Fehlermeldungen; abgelehnt wird alles ausser PREVIEW_TEAM_IDS. */
export const LIVE_TEAM_IDS = ["mein-team", "U15", "U17"];

/**
 * Bekannte Altlast, bewusst nicht in SCRUM-206 geaendert: die Vorschau der Alt-App auf Ziel main (echte
 * mein-team-Daten). Gilt nur fuer genau diese Kombination; eine Angular-Vorschau von mein-team faellt nicht darunter.
 * Entfernen mit SCRUM-218.
 */
export const LEGACY_PREVIEW_EXCEPTIONS = [
  { target: "main", public: "outputs/team-manager", teamId: "mein-team", ticket: "SCRUM-218" },
];

const DEPLOY_ACTION = /^FirebaseExtended\/action-hosting-deploy@/;

const unquote = (value) => value.trim().replace(/^(['"])(.*)\1$/, "$2");

/** Zerlegt einen Workflow in Jobs (Name -> Text). Erwartet die uebliche Einrueckung (2 Leerzeichen je Ebene). */
export function splitJobs(workflow) {
  const jobsStart = workflow.search(/^jobs:\s*$/m);
  if (jobsStart < 0) return {};
  const jobs = {};
  let current = null;
  for (const line of workflow.slice(jobsStart).split("\n").slice(1)) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      current = header[1];
      jobs[current] = "";
    } else if (/^\S/.test(line)) {
      break;
    } else if (current) {
      jobs[current] += `${line}\n`;
    }
  }
  return jobs;
}

/** Schritte eines Jobs: { uses, run, with: {key: value} }. */
export function parseSteps(jobText) {
  const stepsMatch = /^ {4}steps:\s*$/m.exec(jobText);
  if (!stepsMatch) return [];
  const steps = [];
  let step = null;
  let inWith = false;
  for (const line of jobText.slice(stepsMatch.index + stepsMatch[0].length).split("\n")) {
    if (/^ {4}\S/.test(line)) break; // naechster Job-Schluessel nach den Schritten
    const start = /^ {6}- (.*)$/.exec(line);
    if (start) {
      step = { uses: null, run: "", with: {} };
      steps.push(step);
      inWith = false;
      parseStepKey(step, start[1]);
      continue;
    }
    if (!step) continue;
    const key = /^ {8}(\S.*)$/.exec(line);
    if (key) {
      inWith = /^with:\s*$/.test(key[1]);
      if (!inWith) parseStepKey(step, key[1]);
      continue;
    }
    const withEntry = /^ {10}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (inWith && withEntry) {
      step.with[withEntry[1]] = unquote(withEntry[2]);
    } else if (/^ {10}/.test(line)) {
      step.run += `${line.trim()}\n`; // mehrzeiliges run: |
    }
  }
  return steps;
}

function parseStepKey(step, text) {
  const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(text);
  if (!match) return;
  if (match[1] === "uses") step.uses = unquote(match[2]);
  if (match[1] === "run") step.run += `${match[2]}\n`;
}

const outputBase = (outputPath) => (typeof outputPath === "object" && outputPath ? outputPath.base : outputPath);

/** Alle Environment-Dateien, die einen Angular-Build mit diesem public-Ordner erzeugen koennen. */
function angularEnvironmentsFor(publicDir, angularJson) {
  const environments = new Set();
  for (const [projectName, project] of Object.entries(angularJson.projects ?? {})) {
    const build = project.architect?.build;
    if (!build) continue;
    const baseReplacements = build.options?.fileReplacements ?? [];
    const defaultOutput = outputBase(build.options?.outputPath) ?? `dist/${projectName}`;
    const variants = [{ outputPath: defaultOutput, fileReplacements: baseReplacements }];
    for (const configuration of Object.values(build.configurations ?? {})) {
      variants.push({
        outputPath: outputBase(configuration.outputPath) ?? defaultOutput,
        fileReplacements: configuration.fileReplacements ?? baseReplacements,
      });
    }
    for (const variant of variants) {
      if (`angular/${variant.outputPath}/browser` !== publicDir) continue;
      const replacement = variant.fileReplacements.find((entry) => entry.replace === "src/environments/environment.ts");
      environments.add(`angular/${replacement ? replacement.with : "src/environments/environment.ts"}`);
    }
  }
  return [...environments];
}

const teamIdIn = (source) => /teamId:\s*['"]([^'"]+)['"]/.exec(source)?.[1] ?? null;
const projectIdIn = (source) => /projectId:\s*['"]([^'"]+)['"]/.exec(source)?.[1] ?? null;

/** Team-ID(s) und Firebase-Projekt(e) des Builds, der in publicDir liegt. */
async function buildsFor(publicDir, angularJson, readText) {
  if (publicDir.startsWith("angular/")) {
    const builds = [];
    for (const file of angularEnvironmentsFor(publicDir, angularJson)) {
      const source = await readText(file);
      let projectId = projectIdIn(source);
      if (!projectId && /from '\.\/firebase'/.test(source)) {
        projectId = projectIdIn(await readText(file.replace(/[^/]+$/, "firebase.ts")));
      }
      builds.push({ source: file, teamId: teamIdIn(source), projectId });
    }
    return builds;
  }
  const file = `${publicDir}/firebase-config.js`;
  const source = await readText(file);
  return [{ source: file, teamId: teamIdIn(source), projectId: projectIdIn(source) }];
}

/**
 * Prueft den PR-Workflow. Liefert { deployments, problems }; problems leer = in Ordnung.
 * readText(pfadRelativZumRepo) muss den Dateiinhalt liefern (async).
 */
export async function checkPreviewWorkflow({ workflow, firebaseJson, firebaserc, angularJson, readText }) {
  const problems = [];
  const deployments = [];
  const jobs = splitJobs(workflow);
  const deployJobs = Object.entries(jobs).filter(([, text]) => parseSteps(text).some((step) => DEPLOY_ACTION.test(step.uses ?? "") || /firebase(-tools)?\b.*\b(deploy|hosting:channel)/.test(step.run)));
  if (deployJobs.length === 0) problems.push("Kein Vorschau-Deploy-Schritt gefunden – Pruefung kann den Workflow nicht lesen.");
  // Fail closed: jeder Deploy-Schritt im Text muss auch erkannt worden sein (sonst ungewohnte Einrueckung o. Ae.).
  const parsedDeploys = Object.values(jobs).flatMap(parseSteps).filter((step) => DEPLOY_ACTION.test(step.uses ?? "")).length;
  const rawDeploys = (workflow.match(/action-hosting-deploy@/g) ?? []).length;
  if (parsedDeploys !== rawDeploys) problems.push(`Nur ${parsedDeploys} von ${rawDeploys} Deploy-Schritten erkannt – Workflow-Format wird nicht verstanden.`);

  // Artefakt-Name -> hochgeladener Pfad (aus allen Jobs, i. d. R. dem Verify-Job).
  const uploads = new Map();
  for (const text of Object.values(jobs)) {
    for (const step of parseSteps(text)) {
      if (/^actions\/upload-artifact@/.test(step.uses ?? "")) uploads.set(step.with.name, step.with.path);
    }
  }

  for (const [jobName, text] of deployJobs) {
    const downloaded = new Map(); // Pfad -> Artefakt-Name
    for (const step of parseSteps(text)) {
      if (/^actions\/download-artifact@/.test(step.uses ?? "")) {
        downloaded.set(step.with.path, step.with.name);
        continue;
      }
      if (/firebase(-tools)?\b.*\b(deploy|hosting:channel)/.test(step.run)) {
        problems.push(`${jobName}: Vorschau per "run: firebase …" wird nicht geprueft – bitte FirebaseExtended/action-hosting-deploy verwenden.`);
        continue;
      }
      if (!DEPLOY_ACTION.test(step.uses ?? "")) continue;

      const { target, projectId, channelId, entryPoint } = step.with;
      const where = `${jobName}, Ziel ${target ?? "(fehlt)"}`;
      if (!target) {
        problems.push(`${where}: Deploy-Schritt ohne target – unklar, was ausgeliefert wird.`);
        continue;
      }
      if (channelId === "live") problems.push(`${where}: PR-Vorschau darf nie live deployen.`);
      if (entryPoint && entryPoint !== ".") problems.push(`${where}: abweichendes entryPoint "${entryPoint}" wird nicht geprueft.`);
      if (!projectId) problems.push(`${where}: projectId fehlt.`);
      else if (!firebaserc.targets?.[projectId]?.hosting?.[target]) problems.push(`${where}: Ziel ist in .firebaserc fuer Projekt ${projectId} nicht angelegt.`);

      const hosting = (firebaseJson.hosting ?? []).find((entry) => entry.target === target);
      if (!hosting) {
        problems.push(`${where}: Ziel fehlt in firebase.json.`);
        continue;
      }
      const publicDir = hosting.public;
      if (publicDir.startsWith("angular/")) {
        // Der Build entsteht im Verify-Job und muss genau an den public-Pfad dieses Ziels zurueckgelegt werden.
        const artifact = downloaded.get(publicDir);
        if (!artifact) problems.push(`${where}: kein Build-Artefakt nach ${publicDir} geladen.`);
        else if (uploads.get(artifact) !== publicDir) problems.push(`${where}: Artefakt "${artifact}" wurde aus ${uploads.get(artifact) ?? "(nirgends)"} hochgeladen, ausgeliefert wird es als ${publicDir}.`);
      }

      const builds = await buildsFor(publicDir, angularJson, readText);
      if (builds.length === 0) problems.push(`${where}: keine Build-Konfiguration fuer ${publicDir} gefunden.`);
      for (const build of builds) {
        deployments.push({ job: jobName, target, publicDir, deployProjectId: projectId, teamId: build.teamId, buildProjectId: build.projectId, source: build.source });
        const exception = LEGACY_PREVIEW_EXCEPTIONS.find((entry) => entry.target === target && entry.public === publicDir && entry.teamId === build.teamId);
        if (!PREVIEW_TEAM_IDS.includes(build.teamId) && !exception) {
          const kind = LIVE_TEAM_IDS.includes(build.teamId) ? "Live-Team mit echten Daten" : "kein freigegebenes Testteam";
          problems.push(`${where}: Vorschau liefert ${publicDir} mit Team-ID "${build.teamId}" aus (${build.source}) – ${kind}. Erlaubt: ${PREVIEW_TEAM_IDS.join(", ")}.`);
        }
        if (projectId && build.projectId !== projectId) problems.push(`${where}: Build nutzt Firebase-Projekt "${build.projectId}", deployt wird nach "${projectId}".`);
      }
    }
  }
  return { deployments, problems };
}
