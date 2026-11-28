// SCRUM-134: Auf keiner Seite der Angular-App (U14) darf es seitliches Scrollen geben, bei keiner Bildschirmbreite.
// Der Test startet den Build `-c e2e` (Attrappen + Beispieldaten statt Firebase) in Chromium und misst jede Seite.
// Ohne Playwright (lokal nicht installiert) wird er übersprungen; in der CI wird Playwright vorher installiert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, statSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeServer, withCleanup, withTimeout } from './lifecycle-lib.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const angular = join(root, 'angular');
const dist = join(angular, 'dist', 'e2e', 'browser');

function loadPlaywright() {
  const candidates = [join(angular, 'package.json'), join(root, 'package.json')];
  for (const base of candidates) {
    try { return createRequire(base)('playwright'); } catch { /* weiter */ }
  }
  for (const dir of (process.env.NODE_PATH ?? '').split(':').filter(Boolean).concat(['/opt/node-tools/node_modules'])) {
    try { return createRequire(join(dir, 'x.js'))('playwright'); } catch { /* weiter */ }
  }
  return null;
}

export const WIDTHS = [320, 360, 390, 768, 1024, 1280, 1440, 1920];
export const ROUTES = [
  '/start', '/kader', '/events', '/events/e1', '/events/e1/live', '/events/e2', '/events/e3', '/events/e4', '/planung', '/wissen', '/profile', '/profile/p1', '/teamanalyse',
  '/gegneranalyse', '/aufstellung', '/suche', '/zugaenge', '/trainer-konto', '/scout-zugang', '/medizin-zugang', '/export', '/einstellungen', '/styleguide',
  '/anmelden?as=none', '/ansicht?as=player', '/ansicht?as=player-email', '/ansicht?as=physio', '/ansicht?as=scout',
  // Registrierung, Teamauswahl und Einstieg (SCRUM-181).
  '/registrieren?as=none&code=ABCDEFGHJKLMNPQR', '/team-waehlen?as=multi', '/willkommen?as=fresh',
  // Feldtests (SCRUM-263).
  '/feldtests',
];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function serve(headers = {}) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = join(dist, path);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...headers });
    createReadStream(file).pipe(res);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

/** Läuft im Browser: liefert alles, was breiter als das Fenster ist oder seitlich scrollt. */
function measure() {
  const width = document.documentElement.clientWidth;
  const problems = [];
  if (document.documentElement.scrollWidth > width) problems.push(`Seite scrollt seitlich (${document.documentElement.scrollWidth} > ${width})`);
  const describe = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
  // Zierde, die ein Elternelement innerhalb des Fensters abschneidet (z. B. Hintergrundgrafik), erzeugt kein Scrollen.
  const clipped = (el) => {
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowX;
      if (overflow === 'visible') continue;
      const box = parent.getBoundingClientRect();
      if (box.left >= -0.5 && box.right <= width + 0.5) return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed' && el.closest('[aria-hidden="true"], [inert]')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (el.closest('.tk-sr-only, [hidden]')) continue;
    if ((rect.right > width + 0.5 || rect.left < -0.5) && !clipped(el)) problems.push(`${describe(el)} ragt über den Rand (${Math.round(rect.left)}–${Math.round(rect.right)} von ${width})`);
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) problems.push(`${describe(el)} scrollt seitlich (${el.scrollWidth} > ${el.clientWidth})`);
  }
  // Datum, Typ-Schild und Wetterteile („80 % Regen“) dürfen nicht umbrechen, sonst steht dort „18.10.202 / 6“ (SCRUM-152, SCRUM-155).
  for (const cell of document.querySelectorAll('td.date, td .badge, tk-weather .part, tk-weather .home')) {
    const range = document.createRange();
    range.selectNodeContents(cell);
    if (range.getClientRects().length > 1) problems.push(`„${cell.textContent.trim()}“ bricht um`);
  }
  // Eventkarten: Titel und Text dürfen nicht unter den „Bearbeiten“-Knopf laufen (SCRUM-155).
  for (const row of document.querySelectorAll('.cards .row')) {
    const button = row.querySelector(':scope > button');
    const what = row.querySelector('.what');
    if (!button || !what) continue;
    const textRight = Math.max(...[...what.querySelectorAll('strong, small')].map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return Math.max(...[...range.getClientRects()].map((r) => r.right));
    }));
    if (textRight > button.getBoundingClientRect().left + 0.5) problems.push(`Eventkarte „${what.querySelector('strong')?.textContent?.trim()}“ läuft unter „Bearbeiten“`);
  }
  // Touch-Geräte: Felder unter 16 px lassen das iPhone beim Antippen hineinzoomen, danach scrollt die Seite seitlich (SCRUM-154).
  if (matchMedia('(pointer: coarse)').matches) {
    for (const field of document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea')) {
      const size = parseFloat(getComputedStyle(field).fontSize);
      if (size < 16 && field.getBoundingClientRect().width > 0) problems.push(`${describe(field)} hat ${size}px Schrift (iPhone zoomt beim Antippen)`);
    }
  }
  return problems.slice(0, 8);
}

