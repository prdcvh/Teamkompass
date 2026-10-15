import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { collectionKey, mapPath, mapValue, parseArgs } from "../scripts/copy-team-lib.mjs";

const teams = ["team-manager", "u15", "u17"];
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("alle Team-Instanzen verwenden dieselbe App-Basis", async () => {
  for (const file of ["app.js", "index.html", "styles.css", "base.css", "mobile.css", "next-level.js"]) {
    const hashes = await Promise.all(teams.map(async (team) => hash(await read(`outputs/${team}/${file}`))));
    assert.equal(new Set(hashes).size, 1, `${file} ist zwischen den Teams divergiert`);
  }
});

test("Einladungstokens sind stark und werden atomar verbraucht", async () => {
  const app = await read("outputs/team-manager/app.js");
  const rules = await read("firestore.rules");
  assert.match(app, /getRandomValues\(new Uint8Array\(24\)\)/);
  assert.match(app, /batch\.delete\(inviteRef\)/);
  assert.match(rules, /getAfter\([\s\S]*claimedInviteCode == code/);
});

test("Eltern und medizinische Leserechte sind getrennt; Co-Trainer ist nicht eingeführt", async () => {
  const app = await read("outputs/team-manager/app.js");
  const rules = await read("firestore.rules");
  assert.match(rules, /\["player", "parent"\]/);
  assert.match(rules, /function isMedical\(\)/);
  assert.doesNotMatch(`${app}\n${rules}`, /role\s*[:=]\s*["']co.?trainer["']/i);
});

test("bekannte persistente XSS-Senken sind escaped", async () => {
  const app = await read("outputs/team-manager/app.js");
  for (const unsafe of ["<strong>${player.name}</strong>", "<strong>${event.title}</strong>", "${rating.note || event.notes || \"Keine Notiz\"}", "<td>${event.type}</td>", "${bestEvent.event.type}"]) {
    assert.equal(app.includes(unsafe), false, `unsichere Ausgabe gefunden: ${unsafe}`);
  }
});

test("Hosting setzt grundlegende Browser-Sicherheitsheader", async () => {
  const config = JSON.parse(await read("firebase.json"));
  for (const target of config.hosting) {
    const headers = target.headers.flatMap((entry) => entry.headers).map((entry) => entry.key);
    for (const required of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) assert.ok(headers.includes(required), `${target.target}: ${required} fehlt`);
  }
});

test("CSP erlaubt nur den versionierten Firebase-SDK-Pfad und die benoetigten Google-Dienste (SCRUM-62)", async () => {
  const config = JSON.parse(await read("firebase.json"));
  for (const target of config.hosting) {
    const csp = target.headers.flatMap((entry) => entry.headers).find((entry) => entry.key === "Content-Security-Policy").value;
    const directive = (name) => csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) || "";
    const script = directive("script-src").split(/\s+/).slice(1);
    const connect = directive("connect-src").split(/\s+/).slice(1);
    for (const source of script) assert.ok(source === "'self'" || source === "https://www.gstatic.com/firebasejs/10.12.5/", `${target.target}: script-src erlaubt ${source}`);
    assert.deepEqual(connect.sort(), ["'self'", "https://firestore.googleapis.com", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"].sort(), `${target.target}: connect-src zu breit`);
  }
  // Die Live-Kopien laden das SDK genau aus diesem Pfad; aendert sich die Version, muss die CSP mitziehen.
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const versions = new Set([...app.matchAll(/https:\/\/www\.gstatic\.com\/firebasejs\/([\d.]+)\//g)].map((match) => match[1]));
    assert.deepEqual([...versions], ["10.12.5"], `${team}: SDK-Version passt nicht zur CSP`);
  }
});

test("Druckbericht trennt das neue Fenster von der App (SCRUM-62)", async () => {
  for (const file of ["app.js", ...teams.map((team) => `outputs/${team}/app.js`)]) {
    const app = await read(file);
    const start = app.indexOf('const report = window.open("", "_blank");');
    assert.notEqual(start, -1, `${file}: Druckbericht nicht gefunden`);
    assert.match(app.slice(start, start + 400), /report\.opener = null;/, `${file}: Bericht behaelt Zugriff auf die App (opener)`);
  }
});

test("PWA-Dateien und alle Ansichten sind eingebunden", async () => {
  const html = await read("outputs/team-manager/index.html");
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /next-level\.js/);
  for (const view of ["dashboardView", "squadView", "eventsView", "profilesView", "opponentsView", "teamAnalysisView"]) {
    assert.match(html, new RegExp(`id="${view}"`), `${view} fehlt`);
  }
});

test("der ausgebaute Planungsbereich hinterlaesst keine Reste", async () => {
  for (const team of teams) {
    for (const file of ["index.html", "app.js", "next-level.js"]) {
      const content = await read(`outputs/${team}/${file}`);
      assert.ok(!content.includes("planningView"), `${team}/${file}: planningView noch vorhanden`);
      assert.ok(!/data-view="planning"/.test(content), `${team}/${file}: Navigationseintrag noch vorhanden`);
      assert.ok(!content.includes("renderOperations"), `${team}/${file}: Planungs-Rendering noch vorhanden`);
    }
    // Der Zugriff auf die frueher dort gepflegte Aufbewahrungsdauer bleibt
    // bewusst bestehen, damit gespeicherte Werte weiter respektiert werden.
    const app = await read(`outputs/${team}/app.js`);
    assert.match(app, /teamkompass-workspace-v1/);
  }
});

test("die Datenschutz-Bedienelemente sind ueber das Aktionen-Menue erreichbar", async () => {
  for (const team of teams) {
    const html = await read(`outputs/${team}/index.html`);
    // Der Einstieg muss im Aktionen-Menue der Kopfzeile liegen, nicht in einer Ansicht.
    const actionMenu = html.slice(html.indexOf('<div class="action-menu-list">'), html.indexOf("</details>"));
    assert.ok(actionMenu.includes('id="privacyBtn"'), `${team}: Einstieg fehlt im Aktionen-Menue`);
    assert.match(html, /<dialog id="privacyDialog">/);
    for (const control of ["retentionDays", "clearLocalCacheBtn", "activityLog"]) {
      assert.ok(html.includes(`id="${control}"`), `${team}: Bedienelement ${control} fehlt`);
    }
  }

  // Der Dialog ist optional: die Render-Funktion muss jedes Element einzeln pruefen.
  const nextLevel = await read("outputs/team-manager/next-level.js");
  assert.match(nextLevel, /const dialog = document\.querySelector\("#privacyDialog"\);\s*\n\s*if \(!dialog\) return;/);
  assert.match(nextLevel, /if \(retention\) retention\.value/);
  assert.match(nextLevel, /if \(!log\) return;/);

  // Die Aufbewahrungsdauer wirkt beim App-Start und ist wieder einstellbar -
  // beide Seiten muessen denselben Schluessel benutzen.
  const app = await read("outputs/team-manager/app.js");
  assert.match(app, /teamkompass-workspace-v1/);
  assert.match(nextLevel, /workspaceKey = "teamkompass-workspace-v1"/);
});

test("Handy- und Desktop-Stylesheet sind sauber getrennt", async () => {
  const html = await read("outputs/team-manager/index.html");
  // base.css gilt immer, die beiden Layout-Stylesheets schliessen einander aus.
  assert.match(html, /<link rel="stylesheet" href="\.\/base\.css" \/>/);
  assert.match(html, /href="\.\/styles\.css" media="\(min-width: 721px\)"/);
  assert.match(html, /href="\.\/mobile\.css" media="\(max-width: 720px\)"/);
  assert.doesNotMatch(html, /responsive-enhancements\.css/);

  // Im Desktop-Stylesheet duerfen keine Handy-Breakpoints mehr stehen -
  // die waeren dort wirkungslos und wuerden nur Verwirrung stiften.
  const desktop = await read("outputs/team-manager/styles.css");
  assert.doesNotMatch(desktop, /@media \(max-width: (720|480)px\)/);

  // Rollenrechte sind Verhalten, kein Layout: sie muessen in base.css stehen,
  // sonst greifen sie je nach Bildschirmbreite nicht.
  const base = await read("outputs/team-manager/base.css");
  for (const rule of ["body.role-player", "body.role-parent", "body.role-medical", "body.role-trainer-cloud", "body.auth-locked"]) {
    assert.ok(base.includes(rule), `${rule} fehlt in base.css`);
    assert.ok(!desktop.includes(rule), `${rule} steht noch in styles.css`);
  }
});

test("Service Worker und Hosting kennen die neuen Stylesheets", async () => {
  const worker = await read("outputs/team-manager/service-worker.js");
  assert.match(worker, /\.\/base\.css/);
  assert.match(worker, /\.\/mobile\.css/);
  assert.doesNotMatch(worker, /responsive-enhancements/);

  const hosting = JSON.parse(await read("firebase.json"));
  // Die Angular-Site (u14) liefert gehashte Bundles statt base.css/mobile.css.
  for (const site of hosting.hosting.filter((entry) => entry.public.startsWith("outputs/"))) {
    const sources = site.headers.map((entry) => entry.source);
    assert.ok(sources.includes("/base.css"), `${site.target}: /base.css ohne no-cache-Header`);
    assert.ok(sources.includes("/mobile.css"), `${site.target}: /mobile.css ohne no-cache-Header`);
    assert.ok(!sources.includes("/responsive-enhancements.css"), `${site.target}: alter Stylesheet-Header noch vorhanden`);
  }
});

test("Rollen-Modus sperrt die Oberflaeche vor dem ersten Rendern und laedt keine lokalen Daten", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    // Ohne Anmeldung weder localStorage-Zwischenspeicher noch Demo-Daten.
    assert.match(app, /function loadState\(\) \{\s*if \(isRoleModeConfigured\(\)\) return normalizeState\(\{ players: \[\], events: \[\], opponents: \[\] \}\);/, `${team}: loadState liefert im Rollen-Modus nicht leer`);
    // Sperre steht vor dem ersten renderAll() des Starts.
    assert.match(app, /if \(isRoleModeConfigured\(\)\) showAuthGateLoading\(\);\s*renderAll\(\);\s*initDataStore\(\);/, `${team}: Login-Sperre fehlt vor dem ersten Rendern`);
    // Fehlschlag beim Laden von Firebase zeigt die Maske mit Fehlermeldung statt der App.
    assert.match(app, /Cloud nicht erreichbar[\s\S]{0,200}showAuthGateError\(/, `${team}: Fehlerfall zeigt keine Login-Sperre`);
  }
});

test("Abmelden entfernt den lokalen Teamstand; Nicht-Trainer-Rollen cachen nicht", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    assert.match(app, /function clearLocalTeamData\(\) \{\s*\[storageKey, legacyStorageKey, cacheStampKey\]/, `${team}: Loeschfunktion fehlt`);
    assert.match(app, /async function handleSignOut\(\) \{[\s\S]*?signOut\(authInstance\);\s*clearLocalTeamData\(\);[\s\S]*?location\.reload\(\);/, `${team}: Abmelden leert den Cache nicht`);
    assert.match(app, /if \(!user\) \{[\s\S]{0,200}clearLocalTeamData\(\);/, `${team}: fehlende Anmeldung raeumt den Cache nicht auf`);
    assert.match(app, /\["player", "parent", "medical"\]\.includes\(currentRole\)/, `${team}: Nicht-Trainer-Rollen duerfen nicht cachen`);
    assert.equal((app.match(/localStorage\.setItem\(storageKey/g) || []).length, 2, `${team}: ungeschuetzter Schreibzugriff auf den Cache`);
  }
});

test("Eltern-Zugang laedt die Bewertungen des verknuepften Spielers", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    assert.match(app, /\["player", "parent"\]\.includes\(currentRole\) && currentPlayerId\) syncPlayerRatingListeners\(eventIds\)/, `${team}: Eltern erhalten keine Bewertungs-Listener`);
  }
});

test("Spielergebnis: leer und Zukunft zaehlen nicht, nur eingetragene vergangene Ergebnisse", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const start = app.indexOf("function hasScore(");
    const end = app.indexOf("function teamAverageGradeForEvent(");
    assert.ok(start > 0 && end > start, `${team}: Ergebnis-Funktionen nicht gefunden`);
    const { gameResult, scoreOrEmpty } = new Function(`${app.slice(start, end)}; return { gameResult, scoreOrEmpty };`)();
    const past = "2020-01-01";
    const future = "2999-01-01";
    assert.equal(gameResult({ type: "Spiel", date: past, goalsFor: "", goalsAgainst: "" }), null);
    assert.equal(gameResult({ type: "Spiel", date: past, goalsFor: 2, goalsAgainst: "" }), null);
    assert.equal(gameResult({ type: "Spiel", date: future, goalsFor: 0, goalsAgainst: 0 }), null, "Zukunfts-0:0 darf nicht zaehlen");
    assert.equal(gameResult({ type: "Training", date: past, goalsFor: 1, goalsAgainst: 0 }), null);
    assert.equal(gameResult({ type: "Spiel", date: past, goalsFor: 0, goalsAgainst: 0 }).outcome, "Unentschieden");
    assert.equal(gameResult({ type: "Spiel", date: past, goalsFor: 3, goalsAgainst: 1 }).outcome, "Sieg");
    assert.equal(scoreOrEmpty(""), "");
    assert.equal(scoreOrEmpty("  "), "");
    assert.equal(scoreOrEmpty("0"), 0);
    assert.equal(scoreOrEmpty("4"), 4);
  }
});

test("neue Spiele starten ohne Ergebnis (Felder leer, nicht 0)", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const html = await read(`outputs/${team}/index.html`);
    assert.doesNotMatch(html, /id="event(GoalsFor|GoalsAgainst)"[^>]*value="0"/, `${team}: Ergebnisfeld ist mit 0 vorbelegt`);
    assert.doesNotMatch(app, /\$\("#event(GoalsFor|GoalsAgainst)"\)\.value = 0/, `${team}: Dialog setzt Ergebnis auf 0`);
    assert.doesNotMatch(app, /goalsFor === "" \? 0/, `${team}: Bewertungsbereich zeigt leeres Ergebnis als 0`);
  }
});

