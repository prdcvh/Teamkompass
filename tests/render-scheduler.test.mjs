import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-35: Render-Buendelung und Kennzahlen-Memoisierung der Team-Apps.
const teams = ["team-manager", "u15", "u17"];

async function loadApi(team = "team-manager") {
  const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
  const block = source.split("// RENDER-SCHEDULER START")[1].split("// RENDER-SCHEDULER END")[0];
  return new Function(`${block}\nreturn { createRenderScheduler, createRenderPassMemo };`)();
}

// Manueller Zeitgeber: Timer laufen erst bei tick(), so ist das Verhalten deterministisch.
function fakeTimers() {
  let nextId = 1;
  const queue = new Map();
  return {
    set: (fn) => { const id = nextId++; queue.set(id, fn); return id; },
    clear: (id) => queue.delete(id),
    tick() { const jobs = [...queue.values()]; queue.clear(); jobs.forEach((fn) => fn()); },
    size: () => queue.size
  };
}

async function setup(active = "dashboard") {
  const { createRenderScheduler } = await loadApi();
  const timers = fakeTimers();
  const log = { shared: 0, views: [], flushes: 0 };
  const state = { active };
  const scheduler = createRenderScheduler({
    viewNames: ["dashboard", "squad", "events", "profiles"],
    activeView: () => state.active,
    renderShared: () => { log.shared += 1; },
    renderView: (name) => log.views.push(name),
    onFlush: () => { log.flushes += 1; },
    timers
  });
  return { scheduler, timers, log, state };
}

test("viele Snapshots ergeben genau einen Render-Durchlauf", async () => {
  const { scheduler, timers, log } = await setup();
  for (let i = 0; i < 160; i += 1) scheduler.request();
  assert.equal(timers.size(), 1);
  assert.equal(log.views.length, 0, "nichts darf synchron rendern");
  timers.tick();
  assert.equal(log.flushes, 1);
  assert.equal(log.shared, 1);
});

test("nur die aktive Ansicht wird gerendert, die anderen gelten als veraltet", async () => {
  const { scheduler, timers, log } = await setup("squad");
  scheduler.request();
  timers.tick();
  assert.deepEqual(log.views, ["squad"]);
  assert.equal(scheduler.isDirty("squad"), false);
  for (const name of ["dashboard", "events", "profiles"]) assert.equal(scheduler.isDirty(name), true, name);
});

test("beim Aktivieren einer veralteten Ansicht wird sie genau einmal nachgerendert", async () => {
  const { scheduler, timers } = await setup("dashboard");
  scheduler.request();
  timers.tick();
  assert.equal(scheduler.consume("events"), true);
  assert.equal(scheduler.consume("events"), false, "danach ist sie aktuell");
});

test("ein synchrones renderAll (clear) verwirft geplante Durchlaeufe und veraltete Markierungen", async () => {
  const { scheduler, timers, log } = await setup();
  scheduler.request();
  timers.tick();
  scheduler.request();
  scheduler.clear();
  assert.equal(scheduler.isPending(), false);
  assert.equal(scheduler.isDirty("events"), false);
  timers.tick();
  assert.equal(log.flushes, 1, "nur der erste Durchlauf lief");
});

test("nach einem Durchlauf kann der naechste Snapshot wieder einen planen", async () => {
  const { scheduler, timers, log } = await setup();
  scheduler.request();
  timers.tick();
  scheduler.request();
  timers.tick();
  assert.equal(log.flushes, 2);
});

test("Memoisierung gilt nur innerhalb eines Durchlaufs", async () => {
  const { createRenderPassMemo } = await loadApi();
  const memo = createRenderPassMemo();
  let calls = 0;
  const compute = () => { calls += 1; return calls; };
  // Ausserhalb eines Durchlaufs (Eingabe-Handler): immer frisch berechnen.
  assert.equal(memo.get("grade", "p1", compute), 1);
  assert.equal(memo.get("grade", "p1", compute), 2);
  calls = 0;
  memo.run(() => {
    assert.equal(memo.get("grade", "p1", compute), 1);
    assert.equal(memo.get("grade", "p1", compute), 1);
    assert.equal(memo.get("risk", "p1", compute), 2, "andere Art, anderer Eintrag");
    assert.equal(memo.get("grade", "p2", compute), 3);
    memo.run(() => assert.equal(memo.get("grade", "p1", compute), 1, "verschachtelt: gleicher Durchlauf"));
  });
  // Neuer Durchlauf: Cache ist leer, geaenderte Daten werden sichtbar.
  memo.run(() => assert.equal(memo.get("grade", "p1", compute), 4));
  assert.equal(memo.get("grade", "p1", compute), 5);
});

test("Memo wird auch bei Fehlern im Durchlauf freigegeben", async () => {
  const { createRenderPassMemo } = await loadApi();
  const memo = createRenderPassMemo();
  assert.throws(() => memo.run(() => { memo.get("grade", "p1", () => 1); throw new Error("x"); }));
  let calls = 0;
  memo.get("grade", "p1", () => ++calls);
  memo.get("grade", "p1", () => ++calls);
  assert.equal(calls, 2);
});

test("Cloud-Snapshots rendern gebuendelt, Kennzahlen laufen ueber die Memoisierung (alle Teams)", async () => {
  for (const team of teams) {
    const app = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
    const rebuild = app.split("function rebuildStateFromCloudCache()")[1].split("\n}\n")[0];
    assert.match(rebuild, /requestCloudRender\(\)/, `${team}: Snapshot muss gebuendelt rendern`);
    assert.doesNotMatch(rebuild, /renderAll\(\)/, `${team}: kein Voll-Render pro Snapshot`);
    assert.match(app, /function playerAverageGrade\(playerId\) \{\s*return renderPassMemo\("grade"/, team);
    assert.match(app, /function playerInjuryRisk\(playerId\) \{\s*return renderPassMemo\("risk"/, team);
    // Der Tab-Wechsel zeichnet eine im Hintergrund veraltete Events-Ansicht neu.
    assert.match(app, /renderScheduler\.consume\(viewName\)/, team);
    assert.match(app, /if \(wasStale\) renderEvents\(\)/, team);
  }
});

test("Standard-Timer sind in Funktionen gekapselt (Browser: setTimeout darf nicht als Methode aufgerufen werden)", async () => {
  for (const team of teams) {
    const app = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
    assert.doesNotMatch(app, /set: setTimeout/, team);
  }
  // Mit echten Standard-Timern, aber window-aehnlicher Pruefung: setTimeout verlangt this === globalThis.
  const { createRenderScheduler } = await loadApi();
  const calls = [];
  const scheduler = createRenderScheduler({ viewNames: ["a"], activeView: () => "a", renderShared() {}, renderView: (n) => calls.push(n), delay: 1 });
  scheduler.request();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, ["a"]);
});
