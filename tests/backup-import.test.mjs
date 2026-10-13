import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const teams = ["team-manager", "u15", "u17"];

async function loadBackupApi(team = "team-manager") {
  const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
  const block = source.split("// BACKUP-IMPORT START")[1].split("\n").slice(1).join("\n").split("// BACKUP-IMPORT END")[0];
  return new Function(`${block}\nreturn { validateBackupData, mergeBackupState, summarizeBackupImport, backupCloudOperations };`)();
}

const lineup = (ids) => ({ assignments: { GK: ids, IV: [] } });
const rating = (note) => ({ attendance: "present", note });
const current = () => ({
  players: [{ id: "p1", name: "Alt" }, { id: "p2", name: "Bleibt" }],
  events: [{ id: "e1", title: "Alt", ratings: { p1: rating("alt"), p2: rating("bleibt") }, privateNotes: {} }],
  developmentPlans: { p1: [{ id: "d1", focus: "alt" }], p2: [] },
  absences: { p1: [], p2: [] },
  measurements: { p1: [], p2: [] },
  opponents: [{ id: "o1", name: "FC Alt" }],
  lineup: lineup(["p2"])
});
const backup = () => ({
  players: [{ id: "p1", name: "Neu" }, { id: "p3", name: "Gelöscht" }],
  events: [
    { id: "e1", title: "Neu", ratings: { p1: rating("neu") }, privateNotes: { p1: "intern" } },
    { id: "e2", title: "Zurück", ratings: { p3: rating("x") }, privateNotes: {} }
  ],
  developmentPlans: { p1: [{ id: "d1", focus: "neu" }, { id: "d2", focus: "extra" }], p3: [] },
  absences: { p3: [{ id: "a1", label: "Urlaub" }] },
  measurements: {},
  opponents: [{ id: "o2", name: "FC Neu" }],
  lineup: lineup([])
});

test("alle Team-Instanzen enthalten den Backup-Import identisch", async () => {
  const sources = await Promise.all(teams.map((team) => readFile(new URL(`../outputs/${team}/index.html`, import.meta.url), "utf8")));
  for (const html of sources) {
    assert.match(html, /id="importBtn"/);
    assert.match(html, /id="importFile"[^>]*accept=/);
  }
});

test("Root-Kopie nutzt denselben Import-Kern wie die Team-Apps", async () => {
  const core = (source) => source.split("// BACKUP-IMPORT START")[1].split("// BACKUP-IMPORT END")[0];
  const [root, team, html] = await Promise.all(["app.js", "outputs/team-manager/app.js", "index.html"].map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));
  assert.equal(core(root), core(team));
  assert.match(html, /id="importBtn"/);
  assert.match(html, /id="importFile"/);
});

test("Backup-Validierung lehnt fremde oder kaputte Dateien ab, ohne auf Beispieldaten zurückzufallen", async () => {
  const { validateBackupData } = await loadBackupApi();
  assert.equal(validateBackupData(backup()).ok, true);
  for (const bad of [null, [], "x", {}, { players: [], events: [] }, { players: [{ id: "p1" }], events: [] }, { players: [{ id: "../x", name: "A" }], events: [] }, { players: [{ id: "p1", name: "A" }], events: [{ id: "__proto__/x" }] }, { players: [{ id: "p1", name: "A" }], events: [{ id: "e1", ratings: { "a/b": {} } }] }, { players: [{ id: "p1", name: "A" }], events: [], absences: { p1: "kaputt" } }]) {
    assert.equal(validateBackupData(bad).ok, false, JSON.stringify(bad));
  }
});

test("Zusammenführen überschreibt gleiche IDs, ergänzt Neues und löscht nichts", async () => {
  const { mergeBackupState } = await loadBackupApi();
  const merged = mergeBackupState(current(), backup());
  assert.deepEqual(merged.players.map((p) => `${p.id}:${p.name}`).sort(), ["p1:Neu", "p2:Bleibt", "p3:Gelöscht"]);
  assert.deepEqual(merged.events.map((e) => e.id).sort(), ["e1", "e2"]);
  const e1 = merged.events.find((e) => e.id === "e1");
  assert.equal(e1.title, "Neu");
  assert.equal(e1.ratings.p1.note, "neu");
  assert.equal(e1.ratings.p2.note, "bleibt", "Bewertung ohne Gegenstück im Backup bleibt erhalten");
  assert.equal(e1.privateNotes.p1, "intern");
  assert.deepEqual(merged.developmentPlans.p1.map((d) => `${d.id}:${d.focus}`).sort(), ["d1:neu", "d2:extra"]);
  assert.equal(merged.absences.p3[0].label, "Urlaub");
  assert.deepEqual(merged.opponents.map((o) => o.id).sort(), ["o1", "o2"]);
  assert.deepEqual(merged.lineup.assignments.GK, ["p2"], "leere Backup-Aufstellung ersetzt die aktuelle nicht");
});

test("Import in ein leeres Team ergibt denselben Datenstand", async () => {
  const { mergeBackupState } = await loadBackupApi();
  const empty = { players: [], events: [], developmentPlans: {}, absences: {}, measurements: {}, opponents: [], lineup: lineup([]) };
  const data = backup();
  data.lineup = lineup(["p1"]);
  const merged = mergeBackupState(empty, data);
  assert.deepEqual(merged.players, data.players);
  assert.deepEqual(merged.events, data.events);
  assert.deepEqual(merged.developmentPlans.p1, data.developmentPlans.p1);
  assert.deepEqual(merged.absences.p3, data.absences.p3);
  assert.deepEqual(merged.opponents, data.opponents);
  assert.deepEqual(merged.lineup, data.lineup);
});

test("Vorschau zählt neue und überschriebene Einträge", async () => {
  const { summarizeBackupImport } = await loadBackupApi();
  const summary = summarizeBackupImport(current(), backup());
  assert.deepEqual(summary.players, { created: 1, overwritten: 1 });
  assert.deepEqual(summary.events, { created: 1, overwritten: 1 });
  assert.deepEqual(summary.plans, { created: 1, overwritten: 1 });
  assert.deepEqual(summary.opponents, { created: 1, overwritten: 0 });
  assert.equal(summary.ratings, 2);
});

test("Cloud-Schreibliste nutzt dieselben Pfade und Felder wie die Einzelspeicherungen", async () => {
  const { backupCloudOperations } = await loadBackupApi();
  const ops = backupCloudOperations(backup());
  const byPath = Object.fromEntries(ops.map((op) => [op.path.join("/"), op]));
  assert.ok(byPath["players/p1"].merge);
  assert.equal("ratings" in byPath["events/e1"].data, false, "Bewertungen gehören nicht ins Event-Dokument");
  assert.equal("privateNotes" in byPath["events/e1"].data, false);
  assert.deepEqual(byPath["events/e1/ratings/p1"].data, { ...rating("neu"), playerId: "p1" });
  assert.deepEqual(byPath["events/e1/privateNotes/p1"].data, { playerId: "p1", note: "intern" });
  assert.equal(byPath["players/p1/developmentPlans/d2"].data.playerId, "p1");
  assert.equal(byPath["players/p3/absences/a1"].merge, false);
  assert.ok(byPath["opponents/o2"]);
  assert.equal("meta/lineup" in byPath, false, "leere Aufstellung wird nicht geschrieben");
});