test("Ansichten sind je Rolle gesperrt (setView) und die Suche zeigt nur erlaubte Bereiche", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const nextLevel = await read(`outputs/${team}/next-level.js`);
    const start = app.indexOf("function allowedViews()");
    const end = app.indexOf("function setView(");
    assert.ok(start > 0 && end > start, `${team}: allowedViews fehlt`);
    const allowedFor = (role) => new Function("currentRole", "views", `${app.slice(start, end)}; return allowedViews();`)(role, { dashboard: 1, squad: 1, events: 1, profiles: 1, opponents: 1, teamAnalysis: 1 });
    assert.deepEqual(allowedFor("player"), ["profiles"]);
    assert.deepEqual(allowedFor("parent"), ["profiles"]);
    assert.deepEqual(allowedFor("medical"), ["squad", "profiles"]);
    assert.equal(allowedFor("trainer").length, 6);
    assert.match(app, /function setView\(viewName\) \{\s*if \(!allowedViews\(\)\.includes\(viewName\)\) return;/, `${team}: setView prueft die Rolle nicht`);
    assert.match(app, /openEvent: \(eventId\) => \{\s*if \(!allowedViews\(\)\.includes\("events"\)\) return;/, `${team}: openEvent prueft die Rolle nicht`);
    assert.match(nextLevel, /allowedViews\?\.\(\)/, `${team}: Befehlspalette filtert nicht nach Rolle`);
  }
});