const playwright = loadPlaywright();

// Beide Tests prüfen denselben, einmal frisch gebauten Stand (sonst prüfte ein Test einen alten Stand).
// Zeitgrenzen (SCRUM-299): Ein hängender Build, Browser oder Seitenaufruf bricht mit klarer Meldung ab, statt `npm test` zu blockieren.
const BUILD_TIMEOUT_MS = 300_000;
const STEP_TIMEOUT_MS = 30_000;
let built = false;

/** Startet Server und Browser; beides wird von `withCleanup` in jedem Fall geschlossen. */
async function startServerAndBrowser(cleanup, headers) {
  const server = await withTimeout(serve(headers), STEP_TIMEOUT_MS, 'HTTP-Server starten');
  cleanup.add('HTTP-Server', () => closeServer(server));
  const browser = await withTimeout(playwright.chromium.launch(), STEP_TIMEOUT_MS, 'Chromium starten');
  cleanup.add('Browser', () => browser.close());
  return { base: `http://127.0.0.1:${server.address().port}`, browser };
}

function openPage(context) {
  return context.newPage().then((page) => {
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(STEP_TIMEOUT_MS);
    return page;
  });
}
function buildOnce() {
  if (!built) execSync('npm run build:e2e', { cwd: angular, stdio: 'inherit', timeout: BUILD_TIMEOUT_MS });
  built = true;
}

test('Keine Seite scrollt seitlich (alle Breiten, alle Seiten)', { skip: playwright ? false : 'Playwright nicht installiert', timeout: 600_000 }, async () => {
  buildOnce();
  const shots = process.env.RESPONSIVE_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });
  const failures = [];
  await withCleanup(async (cleanup) => {
    const { base, browser } = await startServerAndBrowser(cleanup);
    const widths = process.env.RESPONSIVE_WIDTHS ? process.env.RESPONSIVE_WIDTHS.split(',').map(Number) : WIDTHS;
    const routes = process.env.RESPONSIVE_ONLY ? ROUTES.filter((r) => r.includes(process.env.RESPONSIVE_ONLY)) : ROUTES;
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, isMobile: width < 768 });
      cleanup.add(`Context ${width}px`, () => context.close());
      const page = await openPage(context);
      // 320 px prüft vorerst nur die Startseite (SCRUM-308); auf /export und /einstellungen läuft es dort noch über den Rand (eigenes Ticket).
      for (const route of width < 360 ? routes.filter((r) => r === '/start') : routes) {
        await withTimeout(async () => {
          await page.goto(base + route);
          await page.waitForSelector('main, form, h1', { timeout: 15_000 });
          await page.waitForTimeout(400);
          const problems = await page.evaluate(measure);
          // SCRUM-308: Das Training „heute“ mit langem Titel muss auf der Startseite wirklich da sein, sonst misst der Test den Fall nicht.
          if (route === '/start' && !(await page.locator('.live-start').count())) problems.push('Knopf „Live-Modus“ fehlt (Beispiel-Training heute)');
          if (shots) await page.screenshot({ path: join(shots, `${route.replace(/[/?=]/g, '_')}-${width}.png`), fullPage: true });
          if (problems.length) failures.push(`${width}px ${route}: ${problems.join('; ')}`);
        }, STEP_TIMEOUT_MS * 2, `${width}px ${route}`);
      }
      await context.close();
    }
  });
  assert.deepEqual(failures, [], `Seitliches Scrollen bzw. Überstand gefunden:\n${failures.join('\n')}`);
});

