import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";

const teams = ["team-manager", "u15", "u17"];
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("alle Team-Instanzen verwenden dieselbe App-Basis", async () => {
  for (const file of ["app.js", "index.html", "styles.css", "next-level.js"]) {
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

test("PWA-Dateien und Planungsansicht sind eingebunden", async () => {
  const html = await read("outputs/team-manager/index.html");
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /id="planningView"/);
  assert.match(html, /next-level\.js/);
});