test("Spieler und Eltern sehen keine Bearbeiten-/Loeschen-Buttons bei Abwesenheiten und Messwerten", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const css = await read(`outputs/${team}/base.css`);
    for (const action of ["edit-plan", "edit-absence", "edit-measurement"]) {
      assert.match(app, new RegExp(`\\$\\{canManageRecords\\(\\) \\? \`<div class="row-actions">\\s*<button[^>]*data-action="${action}"`), `${team}: ${action}-Buttons werden ungeprueft gerendert`);
    }
    for (const role of ["player", "parent"]) {
      for (const list of ["#absenceList", "#measurementList"]) {
        assert.ok(css.includes(`body.role-${role} ${list} .row-actions`), `${team}: ${role} ${list} nicht per CSS ausgeblendet`);
      }
    }
  }
});

test("Dashboard zeigt das zeitlich naechste Event im deutschen Datumsformat", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const start = app.indexOf("function nextUpcomingEvent()");
    const end = start + app.slice(start).indexOf("\n}\n") + 3;
    assert.ok(start > 0 && end > start, `${team}: nextUpcomingEvent fehlt`);
    const startOfToday = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; };
    const iso = (offset) => { const date = new Date(); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
    const state = { events: [{ id: "far", date: iso(30) }, { id: "past", date: iso(-3) }, { id: "next", date: iso(2) }, { id: "today", date: iso(0) }] };
    const nextUpcomingEvent = new Function("state", "startOfToday", `${app.slice(start, end)}; return nextUpcomingEvent;`)(state, startOfToday);
    assert.equal(nextUpcomingEvent().id, "today");
    state.events.splice(3, 1);
    assert.equal(nextUpcomingEvent().id, "next");
    assert.match(app, /<strong>\$\{formatDate\(nextEvent\.date\)\}<\/strong><small>\$\{escapeHtml\(nextEvent\.title\)\}<\/small>/, `${team}: Datum/Titel nicht formatiert bzw. escaped`);
  }
});

test("alle Cloud-Schreibfunktionen setzen die Sync-Anzeige zurueck (Erfolg und Fehler)", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const start = app.indexOf("async function cloudWrite(");
    const end = app.indexOf("// ---- Auth-Gate (Login)");
    assert.ok(start > 0 && end > start, `${team}: cloudWrite fehlt`);
    const names = ["cloudSaveDevelopmentPlan", "cloudDeleteDevelopmentPlan", "cloudSaveAbsence", "cloudDeleteAbsence", "cloudSaveMeasurement", "cloudDeleteMeasurement", "cloudSaveLineup", "cloudSaveOpponent", "cloudDeleteOpponent"];
    const build = (fail) => {
      const calls = [];
      const firestoreModule = {
        setDoc: async () => { if (fail) throw new Error("boom"); },
        deleteDoc: async () => { if (fail) throw new Error("boom"); }
      };
      const api = new Function("isCloudTrainer", "firestoreModule", "teamDoc", "cloudWriteSucceeded", "cloudWriteFailed", `${app.slice(start, end)}; return { ${names.join(", ")} };`)(
        () => true, firestoreModule, () => "ref", () => calls.push("ok"), () => calls.push("fail")
      );
      return { api, calls };
    };
    for (const fail of [false, true]) {
      const { api, calls } = build(fail);
      await api.cloudSaveDevelopmentPlan("p", { id: "x" });
      await api.cloudDeleteDevelopmentPlan("p", "x");
      await api.cloudSaveAbsence("p", { id: "x" });
      await api.cloudDeleteAbsence("p", "x");
      await api.cloudSaveMeasurement("p", { id: "x" });
      await api.cloudDeleteMeasurement("p", "x");
      await api.cloudSaveLineup({});
      await api.cloudSaveOpponent({ id: "x" });
      await api.cloudDeleteOpponent("x");
      assert.deepEqual(calls, Array(names.length).fill(fail ? "fail" : "ok"), `${team}: Sync-Status ${fail ? "Fehler" : "Erfolg"} nicht fuer alle gesetzt`);
    }
  }
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

