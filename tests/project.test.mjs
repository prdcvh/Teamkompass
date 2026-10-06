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

test("Spieler loeschen raeumt auch Einladungen und Zugaenge (invites/members) auf", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const body = app.match(/async function cloudDeletePlayer\(playerId\) \{([\s\S]*?)\n\}\n/)?.[1] || "";
    assert.match(body, /\["invites", "members"\]/, `${team}: invites/members werden beim Loeschen nicht berücksichtigt`);
    assert.match(body, /where\("playerId", "==", playerId\)/, `${team}: Zugaenge werden nicht per playerId gefunden`);
  }
});

test("Angular: Spieler loeschen raeumt invites/members auf", async () => {
  const service = await read("angular/src/app/core/firebase.service.ts");
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

test("Angular: Spieler loeschen entfernt auch die internen Trainer-Notizen", async () => {
  const service = await read("angular/src/app/core/firebase.service.ts");
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

