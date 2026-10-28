import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { collectionKey, mapPath, mapValue, parseArgs } from "../scripts/copy-team-lib.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => read(path).then(() => true, () => false);

test("Einladungstokens sind stark und werden atomar verbraucht", async () => {
  const code = await read("angular/src/app/core/access/access.ts");
  const api = await read("angular/src/app/core/firebase/access.api.ts");
  const rules = await read("firestore.rules");
  assert.match(code, /getRandomValues\(new Uint8Array\(24\)\)/);
  assert.match(api, /batch\.delete\(doc\(db, 'teams', this\.team\.id\(\), 'invites', code\)\)/);
  assert.match(rules, /getAfter\([\s\S]*claimedInviteCode == code/);
});

test("Eltern-, Medizin- und Scout-Leserechte sind getrennt; Co-Trainer ist nicht eingeführt", async () => {
  const app = await read("angular/src/app/core/access/access.ts");
  const rules = await read("firestore.rules");
  assert.match(rules, /\["player", "parent"\]/);
  assert.match(rules, /function isPhysio\(\)/);
  assert.match(rules, /function isScout\(\)/);
  assert.doesNotMatch(`${app}\n${rules}`, /role\s*[:=]\s*["']co.?trainer["']/i);
});

test("Hosting setzt grundlegende Browser-Sicherheitsheader", async () => {
  const config = JSON.parse(await read("firebase.json"));
  for (const target of config.hosting) {
    const headers = target.headers.flatMap((entry) => entry.headers).map((entry) => entry.key);
    for (const required of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) assert.ok(headers.includes(required), `${target.target}: ${required} fehlt`);
  }
});

test("CSP erlaubt nur eigene Skripte und die benoetigten Google- und Wetter-Dienste (SCRUM-62, SCRUM-96)", async () => {
  const config = JSON.parse(await read("firebase.json"));
  for (const target of config.hosting) {
    const csp = target.headers.flatMap((entry) => entry.headers).find((entry) => entry.key === "Content-Security-Policy").value;
    const directive = (name) => csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) || "";
    const script = directive("script-src").split(/\s+/).slice(1);
    const connect = directive("connect-src").split(/\s+/).slice(1);
    assert.deepEqual(script, ["'self'"], `${target.target}: script-src erlaubt mehr als eigene Skripte`);
    // Die Angular-App ruft zusaetzlich das Wetter von Open-Meteo ab (SCRUM-96).
    const weather = ["https://api.open-meteo.com", "https://geocoding-api.open-meteo.com"];
    assert.deepEqual(connect.sort(), ["'self'", "https://firestore.googleapis.com", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", ...weather].sort(), `${target.target}: connect-src zu breit`);
  }
});

test("Keine Inline-Styles im Angular-Quelltext; style-src ist für alle Targets gleich (SCRUM-119/121)", async () => {
  // Inline-Styles (style-Attribute, <style>-Elemente) bräuchten `style-src 'unsafe-inline'`. Gestaltung per Klasse
  // oder CSSOM ([style.x]-Bindung, element.style.x, konstruierte Stylesheets) ist von der CSP nicht betroffen.
  const forbidden = [
    [/<[a-zA-Z][^<>]*\sstyle\s*=/, "style-Attribut im Markup"],
    [/<style[\s>]/i, "<style>-Element"],
    [/\[attr\.style\]/, "[attr.style]-Bindung"],
    [/setAttribute\(\s*['"]style['"]/, "setAttribute('style', …)"],
  ];
  const files = (await readdir(new URL("../angular/src", import.meta.url), { recursive: true }))
    .filter((name) => /\.(html|ts)$/.test(name) && !name.endsWith(".spec.ts"));
  assert.ok(files.length > 50, "Angular-Quelltext nicht gefunden");
  const found = [];
  for (const name of files) {
    const text = await read(`angular/src/${name}`);
    for (const [pattern, what] of forbidden) if (pattern.test(text)) found.push(`${name}: ${what}`);
  }
  assert.deepEqual(found, []);

  const config = JSON.parse(await read("firebase.json"));
  const styleSrc = config.hosting.map((target) => {
    const csp = target.headers.flatMap((entry) => entry.headers).find((entry) => entry.key === "Content-Security-Policy").value;
    return csp.split(";").map((part) => part.trim()).find((part) => part.startsWith("style-src "));
  });
  assert.equal(new Set(styleSrc).size, 1, `style-src weicht zwischen den Targets ab: ${styleSrc.join(" | ")}`);
  // 'unsafe-inline' bleibt nur, solange Angular die Komponenten-Styles als <style>-Elemente einfügt (PO-Entscheidung
  // offen, SCRUM-119); mehr als eigene Dateien plus diese Ausnahme ist nicht erlaubt.
  const sources = styleSrc[0].split(/\s+/).slice(1);
  assert.ok(sources.includes("'self'") && sources.every((source) => ["'self'", "'unsafe-inline'"].includes(source)), `style-src zu breit: ${styleSrc[0]}`);
});

test("Angular-Target u14: Output, SPA-Rewrite, Caching, CSP und Deploy-Schritt", async () => {
  const config = JSON.parse(await read("firebase.json"));
  const target = config.hosting.find((entry) => entry.target === "u14");
  assert.ok(target, "Hosting-Target u14 fehlt");
  assert.equal(target.public, "angular/dist/teamkompass-angular/browser");
  assert.deepEqual(target.rewrites, [{ source: "**", destination: "/index.html" }]);

  const headerFor = (source, key) => target.headers.find((entry) => entry.source === source)?.headers.find((header) => header.key === key)?.value;
  const csp = headerFor("**", "Content-Security-Policy");
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-(inline|eval)'/, "Skripte duerfen nicht inline/eval laufen");
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(headerFor("/index.html", "Cache-Control"), /no-cache/);
  assert.match(headerFor("**", "Cache-Control"), /no-cache/, "Deep-Link-Antworten (index.html per Rewrite) muessen revalidieren");
  assert.match(headerFor("/@(main|chunk|polyfills|styles)-*.@(js|css)", "Cache-Control"), /immutable/);
  assert.match(headerFor("/media/**", "Cache-Control"), /immutable/);

  // Das Build-Verzeichnis kommt aus angular.json; ohne diese Uebereinstimmung deployt Hosting ins Leere.
  const angular = JSON.parse(await read("angular/angular.json"));
  const build = angular.projects["teamkompass-angular"].architect.build;
  assert.equal(`angular/dist/teamkompass-angular/${build.options.outputPath ?? "browser"}`.replace(/\/$/, ""), target.public);
  // Inline-onload fuer kritisches CSS wuerde von der CSP blockiert (Seite bliebe ungestylt).
  assert.equal(build.configurations.production.optimization.styles.inlineCritical, false);

  const firebaserc = JSON.parse(await read(".firebaserc"));
  assert.deepEqual(firebaserc.targets["teamkompass-b8aac"].hosting.u14, ["teamkompass-u14"]);
  const deploy = await read(".github/workflows/firebase-hosting-merge.yml");
  assert.match(deploy, /target: u14/);
  assert.match(deploy, /npm run verify/, "Der Angular-Build laeuft ueber verify vor dem Deploy");
});

test("Live-Team U17 läuft auf dem Angular-Build mit Team-ID U17, Rückweg über das Archiv (SCRUM-169, SCRUM-211)", async () => {
  const config = JSON.parse(await read("firebase.json"));
  const u17 = config.hosting.find((entry) => entry.target === "u17");
  const u14 = config.hosting.find((entry) => entry.target === "u14");
  assert.ok(u17, "Hosting-Target u17 fehlt");

  // Public = Ausgabe der Build-Konfiguration u17 (application-Builder legt die Dateien unter browser/ ab).
  const angular = JSON.parse(await read("angular/angular.json"));
  const build = angular.projects["teamkompass-angular"].architect.build.configurations.u17;
  assert.equal(u17.public, `angular/${build.outputPath}/browser`);
  assert.notEqual(u17.public, u14.public, "U17 und das Testteam U14 brauchen getrennte Ausgabeordner");
  assert.match(await read("angular/src/environments/environment.u17.ts"), /teamId: 'U17'/);

  // Gleiche Header (CSP, Caching) und SPA-Rewrite wie das erprobte Angular-Ziel u14.
  assert.deepEqual(u17.headers, u14.headers);
  assert.deepEqual(u17.rewrites, [{ source: "**", destination: "/index.html" }]);
  assert.deepEqual(u17.ignore, u14.ignore);
  const firebaserc = JSON.parse(await read(".firebaserc"));
  assert.deepEqual(firebaserc.targets["teamkompass-b8aac"].hosting.u17, ["teamkompass-u17"], "kein neues Hosting-Ziel, nur umgebogen");

  // Deploy beim Merge: Build aus dem Verify-Job wird hochgeladen, im Deploy-Job an genau den public-Pfad gelegt.
  const merge = await read(".github/workflows/firebase-hosting-merge.yml");
  const [mergeVerify, mergeDeploy] = merge.split(/\n  build_and_deploy:/);
  assert.match(mergeVerify, /name: angular-dist-u17\n\s+path: angular\/dist\/team-u17\/browser\n\s+if-no-files-found: error/);
  assert.match(mergeDeploy, /download-artifact[\s\S]*?name: angular-dist-u17\n\s+path: angular\/dist\/team-u17\/browser/);
  assert.ok(mergeDeploy.indexOf("angular-dist-u17") < mergeDeploy.indexOf("target: u17"), "Build muss vor dem u17-Deploy da sein");

  // Seit SCRUM-206 keine PR-Vorschau mehr auf der Live-Site der U17 (echte Daten); die Angular-Vorschau ist der
  // Testteam-Build auf u14 (Pruefung: tests/preview-guard.test.mjs). Alte U17-Vorschaukanaele raeumt weiter
  // firebase-preview-cleanup.yml auf (SCRUM-132).
  const preview = await read(".github/workflows/firebase-hosting-pull-request.yml");
  assert.doesNotMatch(preview, /target: u17|team-u17/);
  assert.match(await read(".github/workflows/firebase-preview-cleanup.yml"), /SITES: teamkompass-b8aac teamkompass-u14 teamkompass-u15 teamkompass-u17/);

});

test("Haupt-Team läuft auf dem Angular-Build mit Team-ID mein-team, Rückweg über das Archiv (SCRUM-208, SCRUM-211)", async () => {
  const config = JSON.parse(await read("firebase.json"));
  const main = config.hosting.find((entry) => entry.target === "main");
  const u14 = config.hosting.find((entry) => entry.target === "u14");
  assert.ok(main, "Hosting-Target main fehlt");

  // Public = Ausgabe der Build-Konfiguration mein-team, nie der Standard-Build (Testteam U14) oder ein anderes Team.
  const angular = JSON.parse(await read("angular/angular.json"));
  const build = angular.projects["teamkompass-angular"].architect.build.configurations["mein-team"];
  assert.equal(main.public, `angular/${build.outputPath}/browser`);
  const others = config.hosting.filter((entry) => entry.target !== "main").map((entry) => entry.public);
  assert.ok(!others.includes(main.public), "Haupt-Team braucht einen eigenen Ausgabeordner");
  assert.match(await read("angular/src/environments/environment.mein-team.ts"), /teamId: 'mein-team'/);

  // Gleiche Header (CSP, Caching) und SPA-Rewrite wie das erprobte Angular-Ziel u14.
  assert.deepEqual(main.headers, u14.headers);
  assert.deepEqual(main.rewrites, [{ source: "**", destination: "/index.html" }]);
  assert.deepEqual(main.ignore, u14.ignore);
  const firebaserc = JSON.parse(await read(".firebaserc"));
  assert.deepEqual(firebaserc.targets["teamkompass-b8aac"].hosting.main, ["teamkompass-b8aac"], "kein neues Hosting-Ziel, nur umgebogen");

  // Deploy beim Merge: Build aus dem Verify-Job wird hochgeladen, im Deploy-Job an genau den public-Pfad gelegt.
  const merge = await read(".github/workflows/firebase-hosting-merge.yml");
  const [mergeVerify, mergeDeploy] = merge.split(/\n  build_and_deploy:/);
  assert.match(mergeVerify, /name: angular-dist-mein-team\n\s+path: angular\/dist\/team-mein-team\/browser\n\s+if-no-files-found: error/);
  assert.match(mergeDeploy, /download-artifact[\s\S]*?name: angular-dist-mein-team\n\s+path: angular\/dist\/team-mein-team\/browser/);
  assert.ok(mergeDeploy.indexOf("angular-dist-mein-team") < mergeDeploy.indexOf("target: main"), "Build muss vor dem main-Deploy da sein");

  // Keine PR-Vorschau fuer Ziel main (echte mein-team-Daten, SCRUM-206/218); seit SCRUM-210 auch keine Alt-App-Vorschau
  // mehr (Pruefung: tests/preview-guard.test.mjs).
  const preview = await read(".github/workflows/firebase-hosting-pull-request.yml");
  const [, previewDeploy] = preview.split(/\n  build_and_preview:/);
  assert.doesNotMatch(preview, /target: main|angular-dist-mein-team|team-mein-team/, "keine Vorschau mit dem Haupt-Team (echte Daten)");
  assert.doesNotMatch(previewDeploy, /channelId: live/, "PR-Vorschau darf nie live deployen");
  // Jede Site mit PR-Vorschau wird aufgeräumt (SCRUM-132), sonst läuft das Kanal-Kontingent voll.
  const cleanup = await read(".github/workflows/firebase-preview-cleanup.yml");
  const sites = cleanup.match(/SITES: (.+)\n/)[1].split(/\s+/);
  for (const target of [...previewDeploy.matchAll(/target: (\S+)/g)].map((match) => match[1])) {
    assert.ok(sites.includes(firebaserc.targets["teamkompass-b8aac"].hosting[target][0]), `Vorschauen von ${target} werden nicht aufgeräumt`);
  }

});

test("Live-Team U15 läuft auf dem Angular-Build mit Team-ID U15, Rückweg über das Archiv (SCRUM-210, SCRUM-211)", async () => {
  const config = JSON.parse(await read("firebase.json"));
  const u15 = config.hosting.find((entry) => entry.target === "u15");
  const u14 = config.hosting.find((entry) => entry.target === "u14");
  assert.ok(u15, "Hosting-Target u15 fehlt");

  // Public = Ausgabe der Build-Konfiguration u15, nie der Standard-Build (Testteam U14) oder ein anderes Team.
  const angular = JSON.parse(await read("angular/angular.json"));
  const build = angular.projects["teamkompass-angular"].architect.build.configurations.u15;
  assert.equal(u15.public, `angular/${build.outputPath}/browser`);
  const others = config.hosting.filter((entry) => entry.target !== "u15").map((entry) => entry.public);
  assert.ok(!others.includes(u15.public), "U15 braucht einen eigenen Ausgabeordner");
  const env = await read("angular/src/environments/environment.u15.ts");
  assert.match(env, /teamId: 'U15'/);

  // Gleiche Header (CSP, Caching) und SPA-Rewrite wie das erprobte Angular-Ziel u14.
  assert.deepEqual(u15.headers, u14.headers);
  assert.deepEqual(u15.rewrites, [{ source: "**", destination: "/index.html" }]);
  assert.deepEqual(u15.ignore, u14.ignore);
  const firebaserc = JSON.parse(await read(".firebaserc"));
  assert.deepEqual(firebaserc.targets["teamkompass-b8aac"].hosting.u15, ["teamkompass-u15"], "kein neues Hosting-Ziel, nur umgebogen");

  // Seit SCRUM-210 liefert kein Hosting-Ziel mehr die Alt-App aus, seit SCRUM-211 ist sie archiviert.
  assert.deepEqual(config.hosting.filter((entry) => !entry.public.startsWith("angular/")).map((entry) => entry.target), []);

  // Deploy beim Merge: Build aus dem Verify-Job wird hochgeladen, im Deploy-Job an genau den public-Pfad gelegt.
  const merge = await read(".github/workflows/firebase-hosting-merge.yml");
  const [mergeVerify, mergeDeploy] = merge.split(/\n  build_and_deploy:/);
  assert.match(mergeVerify, /name: angular-dist-u15\n\s+path: angular\/dist\/team-u15\/browser\n\s+if-no-files-found: error/);
  assert.match(mergeDeploy, /download-artifact[\s\S]*?name: angular-dist-u15\n\s+path: angular\/dist\/team-u15\/browser/);
  assert.ok(mergeDeploy.indexOf("angular-dist-u15") < mergeDeploy.indexOf("target: u15"), "Build muss vor dem u15-Deploy da sein");
  assert.match(await read("angular/package.json"), /ng build -c production,u15/, "U15-Build entsteht in verify");

  // Keine PR-Vorschau mehr auf der Live-Site der U15 (echte Daten), auch nicht als Alt-App-Kopie (SCRUM-206/218).
  const preview = (await read(".github/workflows/firebase-hosting-pull-request.yml")).replace(/^\s*#.*$/gm, "");
  assert.doesNotMatch(preview, /target: u15|team-u15|legacy-preview|outputs\/u15/);
  // Alte U15-Vorschaukanäle räumt firebase-preview-cleanup.yml weiter auf (SCRUM-132).
  assert.match(await read(".github/workflows/firebase-preview-cleanup.yml"), /SITES: .*teamkompass-u15/);

});

test("Angular-PWA (SCRUM-76): Manifest, Service Worker im Produktions-Build, Update-Dateien nie lange gecacht", async () => {
  const angular = JSON.parse(await read("angular/angular.json"));
  const build = angular.projects["teamkompass-angular"].architect.build;
  assert.equal(build.configurations.production.serviceWorker, "ngsw-config.json");
  const ngsw = JSON.parse(await read("angular/ngsw-config.json"));
  assert.equal(ngsw.index, "/index.html");
  assert.ok(ngsw.assetGroups.some((group) => group.installMode === "prefetch" && group.resources.files.includes("/index.html")), "App-Shell muss vorgeladen werden (Offline-Start)");
  assert.ok(!JSON.stringify(ngsw).includes("googleapis"), "Firestore-/Auth-Anfragen gehoeren nicht in den Service-Worker-Cache");

  // Je Team ein Manifest (SCRUM-124); die Symbole liegen gemeinsam in public/.
  for (const team of ["u14", "mein-team", "u15", "u17"]) {
    const manifest = JSON.parse(await read(`angular/teams/${team}/manifest.webmanifest`));
    assert.equal(manifest.display, "standalone");
    for (const icon of manifest.icons) await read(`angular/public/${icon.src}`);
    assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"), `${team}: maskable-Symbol fehlt`);
  }
  const index = await read("angular/src/index.html");
  assert.match(index, /<link rel="manifest" href="manifest.webmanifest">/);

  // ngsw.json/ngsw-worker.js duerfen nicht unter die Jahres-Cache-Regel fallen, sonst sieht niemand ein Update.
  const config = JSON.parse(await read("firebase.json"));
  const target = config.hosting.find((entry) => entry.target === "u14");
  const immutableSources = target.headers.filter((entry) => entry.headers.some((header) => /immutable/.test(header.value))).map((entry) => entry.source);
  for (const source of immutableSources) {
    assert.notEqual(source, "**", "Die Sammelregel darf nicht immutable sein");
    assert.doesNotMatch(source, /ngsw|\.json|webmanifest/, `${source} wuerde den Service Worker einfrieren`);
  }
});

test("Angular: Spieler loeschen raeumt invites/members auf", async () => {
  const service = await read("angular/src/app/core/firebase/players.api.ts");
  assert.match(service, /collection\(db, \.\.\.base, 'invites'\), where\('playerId', '==', id\)/);
  assert.match(service, /collection\(db, \.\.\.base, 'members'\), where\('playerId', '==', id\)/);
});

test("Angular-Lockfile enthaelt kein verwundbares piscina mehr (SCRUM-56)", async () => {
  const lock = JSON.parse(await read("angular/package-lock.json"));
  const version = lock.packages["node_modules/piscina"]?.version;
  assert.ok(version, "piscina fehlt im Lockfile");
  const [major, minor, patch] = version.split(".").map(Number);
  const affected = major === 5 && (minor < 3 || (minor === 3 && patch <= 1));
  assert.equal(affected, false, `piscina ${version} ist von GHSA-67c8-pqhq-4rmx betroffen (5.0.0 bis 5.3.1)`);
});

test("interne Trainer-Notizen liegen in einem eigenen, nur für Trainer lesbaren Pfad", async () => {
  const rules = await read("firestore.rules");
  const block = rules.match(/match \/privateNotes\/\{playerId\} \{([\s\S]*?)\n        \}/);
  assert.ok(block, "Regel für events/{eventId}/privateNotes fehlt");
  assert.match(block[1], /allow read, write: if isTrainer\(\);/);
  assert.doesNotMatch(block[1], /isPlayerFor|isMedical|isTeamMember|"player"|"parent"/);

});

test("copy-team: Pfad-Mapping mein-team -> U14 und Schutz vor fremden Pfaden", () => {
  assert.equal(mapPath("teams/mein-team", "mein-team", "U14"), "teams/U14");
  assert.equal(mapPath("teams/mein-team/events/e1/ratings/p1", "mein-team", "U14"), "teams/U14/events/e1/ratings/p1");
  assert.throws(() => mapPath("teams/mein-team2/players/p1", "mein-team", "U14"));
  assert.throws(() => mapPath("teams/U17/players/p1", "mein-team", "U14"));
  assert.equal(collectionKey("teams/mein-team/events/e1/ratings/p1", "mein-team"), "events/ratings");
  assert.equal(collectionKey("teams/mein-team", "mein-team"), "(Team-Dokument)");
});

test("copy-team: Argumente, Dry-Run und Overwrite", () => {
  assert.deepEqual(parseArgs(["mein-team", "U14"]), { from: "mein-team", to: "U14", dryRun: false, overwrite: false });
  assert.deepEqual(parseArgs(["a", "b", "--dry-run", "--overwrite"]), { from: "a", to: "b", dryRun: true, overwrite: true });
  assert.throws(() => parseArgs(["a"]));
  assert.throws(() => parseArgs(["a", "a"]));
  assert.throws(() => parseArgs(["a", "b/c"]));
  assert.throws(() => parseArgs(["a", "b", "--force"]));
});

test("copy-team: Referenzen werden aufs Zielteam umgebogen, Timestamps bleiben", () => {
  class Ref { constructor(path) { this.path = path; } }
  const helpers = { isRef: (value) => value instanceof Ref, makeRef: (path) => new Ref(path) };
  class Timestamp {}
  const stamp = new Timestamp();
  const mapped = mapValue({ ref: new Ref("teams/mein-team/players/p1"), list: [new Ref("teams/mein-team/players/p2")], at: stamp, n: 3 }, "mein-team", "U14", helpers);
  assert.equal(mapped.ref.path, "teams/U14/players/p1");
  assert.equal(mapped.list[0].path, "teams/U14/players/p2");
  assert.equal(mapped.at, stamp);
  assert.equal(mapped.n, 3);
});

test("copy-team: Service-Account-Schluessel sind per .gitignore ausgeschlossen", async () => {
  assert.match(await read(".gitignore"), /service-account/);
});

test("Angular: Spieler loeschen entfernt Entwicklungsplaene, Abwesenheiten und Messwerte", async () => {
  const service = await read("angular/src/app/core/firebase/players.api.ts");
  assert.match(service, /PLAYER_SUBCOLLECTIONS = \['developmentPlans', 'absences', 'measurements'\]/);
  const start = service.indexOf("async deletePlayer(");
  const body = service.slice(start, service.indexOf("\n  }\n", start));
  assert.match(body, /PLAYER_SUBCOLLECTIONS\.map\(\(name\) => getDocs\(collection\(db, \.\.\.base, 'players', id, name\)\)\)/);
  assert.match(body, /children\.flatMap\(\(snapshot\) => snapshot\.docs\.map\(\(entry\) => entry\.ref\)\)/, "Unterdaten des Spielers bleiben beim Loeschen zurueck");
});

test("Angular: Spieler loeschen entfernt auch die internen Trainer-Notizen", async () => {
  const service = await read("angular/src/app/core/firebase/players.api.ts");
  const start = service.indexOf("async deletePlayer(");
  const body = service.slice(start, service.indexOf("\n  }\n", start));
  assert.match(body, /'events', event\.id, 'ratings', id\)/);
  assert.match(body, /'events', event\.id, 'privateNotes', id\)/, "interne Notizen des Spielers bleiben beim Loeschen zurueck");
});

test("SessionStart-Hook installiert nur festgeschriebene, integritätsgeprüfte Pakete (SCRUM-86)", async () => {
  const hook = await read(".claude/hooks/session-start.sh");
  assert.doesNotMatch(hook, /npm\s+(install|i)\s+(-g|--global)/, "keine globale Installation einer beweglichen Version");
  assert.match(hook, /npm ci\b/, "Installation über das Lockfile");
  assert.match(hook, /--ignore-scripts/, "Installationsskripte werden nicht ausgeführt");

  const pkg = JSON.parse(await read(".claude/hooks/tools/package.json"));
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name}: Version muss exakt festgeschrieben sein`);
  }

  const lock = JSON.parse(await read(".claude/hooks/tools/package-lock.json"));
  const entries = Object.entries(lock.packages).filter(([path]) => path !== "");
  assert.ok(entries.length > 0, "Lockfile enthält Pakete");
  for (const [path, entry] of entries) {
    assert.match(entry.integrity || "", /^sha512-/, `${path}: Integrität fehlt`);
    assert.match(entry.resolved || "", /^https:\/\/registry\.npmjs\.org\//, `${path}: Bezugsquelle ist nicht die npm-Registry`);
  }
});

test("Workflows: PR-Code laeuft ohne Service-Account-Secret, Secrets nicht inline interpoliert (SCRUM-57)", async () => {
  for (const file of [".github/workflows/firebase-hosting-pull-request.yml", ".github/workflows/firebase-hosting-merge.yml"]) {
    const workflow = await read(file);
    const [verifyJob, deployJob] = workflow.split(/\n  build_and_(?:preview|deploy):/);
    assert.ok(deployJob, `${file}: Deploy-Job fehlt`);
    assert.doesNotMatch(verifyJob, /secrets\.FIREBASE_SERVICE_ACCOUNT/, `${file}: Verify-Job darf das Secret nicht sehen`);
    assert.match(verifyJob, /npm ci --ignore-scripts/, `${file}: npm ci ohne Install-Skripte`);
    assert.doesNotMatch(deployJob, /npm (ci|run|install)/, `${file}: Deploy-Job fuehrt keinen Projektcode aus`);
    assert.match(deployJob, /needs: verify/);
  }
  const rules = await read(".github/workflows/firestore-rules-deploy.yml");
  assert.doesNotMatch(rules, /echo '\$\{\{ secrets/, "Secret nicht in die Shell-Zeile interpolieren");
  assert.match(rules, /FIREBASE_SERVICE_ACCOUNT: \$\{\{ secrets\./);
});

test("Hosting: Doku und Beispiel-Konfiguration werden nicht ausgeliefert, Startseite wird nicht gecacht (SCRUM-60/61)", async () => {
  const config = JSON.parse(await read("firebase.json"));
  for (const target of config.hosting) {
    assert.ok(target.ignore.includes("**/*.md"), `${target.target}: *.md muss ausgeschlossen sein`);
    assert.ok(target.ignore.includes("**/*.example.js"), `${target.target}: *.example.js muss ausgeschlossen sein`);
    const headers = target.headers ?? [];
    const noCache = (source) => headers.some((rule) => rule.source === source && rule.headers.some((header) => header.key === "Cache-Control" && /no-cache/.test(header.value)));
    // Angular: alle Antworten no-cache, nur die Dateien mit Hash im Namen sind langlebig.
    assert.ok(noCache("**"), `${target.target}: "**" braucht Cache-Control no-cache`);
    assert.ok(noCache("/index.html"), `${target.target}: "/index.html" braucht Cache-Control no-cache`);
  }
});

test("Rules-Tests: Lockfile mit Integritaet und CI-Workflow vorhanden (SCRUM-38)", async () => {
  const lock = JSON.parse(await read("tests/rules/package-lock.json"));
  const entries = Object.entries(lock.packages).filter(([path]) => path !== "");
  assert.ok(entries.length > 0);
  for (const [path, entry] of entries) {
    assert.match(entry.integrity || "", /^sha512-/, `${path}: Integritaet fehlt`);
    assert.match(entry.resolved || "", /^https:\/\/registry\.npmjs\.org\//, `${path}: Bezugsquelle ist nicht die npm-Registry`);
  }
  const workflow = await read(".github/workflows/rules-tests.yml");
  assert.match(workflow, /npm ci --ignore-scripts --prefix tests\/rules/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test("Der Begriff „Medizinischer Lesezugang“ ist nirgends mehr sichtbar; „medical“ gilt seit SCRUM-170 als Scout (SCRUM-91)", async () => {
  const files = [
    "angular/src/app/core/shell/navigation.ts",
    "angular/src/app/core/access/access.service.ts",
    "angular/src/app/pages/access/access.ts",
    "angular/src/app/pages/staff-account/staff-account.ts",
    "angular/src/app/pages/member-view/member-view.ts"
  ];
  for (const file of files) {
    const text = await read(file);
    assert.doesNotMatch(text, /medizinische[rnm]? Lesezugang/i, `${file}: alter Begriff sichtbar`);
  }
  assert.match(await read("firestore.rules"), /role in \["scout", "medical"\]/);
  assert.match(await read("firestore.rules"), /role == "physio"/);
});

test("Angular schreibt die Startelf mit merge, damit die Spiel-Aufstellungen (byEvent) erhalten bleiben (SCRUM-126)", async () => {
  const api = await read("angular/src/app/core/firebase/lineup.api.ts");
  // Seit SCRUM-181 kommt die Team-ID aus CurrentTeam (Datenbank) statt aus environment.teamId.
  assert.match(api, /setDoc\(doc\(db, 'teams', this\.team\.id\(\), 'meta', 'lineup'\), data, \{ merge: true \}\)/);
});

test("Angular: Kein Datenzugriff nutzt die feste Team-ID aus dem Build, alle nehmen das Team aus CurrentTeam (SCRUM-181)", async () => {
  const dir = "angular/src/app/core/firebase";
  const files = (await readdir(new URL(`../${dir}`, import.meta.url))).filter((name) => name.endsWith(".api.ts"));
  assert.ok(files.length > 0);
  for (const name of files) {
    assert.doesNotMatch(await read(`${dir}/${name}`), /environment\.teamId/, `${name} nutzt noch environment.teamId`);
  }
});

test("Angular: Build je Live-Team mit der Team-ID seiner echten Daten (SCRUM-124)", async () => {
  const angular = JSON.parse(await read("angular/angular.json"));
  const architect = angular.projects["teamkompass-angular"].architect;
  const configs = architect.build.configurations;
  const field = (source, key) => source.match(new RegExp(`${key}:\\s*["']([^"']+)["']`))?.[1];
  const buildTeams = JSON.parse(await read("angular/package.json")).scripts["build:teams"];

  // Standard-Build (Hosting-Ziel u14) bleibt das Testteam U14 – sonst schriebe teamkompass-u14 in Live-Daten.
  const base = await read("angular/src/environments/environment.ts");
  assert.equal(field(base, "teamId"), "U14");
  assert.ok(architect.build.options.assets.some((asset) => asset.input === "teams/u14"), "Standard-Build ohne U14-Manifest");

  // Team-ID und -Name der Live-Teams wie bisher (gleiche Daten teams/<teamId>/… und Zugänge wie die archivierte Alt-App).
  const liveTeams = {
    "mein-team": { teamId: "mein-team", teamName: "1. FC Königstein U14" },
    u15: { teamId: "U15", teamName: "1. FC Königstein U15" },
    u17: { teamId: "U17", teamName: "1. FC Königstein U17" },
  };
  for (const [name, expected] of Object.entries(liveTeams)) {
    const config = configs[name];
    assert.ok(config, `${name}: Build-Konfiguration fehlt`);
    assert.deepEqual(config.fileReplacements, [
      { replace: "src/environments/environment.ts", with: `src/environments/environment.${name}.ts` },
    ]);
    const env = await read(`angular/src/environments/environment.${name}.ts`);
    assert.equal(field(env, "teamId"), expected.teamId, `${name}: Team-ID weicht von den echten Daten ab`);
    assert.equal(field(env, "teamName"), expected.teamName, `${name}: Teamname weicht ab`);

    const manifest = JSON.parse(await read(`angular/teams/${name}/manifest.webmanifest`));
    assert.equal(manifest.name, `TeamKompass – ${field(env, "teamName")}`);
    assert.ok(config.assets.some((asset) => asset.input === `teams/${name}` && asset.glob === "manifest.webmanifest"));
    assert.ok(config.assets.some((asset) => asset.input === "public"), `${name}: public-Dateien fehlen im Build`);

    // Eigener Ausgabeordner, damit der u14-Deploy nie ein Live-Team-Bundle erwischt.
    assert.equal(config.outputPath, `dist/team-${name}`);
    assert.match(buildTeams, new RegExp(`-c production,${name}(\\s|$)`), `${name}: wird in verify nicht gebaut`);
    // Kein Entwicklungsserver gegen Live-Daten.
    assert.ok(!architect.serve.configurations[name], `${name}: ng serve darf nicht auf Live-Daten zeigen`);
  }
  assert.match(await read("package.json"), /npm --prefix angular run build:teams/, "verify baut die Team-Konfigurationen nicht");
});

test("Angular zeigt das Vereinslogo statt des „TK“-Zeichens (SCRUM-76)", async () => {
  for (const file of ["angular/src/app/shell/sidebar/sidebar.html", "angular/src/app/pages/login/login.html"]) {
    const html = await read(file);
    // Sidebar seit SCRUM-181: Logo aus CurrentTeam.logoSrc() (mitgeliefertes club-logo.png nur für dessen Vereine).
    assert.match(html, /<img class="logo" (src="club-logo\.png"|\[src\]="logo")/);
    assert.doesNotMatch(html, />TK</);
  }
  const team = await read("angular/src/app/core/team/current-team.service.ts");
  assert.match(team, /'club-logo\.png'/);
  const logo = await readFile(new URL("../angular/public/club-logo.png", import.meta.url));
  assert.equal(logo.subarray(1, 4).toString(), "PNG");
});

test("Belastungsanzeige im Profil trennt 7-Tage-Wert und Wochenschnitt (SCRUM-135)", async () => {
  const html = await read("angular/src/app/pages/profile/profile.html");
  assert.match(html, /Belastung letzte 7 Tage/);
  assert.match(html, /Schnitt der 3 Wochen davor/);
  assert.equal(html.includes("Ø Belastung {{ numberLabel(r.load) }}"), false);
});

test("Alt-App ist archiviert: kein Code, kein Build und kein Hosting-Ziel mehr, Rückweg dokumentiert (SCRUM-211)", async () => {
  // Weder die Team-Kopien noch die frühere Root-Kopie liegen noch im Repo.
  const top = (await readdir(new URL("..", import.meta.url))).sort();
  for (const gone of ["outputs", "app.js", "index.html", "styles.css", "firebase-config.js", "firebase-config.example.js", "assets"]) {
    assert.ok(!top.includes(gone), `${gone} gehört zur archivierten Alt-App`);
  }
  assert.equal(await exists("scripts/legacy-preview.mjs"), false, "Alt-App-Vorschau-Skript gehört ins Archiv");

  // Nur Angular wird gebaut und ausgeliefert.
  const config = JSON.parse(await read("firebase.json"));
  assert.deepEqual(config.hosting.map((entry) => entry.target).sort(), ["main", "u14", "u15", "u17"]);
  for (const entry of config.hosting) assert.match(entry.public, /^angular\/dist\/[^/]+\/browser$/, `${entry.target}: kein Angular-Build`);
  const pkg = JSON.parse(await read("package.json"));
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /outputs\/|legacy-preview/, "verify prüft noch Alt-App-Dateien");
  for (const file of ["firebase-hosting-merge.yml", "firebase-hosting-pull-request.yml"]) {
    const workflow = (await read(`.github/workflows/${file}`)).replace(/^\s*#.*$/gm, "");
    assert.doesNotMatch(workflow, /outputs\/|legacy-preview|dist\/preview/, `${file}: Schritt für die Alt-App`);
  }

  // Rückweg: Archiv-Stand mit Befehl zum Zurückholen, Hosting-Eintrag der Alt-App (CSP mit dem gstatic-SDK).
  const setup = await read("FIREBASE_SETUP.md");
  const archive = setup.match(/Archiv-Stand[^`]*`([0-9a-f]{40})`/);
  assert.ok(archive, "FIREBASE_SETUP.md nennt den Archiv-Commit nicht");
  assert.match(setup, new RegExp(`git checkout ${archive[1]} -- outputs/`), "Befehl zum Zurückholen fehlt");
  assert.match(setup, /https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.5\//, "Hosting-Eintrag der Alt-App fehlt");
});