test("Spieler loeschen raeumt auch Einladungen und Zugaenge (invites/members) auf", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const body = app.match(/async function cloudDeletePlayer\(playerId\) \{([\s\S]*?)\n\}\n/)?.[1] || "";
    assert.match(body, /\["invites", "members"\]/, `${team}: invites/members werden beim Loeschen nicht berücksichtigt`);
    assert.match(body, /where\("playerId", "==", playerId\)/, `${team}: Zugaenge werden nicht per playerId gefunden`);
  }
});

test("Angular: Spieler loeschen raeumt invites/members auf", async () => {
  const service = await read("angular/src/app/core/firebase/players.api.ts");
  assert.match(service, /collection\(db, \.\.\.base, 'invites'\), where\('playerId', '==', id\)/);
  assert.match(service, /collection\(db, \.\.\.base, 'members'\), where\('playerId', '==', id\)/);
});

test("Listener-Fehler setzen einen sichtbaren Status und werden bei neuem Snapshot zurueckgesetzt", async () => {
  for (const team of teams) {
    const source = await read(`outputs/${team}/app.js`);
    const html = await read(`outputs/${team}/index.html`);
    assert.match(html, /<small id="storageState" role="status" aria-live="polite">/, `${team}: Status nicht als Live-Region erkennbar`);
    assert.doesNotMatch(source, /\(error\) => console\.error\("[a-zA-Z ]* sync"/, `${team}: Listener-Fehler landen nur in der Konsole`);

    const calls = [];
    const timers = [];
    const context = {
      console: { error() {} },
      setSyncState: (stateName, label) => calls.push([stateName, label]),
      setTimeout: (fn) => { timers.push(fn); return timers.length; },
      stopCloudSync: () => calls.push(["stop"]),
      startCloudSync: () => calls.push(["start"]),
      currentRole: "trainer"
    };
    const prelude = source.match(/const cloudListenerFailures[\s\S]*?const RETRYABLE_LISTENER_ERRORS = .*\n/)[0];
    const code = ["cloudListenerFailed", "cloudListenerRecovered"].map((name) => {
      const start = source.indexOf(`function ${name}(`);
      return source.slice(start, source.indexOf("\n}\n", start) + 3);
    }).join("\n");
    const fns = new Function(...Object.keys(context), `${prelude}\n${code}\nreturn { cloudListenerFailed, cloudListenerRecovered };`)(...Object.values(context));

    fns.cloudListenerFailed("events", { code: "unavailable", message: "transport errored" });
    assert.deepEqual(calls[0][0], "error");
    assert.match(calls[0][1], /Verbindung unterbrochen/);
    assert.doesNotMatch(calls[0][1], /transport errored|unavailable/, "technische Details duerfen nicht in der Oberflaeche stehen");
    assert.equal(timers.length, 1, "voruebergehende Fehler starten die Synchronisation neu");
    fns.cloudListenerFailed("ratings:e1", { code: "unavailable" });
    assert.equal(timers.length, 1, "kein zweiter Neustart-Timer");

    fns.cloudListenerRecovered("events");
    assert.equal(calls.filter((call) => call[0] === "saved").length, 0, "solange ein Listener ausgefallen ist, bleibt der Fehlerstatus");
    fns.cloudListenerRecovered("ratings:e1");
    assert.deepEqual(calls.at(-1), ["saved", "Cloud verbunden"]);

    // Berechtigungsfehler: Status, aber kein Neustart-Schleife.
    const before = timers.length;
    fns.cloudListenerFailed("players", { code: "permission-denied" });
    assert.equal(timers.length, before);
  }
  const root = await read("app.js");
  assert.match(root, /subscribe\(callback, onError\)/);
  assert.match(await read("index.html"), /id="storageState" role="status"/);
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

  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    // Das Event-Dokument ist für alle Teammitglieder lesbar: interne Notizen dürfen dort nie landen.
    assert.match(app, /const \{ ratings, privateNotes, \.\.\.meta \} = event;/, `${team}: cloudSaveEvent schreibt interne Notizen ins Event`);
    // Das Bewertungsdokument liest der Spieler selbst: auch dort keine interne Notiz.
    assert.match(app, /teamDoc\("events", eventId, "privateNotes", playerId\)/, `${team}: privateNotes-Pfad fehlt`);
    assert.doesNotMatch(app, /ratings\[[^\]]+\]\.privateNote/, `${team}: interne Notiz im Bewertungsobjekt`);
    // Spieler/Eltern laden den Pfad gar nicht erst.
    assert.match(app, /if \(currentRole === "trainer"\) \{\s*syncRatingListeners\(eventIds\);\s*syncPrivateNoteListeners\(eventIds\);/, `${team}: privateNotes werden nicht nur für Trainer geladen`);
  }
});

test("Löschen von Events und Spielern entfernt auch die internen Notizen", async () => {
  const app = await read("outputs/team-manager/app.js");
  assert.match(app, /teamCollection\("events", event\.id, "privateNotes"\)/);
  assert.match(app, /getDoc\(teamDoc\("events", event\.id, "privateNotes", playerId\)\)/);
});

test("Events lassen sich nachtraeglich bearbeiten, Bewertungen bleiben erhalten", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const html = await read(`outputs/${team}/index.html`);
    assert.match(html, /id="editEventBtn"/);
    assert.match(html, /id="eventId"/);
    assert.match(app, /ratings: existing\?\.ratings \|\| \{\}/, `${team}: Bewertungen muessen beim Bearbeiten erhalten bleiben`);
    assert.match(app, /existing\?\.id \|\| `e\$\{crypto\.randomUUID\(\)\}`/);
    assert.match(app, /applyAutoAbsence\(newEvent\)/);
  }
});

test("Event bearbeiten behaelt die internen Trainer-Notizen", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const start = app.indexOf("function saveEvent(");
    const body = app.slice(start, app.indexOf("\n}\n", start));
    assert.match(body, /ratings: existing\?\.ratings \|\| \{\}/, `${team}: Bewertungen gehen beim Bearbeiten verloren`);
    assert.match(body, /privateNotes: existing\?\.privateNotes \|\| \{\}/, `${team}: interne Notizen gehen beim Bearbeiten verloren`);
  }
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

// Zieht Funktionen aus app.js (ein Browser-Skript ohne Exporte) und führt sie mit Testdaten aus.
function loadFunctions(source, names, context) {
  const code = names.map((name) => {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `function ${name} nicht gefunden`);
    const end = source.indexOf("\n}\n", start);
    return source.slice(start, end + 3);
  }).join("\n");
  return new Function(...Object.keys(context), `${code}\nreturn { ${names.join(", ")} };`)(...Object.values(context));
}

