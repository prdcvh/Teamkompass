import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// SCRUM-25: Aktivitaetsverlauf nur nach erfolgreichem Speichern, Screenreader-Zusammenfassung aktuell.
const teams = ["team-manager", "u15", "u17"];

function makeElement() {
  return {
    style: {}, dataset: {}, textContent: "", innerHTML: "", className: "", value: "",
    setAttribute() {}, append() {}, addEventListener() {}, querySelector: () => makeElement(),
    showModal() {}, close() {}, focus() {}
  };
}

// Fuehrt next-level.js gegen eine minimale DOM-Attrappe aus.
async function boot(team, getState) {
  const source = await readFile(new URL(`../outputs/${team}/next-level.js`, import.meta.url), "utf8");
  const listeners = {};
  const store = {};
  const summaries = [];
  const document = {
    body: { append(el) { if (el.id === "chartDataSummary") summaries.push(el); } },
    createElement: () => makeElement(),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }
  };
  const sandbox = {
    document,
    window: { TeamKompass: { getState, allowedViews: () => [] } },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    navigator: {}, location: { protocol: "http:" },
    crypto: { randomUUID: () => Math.random().toString(36).slice(2) },
    structuredClone, console, requestAnimationFrame: (fn) => fn()
  };
  vm.runInNewContext(source, sandbox);
  const fire = (type, event = {}) => (listeners[type] || []).forEach((fn) => fn(event));
  const activity = () => JSON.parse(store["teamkompass-workspace-v1"] || '{"activity":[]}').activity.map((a) => a.action);
  return { fire, activity, summary: () => summaries[0].textContent };
}

for (const team of teams) {
  test(`${team}: abgebrochenes Speichern (nur submit) taucht nicht im Verlauf auf`, async () => {
    const app = await boot(team, () => ({ players: [], events: [] }));
    app.fire("submit", { target: { id: "playerForm" } });
    assert.deepEqual(app.activity(), []);
  });

  test(`${team}: erfolgreiches Speichern (teamkompass:saved) wird protokolliert`, async () => {
    const app = await boot(team, () => ({ players: [], events: [] }));
    app.fire("teamkompass:saved", { detail: { form: "playerForm" } });
    app.fire("teamkompass:saved", { detail: { form: "unbekannt" } });
    assert.deepEqual(app.activity(), ["Spielerprofil gespeichert"]);
  });

  test(`${team}: Screenreader-Zusammenfassung folgt dem Rendern`, async () => {
    let data = { players: [], events: [] };
    const app = await boot(team, () => data);
    assert.match(app.summary(), /0 Spieler, 0 Events/);
    data = { players: new Array(25).fill({}), events: new Array(14).fill({}) };
    app.fire("teamkompass:render");
    assert.match(app.summary(), /25 Spieler, 14 Events/);
  });

  test(`${team}: app.js meldet teamkompass:saved erst nach persist() in allen sechs Speicherfunktionen`, async () => {
    const app = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
    for (const form of ["playerForm", "eventForm", "developmentPlanForm", "absenceForm", "measurementForm", "opponentForm"]) {
      assert.match(app, new RegExp(`persist\\(\\);\\s*announceSaved\\("${form}"\\);`), `${team}: ${form}`);
    }
    assert.match(app, /new CustomEvent\("teamkompass:saved"/);
  });
}
