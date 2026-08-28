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