test("Anwesenheits- und Einsatzquote zählen keine zukünftigen oder ungesetzten Events", async () => {
  for (const team of teams) {
    const source = await read(`outputs/${team}/app.js`);
    const day = (offset) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };
    const state = { events: [] };
    const add = (type, offset, attendance, extra = {}) => state.events.push({ id: `e${state.events.length}`, type, date: day(offset), matchDuration: 90, ratings: attendance ? { p1: { attendance, ...extra } } : {} });
    add("Training", -3, "present");
    add("Training", -2, "present");
    add("Training", -1, "absent");
    add("Training", 0, "limited");
    add("Training", -4, "open");        // vergangen, aber noch nicht bewertet
    add("Training", -5, null);          // vergangen, keine Bewertung angelegt
    for (let i = 1; i <= 10; i += 1) add("Training", i, "open"); // im Voraus angelegt
    add("Training", 2, "absent");       // zukünftige automatische Abwesenheit
    add("Spiel", -6, "present", { minutes: 90 });
    add("Spiel", -7, "excluded");       // Nicht im Kader
    add("Spiel", -8, "present", { minutes: 45 });
    add("Spiel", 3, "open");            // zukünftiges Spiel
    add("Spiel", 4, "present", { minutes: 90 }); // fälschlich schon gesetztes Zukunftsspiel
    const fns = loadFunctions(source, ["startOfToday", "gameEvents", "roundGrade", "countsForPlayerStats", "profileAvailability", "playerGameStats"], { state });

    const [present, limited, absent, excluded] = fns.profileAvailability("p1");
    // Gezählt: 4 Trainings + 3 Spiele (inkl. Nicht im Kader) = 7 Events
    assert.equal(present.display, "4/7", `${team}: Anwesend`);
    assert.equal(limited.display, "1/7", `${team}: Teilweise`);
    assert.equal(absent.display, "1/7", `${team}: Fehlt`);
    assert.equal(excluded.display, "1/7", `${team}: Nicht im Kader`);

    const stats = fns.playerGameStats("p1");
    assert.equal(stats.games, 2, `${team}: Spiele ohne Nicht-im-Kader und Zukunft`);
    assert.equal(stats.possibleMinutes, 180, `${team}: mögliche Minuten`);
    assert.equal(stats.minutes, 135, `${team}: gespielte Minuten`);
    assert.equal(stats.appearanceRate, 75, `${team}: Einsatzquote`);

    // Zukünftige Events ändern nichts
    const before = JSON.stringify([fns.profileAvailability("p1"), fns.playerGameStats("p1")]);
    add("Training", 20, "open");
    add("Spiel", 21, "present", { minutes: 90 });
    assert.equal(JSON.stringify([fns.profileAvailability("p1"), fns.playerGameStats("p1")]), before, `${team}: Zukunft verändert die Quote`);
  }
});

test("Gelöschte oder verkürzte Abwesenheit setzt automatisch gesetzte „Fehlt“-Einträge zurück", async () => {
  for (const team of teams) {
    const source = await read(`outputs/${team}/app.js`);
    const saved = [];
    const state = {
      players: [{ id: "p1", status: "Fit" }, { id: "p2", status: "Fit" }],
      absences: { p1: [{ id: "a1", kind: "absence", label: "Urlaub", from: "2026-05-02", to: "2026-05-04" }] },
      events: ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05"].map((date, index) => ({ id: `e${index}`, type: "Training", date, ratings: {} })),
      selectedEventId: "e1"
    };
    const context = { state, persist: () => {}, cloudSaveRating: (...args) => saved.push(args), renderEvents: () => {} };
    const fns = loadFunctions(source, ["roundGrade", "calculatedGrade", "normalizeRating", "blankRating", "hasRatingData", "formatDate", "isInjuryAbsence", "absenceTitle", "absenceCoversDate", "activeAbsenceOn", "unavailabilityReason", "applyAutoAbsence", "reconcileAbsences", "selectedEvent", "updateRating"], context);
    const attendance = () => state.events.map((event) => event.ratings.p1?.attendance || "open").join(",");

    fns.reconcileAbsences();
    assert.equal(attendance(), "open,absent,absent,absent,open", `${team}: Abwesenheit setzt Fehlt`);
    assert.ok(state.events[1].ratings.p1.autoAbsence, `${team}: Markierung fehlt`);
    assert.equal(state.events[1].ratings.p2, undefined, `${team}: anderer Spieler betroffen`);

    // Die Markierung übersteht das Laden (Cloud-Sync normalisiert jedes Rating)
    assert.equal(fns.normalizeRating({ attendance: "absent", autoAbsence: true }).autoAbsence, true, `${team}: Markierung geht beim Laden verloren`);
    assert.equal("autoAbsence" in fns.normalizeRating({ attendance: "absent", autoAbsence: false }), false, `${team}: false-Markierung bleibt hängen`);

    // Verkürzen: nur nicht mehr abgedeckte Events werden zurückgesetzt, die Notiz folgt dem neuen Ende
    state.absences.p1[0].to = "2026-05-03";
    fns.reconcileAbsences();
    assert.equal(attendance(), "open,absent,absent,open,open", `${team}: Verkürzen`);
    assert.match(state.events[2].ratings.p1.note, /bis/, `${team}: Notiz`);

    // Eine manuelle Änderung schützt den Eintrag vor dem Zurücksetzen
    fns.updateRating("p1", "attendance", "limited"); // selectedEventId = e1
    assert.equal(state.events[1].ratings.p1.autoAbsence, false, `${team}: Hand-Änderung löst Markierung nicht`);

    // Löschen: alles Automatische verschwindet, das manuell Geänderte bleibt
    state.absences.p1 = [];
    fns.reconcileAbsences();
    assert.equal(attendance(), "open,limited,open,open,open", `${team}: Löschen hinterlässt Fehlt-Einträge`);
    assert.equal(state.events[2].ratings.p1.note, "", `${team}: Notiz nicht geleert`);
    assert.ok(saved.length > 0, `${team}: Zurücksetzen wird nicht gespeichert`);

    // Anlegen und sofort wieder Löschen hinterlässt nichts
    state.absences.p1 = [{ id: "a2", kind: "absence", label: "Klassenfahrt", from: "2026-05-04", to: "2026-05-05" }];
    fns.reconcileAbsences();
    state.absences.p1 = [];
    fns.reconcileAbsences();
    assert.equal(attendance(), "open,limited,open,open,open", `${team}: Anlegen+Löschen`);
  }

  const app = await read("outputs/team-manager/app.js");
  assert.match(app, /cloudDeleteAbsence\(playerId, absenceId\);\s*reconcileAbsences\(\);/, "deleteAbsence stößt den Abgleich nicht an");
});


