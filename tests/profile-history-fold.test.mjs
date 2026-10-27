import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

// SCRUM-226: Die Eventhistorie im Spielerprofil ist standardmaessig eingeklappt (<details> ohne "open")
// und zeigt die Anzahl der bewerteten Events in der Ueberschrift; jede App-Kopie muss das tun.
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const copies = async () => {
  const teams = (await readdir(new URL("../outputs/", import.meta.url), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `outputs/${entry.name}`);
  return [".", ...teams];
};

test("Eventhistorie ist in jeder App-Kopie eingeklappt und zeigt die Anzahl (SCRUM-226)", async () => {
  for (const dir of await copies()) {
    const html = await read(`${dir}/index.html`);
    const details = html.match(/<details[^>]*id="profileHistoryFold"[^>]*>/)?.[0];
    assert.ok(details, `${dir}: einklappbare Eventhistorie fehlt`);
    assert.ok(!/\bopen\b/.test(details), `${dir}: Eventhistorie darf nicht vorab geoeffnet sein`);
    assert.match(html, /<summary[^>]*>\s*<h2>Eventhistorie · <span id="profileHistoryCount">/, `${dir}: Anzahl in der Ueberschrift fehlt`);
    const app = await read(`${dir}/app.js`);
    assert.match(app, /function renderProfileHistory\(ratings\) \{\n\s*\$\("#profileHistoryCount"\)\.textContent = ratings\.length;/, `${dir}: Anzahl wird nicht gesetzt`);
  }
});
