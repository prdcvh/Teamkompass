import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";

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
  for (const unsafe of ["<strong>${player.name}</strong>", "<strong>${event.title}</strong>", "${rating.note || event.notes || \"Keine Notiz\"}"]) {
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
  for (const site of hosting.hosting) {
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