test("Bewertungs-Chips haben Kriterium im Namen und aria-pressed (SCRUM-48)", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const start = app.indexOf("function chipGroupHtml(");
    const end = app.indexOf("function attendanceSelectHtml(");
    assert.ok(start > 0 && end > start, `${team}: chipGroupHtml fehlt`);
    const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const chipGroupHtml = new Function("escapeHtml", `${app.slice(start, end)}; return chipGroupHtml;`)(escapeHtml);
    const options = [["", "–"], ["1", "1"], ["2", "2"], ["3", "3"]];
    const html = chipGroupHtml("p1", "effort", "2", options, "grade-chips", "Einsatz");
    assert.match(html, /role="group" aria-label="Einsatz"/, `${team}: Gruppe nicht benannt`);
    assert.match(html, /aria-label="Einsatz: Note 2"[^>]*data-value="2"/, `${team}: Button ohne Kriterium im Namen`);
    assert.match(html, /aria-pressed="true"[^>]*aria-label="Einsatz: Note 2"/, `${team}: gewaehlter Wert nicht aria-pressed=true`);
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1, `${team}: genau ein Wert darf gewaehlt sein`);
    assert.equal((html.match(/aria-pressed="false"/g) || []).length, options.length - 1);
    assert.match(html, /aria-label="Einsatz: keine Note"/, `${team}: leerer Wert nicht benannt`);
    assert.match(app, /gradeChipsHtml[\s\S]{0,400}ratingFieldLabels\[field\]/, `${team}: Kriterium wird nicht an die Chips uebergeben`);
  }
});

test("Bereichswechsel schliesst das Aktionen-Menue, auch nach Breakpoint-Wechsel (SCRUM-49)", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const start = app.indexOf("function closeActionMenu()");
    assert.ok(start > 0, `${team}: closeActionMenu fehlt`);
    const end = start + app.slice(start).indexOf("\n}\n") + 3;
    const menus = [{ open: true, removeAttribute(name) { if (name === "open") this.open = false; } }];
    const document = { querySelectorAll: () => menus.filter((menu) => menu.open) };
    const closeActionMenu = new Function("document", `${app.slice(start, end)}; return closeActionMenu;`)(document);
    closeActionMenu();
    assert.equal(menus[0].open, false, `${team}: Menue bleibt offen`);
    const setViewStart = app.indexOf("function setView(viewName)");
    const setViewBody = app.slice(setViewStart, setViewStart + 300);
    assert.match(setViewBody, /closeActionMenu\(\)/, `${team}: setView schliesst das Menue nicht`);
    assert.match(app, /matchMedia\?\.\("\(max-width: 720px\)"\)\?\.addEventListener\?\.\("change", closeActionMenu\)/, `${team}: Breakpoint-Wechsel schliesst das Menue nicht`);
  }
  const root = await read("app.js");
  assert.match(root.slice(root.indexOf("function setView(viewName)"), root.indexOf("function setView(viewName)") + 300), /action-menu\[open\]/, "Root-Kopie schliesst das Menue nicht");
});

test("Event auswaehlen ist reine Navigation und setzt keinen Cloud-Sync-Status (SCRUM-50)", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const start = app.indexOf("function persistLocalUiState()");
    assert.ok(start > 0, `${team}: persistLocalUiState fehlt`);
    const end = start + app.slice(start).indexOf("\n}\n") + 3;
    const calls = [];
    const persistLocalUiState = new Function("normalizeState", "writeLocalCache", "setSyncState", "state", `let s = state; ${app.slice(start, end).replace(/state = /, "s = ").replace(/normalizeState\(state\)/, "normalizeState(s)")}; return persistLocalUiState;`)(
      (value) => value, () => calls.push("cache"), () => calls.push("sync"), {}
    );
    persistLocalUiState();
    assert.deepEqual(calls, ["cache"], `${team}: Auswahl darf nur lokal speichern, nicht den Sync-Status setzen`);
    const select = app.slice(app.indexOf('on("#eventSelect", "change"'), app.indexOf('on("#ratingFilter"'));
    assert.match(select, /persistLocalUiState\(\)/, `${team}: Desktop-Select ruft persist()`);
    assert.ok(!/\bpersist\(\)/.test(select), `${team}: Desktop-Select setzt noch "Wird gespeichert"`);
    const click = app.slice(app.indexOf("function handleEventListClick("), app.indexOf('on("#eventList", "click"'));
    assert.match(click, /persistLocalUiState\(\)/, `${team}: Eventkarte ruft persist()`);
    assert.ok(!/\bpersist\(\)/.test(click), `${team}: Eventkarte setzt noch "Wird gespeichert"`);
  }
});

test("Einwilligung widerrufen warnt, blockiert aber nichts; offen und erteilt warnen nicht (SCRUM-51)", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const start = app.indexOf("// Einwilligung (SCRUM-51)");
    const end = app.indexOf("function renderProfileHeader");
    assert.ok(start > 0 && end > start, `${team}: Einwilligungs-Helfer fehlen`);
    const prompts = [];
    const build = (answer) => new Function("confirm", "escapeHtml", `${app.slice(start, end)}; return { isConsentRevoked, confirmDespiteRevokedConsent, consentChipHtml };`)(
      (text) => { prompts.push(text); return answer; },
      (value) => String(value).replace(/</g, "&lt;")
    );
    const api = build(true);
    const revoked = { name: "<b>Ali</b>", consentStatus: "revoked" };
    const pending = { name: "Ben", consentStatus: "pending" };
    const granted = { name: "Cem", consentStatus: "granted" };

    assert.equal(api.isConsentRevoked(revoked), true);
    assert.equal(api.isConsentRevoked(pending), false);
    assert.equal(api.isConsentRevoked(granted), false);

    // offen/erteilt: keine Rückfrage, einfach weiter
    assert.equal(api.confirmDespiteRevokedConsent([pending, granted], "Der Export"), true);
    assert.equal(prompts.length, 0, `${team}: bei offen/erteilt darf nicht gewarnt werden`);
    assert.equal(api.consentChipHtml(pending), "");
    assert.equal(api.consentChipHtml(granted), "");

    // widerrufen: Rückfrage; bestätigt = weiter, abgebrochen = nicht gespeichert, nichts wird sonst gesperrt
    assert.equal(api.confirmDespiteRevokedConsent([revoked], "Der Export"), true);
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /widerrufen/);
    assert.equal(build(false).confirmDespiteRevokedConsent([revoked], "Der Export"), false);

    // Namen im Chip sind escaped
    assert.doesNotMatch(api.consentChipHtml(revoked), /<b>/);
    assert.match(api.consentChipHtml(revoked), /Einwilligung widerrufen/);

    // Warnung ist an Profil, Bewertung, Förderplan, Abwesenheit, Messwert, Einladung und Export angeschlossen
    for (const fn of ["saveDevelopmentPlan", "saveAbsence", "saveMeasurement", "createInviteCodeForPlayer", "exportData"]) {
      const body = app.slice(app.indexOf(`function ${fn}(`), app.indexOf(`function ${fn}(`) + 1500);
      assert.match(body, /confirmDespiteRevokedConsent/, `${team}: ${fn} warnt nicht bei widerrufener Einwilligung`);
    }
    assert.match(app, /consent-warning" role="alert"/, `${team}: Profil-Warnung fehlt`);
    assert.ok((app.match(/consentChipHtml\(player\)/g) || []).length >= 2, `${team}: Warnung in Bewertungstabelle/-karte fehlt`);
  }
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