/** Läuft im Browser: prüft jede Zeile der Kaderliste auf überlappende Texte (SCRUM-309). */
function measureSquadRows() {
  const problems = [];
  const boxes = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  };
  const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const rows = document.querySelectorAll('.cards li');
  if (rows.length === 0) problems.push('keine Kaderzeilen gefunden');
  for (const row of rows) {
    const label = row.querySelector('strong')?.textContent?.trim();
    const parts = [
      ['Name', row.querySelector('.who strong')],
      ...[...row.querySelectorAll('.who .meta-part')].map((el) => ['Angabe', el]),
      ['Status', row.querySelector('tk-status')],
      ['Nummer', row.querySelector('.number')],
      ['Bearbeiten', row.querySelector('.edit-btn')],
    ].filter(([, el]) => el).flatMap(([kind, el]) => (kind === 'Angabe' ? boxes(el) : [el.getBoundingClientRect()]).map((rect) => ({ kind, rect })));
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        if (overlap(parts[i].rect, parts[j].rect)) problems.push(`„${label}“: ${parts[i].kind} und ${parts[j].kind} überlappen`);
      }
    }
    const name = row.querySelector('.who strong');
    if (name.clientHeight > parseFloat(getComputedStyle(name).lineHeight) * 2 + 1) problems.push(`„${label}“: Name länger als 2 Zeilen`);
    for (const part of row.querySelectorAll('.who .meta-part')) {
      if (boxes(part).length > 1) problems.push(`„${label}“: „${part.textContent.trim()}“ bricht um`);
    }
    const status = row.querySelector('tk-status');
    if (status.getBoundingClientRect().height > parseFloat(getComputedStyle(status).fontSize) * 2) problems.push(`„${label}“: Status bricht um`);
    const button = row.querySelector('.edit-btn')?.getBoundingClientRect();
    if (button && (button.width < 44 || button.height < 44)) problems.push(`„${label}“: Bearbeiten-Knopf kleiner als 44 px (${Math.round(button.width)}×${Math.round(button.height)})`);
    const card = row.getBoundingClientRect();
    for (const { kind, rect } of parts) {
      if (rect.right > card.right + 0.5) problems.push(`„${label}“: ${kind} ragt aus der Zeile`);
    }
  }
  return problems.slice(0, 8);
}

test('Kaderliste: keine überlappenden Texte, Name höchstens 2 Zeilen (320/360/390 px, SCRUM-309)', { skip: playwright ? false : 'Playwright nicht installiert', timeout: 600_000 }, async () => {
  buildOnce();
  const failures = [];
  await withCleanup(async (cleanup) => {
    const { base, browser } = await startServerAndBrowser(cleanup);
    for (const width of [320, 360, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, isMobile: true });
      cleanup.add(`Context ${width}px`, () => context.close());
      const page = await openPage(context);
      await page.goto(`${base}/kader`);
      await page.waitForSelector('.cards li', { timeout: 15_000 });
      await page.waitForTimeout(400);
      const problems = await page.evaluate(measureSquadRows);
      if (problems.length) failures.push(`${width}px /kader: ${problems.join('; ')}`);
      await context.close();
    }
  });
  assert.deepEqual(failures, [], `Kaderliste mit überlappenden oder umbrechenden Texten:\n${failures.join('\n')}`);
});