test("Globale Suche: Schließen-Schaltfläche, Escape, Fokus-Rückgabe und Gegnerprofile (SCRUM-55)", async () => {
  for (const team of teams) {
    const nextLevel = await read(`outputs/${team}/next-level.js`);
    const app = await read(`outputs/${team}/app.js`);
    const css = await read(`outputs/${team}/styles.css`);
    assert.match(nextLevel, /id="commandClose"[^>]*aria-label="Suche schließen"/);
    assert.match(nextLevel, /event\.key === "Escape"[\s\S]*dialog\.close\(\)/);
    assert.match(nextLevel, /opener\.focus\(\)/);
    assert.match(nextLevel, /allowed\.includes\("opponents"\)[\s\S]*type: "opponent"/);
    assert.match(app, /openOpponent: \(opponentId\)[\s\S]*allowedViews\(\)\.includes\("opponents"\)/);
    assert.match(css, /\.command-palette-close \{ min-width: 44px; min-height: 44px;/);
    assert.match(await read(`outputs/${team}/mobile.css`), /\.command-palette-close \{[^}]*min-height: 44px;/);
  }
});

test("Suchfelder und Theme-Schalter haben zugängliche Namen ohne widersprüchliches aria-pressed (SCRUM-52)", async () => {
  for (const file of ["index.html", ...teams.map((team) => `outputs/${team}/index.html`)]) {
    const html = await read(file);
    for (const input of html.match(/<input[^>]*type="search"[^>]*>/g) || []) {
      assert.match(input, /aria-label="[^"]+"/, `${file}: Suchfeld ohne Namen: ${input}`);
    }
    assert.match(html, /id="themeToggle"[^>]*aria-label="/, `${file}: Theme-Schalter ohne aria-label`);
    assert.doesNotMatch(html, /id="themeToggle"[^>]*aria-pressed/, `${file}: Theme-Schalter mit aria-pressed`);
  }
  for (const file of ["app.js", ...teams.map((team) => `outputs/${team}/app.js`)]) {
    const app = await read(file);
    assert.doesNotMatch(app, /toggle\.setAttribute\("aria-pressed"/, `${file}: Theme-Schalter setzt aria-pressed`);
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

test("Konten-Passwort wird verdeckt abgefragt und folgt der Richtlinie ab 12 Zeichen (SCRUM-58)", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const html = await read(`outputs/${team}/index.html`);
    const create = app.slice(app.indexOf("async function createStaffAccount"), app.indexOf("async function createInviteCodeForPlayer"));
    assert.doesNotMatch(create, /prompt\(/, `${team}: Passwort darf nicht per prompt() abgefragt werden`);
    assert.match(create, /askStaffCredentials\(/);
    assert.match(html, /id="staffPassword" type="password" autocomplete="new-password"/);
    assert.match(html, /id="staffPasswordRepeat" type="password"/);
    assert.match(app, /const MIN_STAFF_PASSWORD_LENGTH = 12;/);
    assert.doesNotMatch(app, /mind\. 6 Zeichen|mindestens 6 Zeichen/);
  }
});

test("Passwort vergessen und Passwort ändern sind in allen Live-Apps vorhanden (SCRUM-31)", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const html = await read(`outputs/${team}/index.html`);
    assert.match(html, /id="trainerResetBtn"/);
    assert.match(html, /id="changePasswordBtn"/);
    assert.match(html, /id="passwordCurrent" type="password" autocomplete="current-password"/);
    assert.match(html, /id="passwordNew" type="password" autocomplete="new-password"/);
    assert.match(app, /sendPasswordResetEmail\(authInstance, email\)/);
    assert.match(app, /reauthenticateWithCredential\(user, authModule\.EmailAuthProvider\.credential/);
    // Neutral antworten: keine Konto-Erkennung ueber "user-not-found".
    assert.match(app, /includes\("user-not-found"\)\) \{\s*error\.textContent = authErrorMessage/);
  }
});

test("Hosting: Doku und Beispiel-Konfiguration werden nicht ausgeliefert, Startseite wird nicht gecacht (SCRUM-60/61)", async () => {
  const config = JSON.parse(await read("firebase.json"));
  for (const target of config.hosting) {
    assert.ok(target.ignore.includes("**/*.md"), `${target.target}: *.md muss ausgeschlossen sein`);
    assert.ok(target.ignore.includes("**/*.example.js"), `${target.target}: *.example.js muss ausgeschlossen sein`);
    const headers = target.headers ?? [];
    const noCache = (source) => headers.some((rule) => rule.source === source && rule.headers.some((header) => header.key === "Cache-Control" && /no-cache/.test(header.value)));
    if (target.target !== "u14") {
      assert.ok(noCache("/"), `${target.target}: "/" braucht Cache-Control no-cache`);
      assert.ok(noCache("/index.html"), `${target.target}: "/index.html" braucht Cache-Control no-cache`);
    } else {
      // Angular: alle Antworten no-cache, nur die Dateien mit Hash im Namen sind langlebig.
      assert.ok(headers.some((rule) => rule.source === "**" && rule.headers.some((header) => header.key === "Cache-Control" && /no-cache/.test(header.value))));
    }
  }
});

test("'Heute' wird lokal und nicht in UTC berechnet (SCRUM-21)", async () => {
  for (const file of ["app.js", ...teams.map((team) => `outputs/${team}/app.js`)]) {
    const app = await read(file);
    assert.doesNotMatch(app, /toISOString\(\)\.slice\(0, 10\)/, `${file}: UTC-Datum statt lokalem Datum`);
    assert.match(app, /function localIsoDate\(date = new Date\(\)\)/, `${file}: Helfer localIsoDate fehlt`);
  }
});

test("Abwesenheit: 'Bis' vor 'Von' wird nicht gespeichert; kein vorbelegtes Geburtsdatum; Befristung 'ab heute' (SCRUM-22/23)", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    assert.match(app, /absence\.to < absence\.from[\s\S]*Das Enddatum darf nicht vor dem Beginn liegen/);
    assert.match(app, /on\("#absenceFrom", "change"/);
    assert.doesNotMatch(app, /\$\("#playerBirthdate"\)\.value = player\?\.birthdate \|\| "2006/);
    assert.match(app, /\$\("#playerBirthdate"\)\.value = player\?\.birthdate \|\| "";/);
    assert.doesNotMatch(app, /ab der Anmeldung eingeben/);
    assert.match(app, /Anzahl Tage ab heute/);
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

test("Abmelden warnt Spieler und Eltern vor dem Verlust des Zugangs (SCRUM-32)", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const handler = app.slice(app.indexOf("async function handleSignOut"), app.indexOf("async function handleSignOut") + 700);
    assert.match(handler, /\["player", "parent"\]\.includes\(currentRole\)/);
    assert.match(handler, /neuen Einladungscode/);
  }
});

test("Aufstellung wird je Spiel gespeichert, ohne die allgemeine Startelf zu überschreiben (SCRUM-29)", async () => {
  const app = await read("outputs/team-manager/app.js");
  const html = await read("outputs/team-manager/index.html");
  assert.match(app, /function lineupTargetEvent\(\)/);
  assert.match(app, /byEvent: \{ \[eventId\]: entry \}[^\n]*merge: true/);
  assert.match(app, /setDoc\(teamDoc\("meta", "lineup"\), \{ assignments: lineup\.assignments \}, \{ merge: true \}\)/);
  assert.doesNotMatch(app, /persist\(\);\s*cloudSaveLineup\(state\.lineup\);\s*renderPitch/);
  assert.match(app, /deleteField\(\)/);
  for (const id of ["copyLineupBtn", "pitchTarget", "eventLineup"]) assert.match(html, new RegExp(`id="${id}"`));
});

test("Der Suchdialog hat einen eigenen zugänglichen Namen (SCRUM-89)", async () => {
  for (const team of teams) {
    const script = await read(`outputs/${team}/next-level.js`);
    assert.match(script, /dialog\.className = "command-palette";\s*dialog\.setAttribute\("aria-label", "TeamKompass durchsuchen"\)/);
  }
});

test("Der Begriff „Medizinischer Lesezugang“ ist nirgends mehr sichtbar, die Rolle „medical“ bleibt (SCRUM-91)", async () => {
  const files = [
    ...teams.flatMap((team) => [`outputs/${team}/app.js`, `outputs/${team}/index.html`]),
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
  for (const team of teams) assert.match(await read(`outputs/${team}/app.js`), /Scout-Zugang/);
  assert.match(await read("firestore.rules"), /role == "medical"/);
});

test("Spieler- und Scout-Zugänge werden getrennt verwaltet (SCRUM-92)", async () => {
  for (const team of teams) {
    const html = await read(`outputs/${team}/index.html`);
    assert.match(html, /id="accessManagerList"/);
    assert.match(html, /id="scoutManagerList"/);
    assert.match(html, /data-action="add-scout"/);
    const app = await read(`outputs/${team}/app.js`);
    const render = app.slice(app.indexOf("async function renderAccessManager"), app.indexOf("async function revokeAccess"));
    assert.match(render, /\["player", "parent"\]\.includes\(docSnap\.data\(\)\.role\)/);
    assert.match(render, /docSnap\.data\(\)\.role === "medical"/);
    const css = await read(`outputs/${team}/base.css`);
    assert.match(css, /body\.role-medical #scoutManagerPanel/);
    assert.match(css, /body\.role-trainer-cloud #scoutManagerPanel/);
  }
});

test("Angular schreibt die Startelf mit merge, damit die Spiel-Aufstellungen (byEvent) der Live-Apps erhalten bleiben (SCRUM-126)", async () => {
  const api = await read("angular/src/app/core/firebase/lineup.api.ts");
  assert.match(api, /setDoc\(doc\(db, 'teams', environment\.teamId, 'meta', 'lineup'\), data, \{ merge: true \}\)/);
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    assert.match(app, /byEvent: \{ \[eventId\]: entry \} \}, \{ merge: true \}/);
  }
});

test("Angular: Build je Live-Team mit derselben Team-ID wie die heutige App (SCRUM-124)", async () => {
  const angular = JSON.parse(await read("angular/angular.json"));
  const architect = angular.projects["teamkompass-angular"].architect;
  const configs = architect.build.configurations;
  const field = (source, key) => source.match(new RegExp(`${key}:\\s*["']([^"']+)["']`))?.[1];
  const buildTeams = JSON.parse(await read("angular/package.json")).scripts["build:teams"];

  // Standard-Build (Hosting-Ziel u14) bleibt das Testteam U14 – sonst schriebe teamkompass-u14 in Live-Daten.
  const base = await read("angular/src/environments/environment.ts");
  assert.equal(field(base, "teamId"), "U14");
  assert.ok(architect.build.options.assets.some((asset) => asset.input === "teams/u14"), "Standard-Build ohne U14-Manifest");

  const liveToConfig = { "team-manager": "mein-team", u15: "u15", u17: "u17" };
  assert.deepEqual(Object.keys(liveToConfig), teams, "Neues Live-Team? Dann braucht es auch eine Angular-Build-Konfiguration");
  for (const [live, name] of Object.entries(liveToConfig)) {
    const liveConfig = await read(`outputs/${live}/firebase-config.js`);
    const config = configs[name];
    assert.ok(config, `${name}: Build-Konfiguration fehlt`);
    assert.deepEqual(config.fileReplacements, [
      { replace: "src/environments/environment.ts", with: `src/environments/environment.${name}.ts` },
    ]);
    const env = await read(`angular/src/environments/environment.${name}.ts`);
    assert.equal(field(env, "teamId"), field(liveConfig, "teamId"), `${name}: Team-ID weicht von outputs/${live} ab`);
    assert.equal(field(env, "teamName"), field(liveConfig, "teamName"), `${name}: Teamname weicht von outputs/${live} ab`);

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
    assert.match(html, /<img class="logo" src="club-logo\.png"/);
    assert.doesNotMatch(html, />TK</);
  }
  const logo = await readFile(new URL("../angular/public/club-logo.png", import.meta.url));
  assert.equal(logo.subarray(1, 4).toString(), "PNG");
});