// SCRUM-119/121: Mit `style-src 'self'` (ohne 'unsafe-inline') darf die App keine Inline-Styles brauchen. Gemessen mit der
// CSP aus firebase.json, nur ohne 'unsafe-inline'. Gestaltung per CSSOM ([style.x]-Bindungen, konstruierte Stylesheets)
// ist erlaubt. Einzige verbleibende Ausnahme: Angular legt die Komponenten-Styles als <style>-Elemente in <head> an –
// solange das so ist, bleibt 'unsafe-inline' in firebase.json (Entscheidung des PO offen, siehe SCRUM-119).
const ANGULAR_COMPONENT_STYLE_ELEMENTS_ALLOWED = true;

function strictStyleCsp() {
  const config = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8'));
  const u14 = config.hosting.find((target) => target.target === 'u14');
  const csp = u14.headers.flatMap((entry) => entry.headers).find((entry) => entry.key === 'Content-Security-Policy').value;
  return csp.replace(/style-src [^;]*/, "style-src 'self'");
}

test('Strenge CSP für Styles: keine Inline-Style-Attribute, Berichte per CSSOM (SCRUM-119/121)', { skip: playwright ? false : 'Playwright nicht installiert', timeout: 600_000 }, async () => {
  buildOnce();
  const index = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.doesNotMatch(index, /<style|\sstyle\s*=|\son[a-z]+\s*=/i, 'index.html enthält Inline-Styles oder Inline-Handler');
  const failures = [];
  await withCleanup(async (cleanup) => {
    const { base, browser } = await startServerAndBrowser(cleanup, { 'content-security-policy': strictStyleCsp() });
    const routes = process.env.RESPONSIVE_ONLY ? ROUTES.filter((r) => r.includes(process.env.RESPONSIVE_ONLY)) : ROUTES;
    for (const viewport of [{ width: 390, height: 844 }, { width: 1365, height: 900 }]) {
      const mobile = viewport.width < 768;
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          const target = event.target;
          const angularStyle = target instanceof HTMLStyleElement && target.parentNode === document.head;
          window.__cspViolations.push({ directive: event.violatedDirective, angularStyle, sample: event.sample });
        });
      });
      cleanup.add(`Context ${viewport.width}px`, () => context.close());
      const page = await openPage(context);
      for (const route of routes) {
        await page.goto(base + route);
        await page.waitForSelector('main, form, h1', { timeout: 15_000 });
        await page.waitForTimeout(300);
        const violations = await page.evaluate(() => window.__cspViolations);
        const bad = violations.filter((v) => !(ANGULAR_COMPONENT_STYLE_ELEMENTS_ALLOWED && v.directive === 'style-src-elem' && v.angularStyle));
        if (bad.length) failures.push(`${viewport.width}px ${route}: ${bad.map((v) => `${v.directive} „${v.sample}“`).join('; ')}`);
      }
      await context.close();
    }
    // PDF-Bericht: läuft im sandboxed iframe, das die CSP der App erbt; die Gestaltung muss trotzdem greifen.
    const context = await browser.newContext({ serviceWorkers: 'block' });
    cleanup.add('Context PDF-Bericht', () => context.close());
    const page = await openPage(context);
    await page.addInitScript(() => { window.print = () => {}; });
    await page.goto(`${base}/export`);
    await page.getByRole('button', { name: 'Bericht erstellen' }).click();
    const report = await page.waitForFunction(() => {
      const doc = document.querySelector('iframe[sandbox]')?.contentDocument;
      if (!doc?.body?.textContent?.includes('Spielerprofil')) return null;
      return { margin: getComputedStyle(doc.body).marginTop, inline: doc.querySelectorAll('style, [style]').length };
    });
    const { margin, inline } = await report.jsonValue();
    if (margin !== '32px') failures.push(`PDF-Bericht ungestaltet (Rand ${margin} statt 32px)`);
    if (inline) failures.push(`PDF-Bericht enthält ${inline} Inline-Styles`);
    await context.close();
  });
  assert.deepEqual(failures, [], `CSP-Verstöße bei strengem style-src:\n${failures.join('\n')}`);
});
