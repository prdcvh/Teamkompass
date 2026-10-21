import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-34: Spiele mit Gegnerprofilen verknuepfen, Bilanz gegen einen Gegner.
const teams = ["team-manager", "u15", "u17"];

async function load(team) {
  const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
  assert.ok(source.includes("// OPPONENT-LINK START"), `${team}: Block fehlt`);
  const block = source.split("// OPPONENT-LINK START")[1].split("\n").slice(1).join("\n").split("// OPPONENT-LINK END")[0];
  const api = new Function(`${block}\nreturn { opponentNameKey, opponentProfileForEvent, opponentRecord };`)();
  return { source, ...api };
}

// Wie gameResult in app.js, ohne "Zukunfts"-Pruefung (Datum steht in den Testdaten in der Vergangenheit).
function resultOf(event) {
  if (event.type !== "Spiel" || event.goalsFor === "" || event.goalsAgainst === "") return null;
  const goalsFor = Number(event.goalsFor);
  const goalsAgainst = Number(event.goalsAgainst);
  return { goalsFor, goalsAgainst, outcome: goalsFor > goalsAgainst ? "Sieg" : goalsFor < goalsAgainst ? "Niederlage" : "Unentschieden" };
}

const opponents = [
  { id: "o1", name: "SV Nord" },
  { id: "o2", name: "FC Süd" }
];
const game = (id, date, extra) => ({ id, type: "Spiel", title: id, date, goalsFor: "", goalsAgainst: "", ...extra });

for (const team of teams) {
  test(`${team}: Zuordnung ueber opponentId hat Vorrang vor dem Namen`, async () => {
    const { opponentProfileForEvent } = await load(team);
    assert.equal(opponentProfileForEvent(game("a", "2026-01-01", { opponentId: "o2", opponent: "SV Nord" }), opponents).id, "o2");
  });

  test(`${team}: Altdaten ohne opponentId werden nur ueber den Namen zugeordnet (Gross/Klein, Leerzeichen egal)`, async () => {
    const { opponentProfileForEvent } = await load(team);
    assert.equal(opponentProfileForEvent(game("a", "2026-01-01", { opponent: "  sv   NORD " }), opponents).id, "o1");
    assert.equal(opponentProfileForEvent(game("a", "2026-01-01", { opponentId: "geloescht", opponent: "FC Süd" }), opponents).id, "o2");
    assert.equal(opponentProfileForEvent(game("a", "2026-01-01", { opponent: "Unbekannt FC" }), opponents), null);
    assert.equal(opponentProfileForEvent(game("a", "2026-01-01", { opponent: "" }), opponents), null);
    assert.equal(opponentProfileForEvent({ type: "Training", opponent: "SV Nord" }, opponents), null);
  });

  test(`${team}: Bilanz zaehlt Siege, Remis, Niederlagen und Tore nur mit Ergebnis`, async () => {
    const { opponentRecord } = await load(team);
    const events = [
      game("g1", "2026-01-01", { opponentId: "o1", opponent: "SV Nord", goalsFor: 3, goalsAgainst: 1 }),
      game("g2", "2026-03-01", { opponent: "sv nord", goalsFor: 2, goalsAgainst: 2 }), // Altdatum: Name
      game("g3", "2026-02-01", { opponentId: "o1", opponent: "SV Nord", goalsFor: 0, goalsAgainst: 4 }),
      game("g4", "2026-04-01", { opponentId: "o1", opponent: "SV Nord" }), // noch kein Ergebnis
      game("g5", "2026-05-01", { opponentId: "o2", opponent: "FC Süd", goalsFor: 9, goalsAgainst: 0 }), // anderer Gegner
      { id: "t1", type: "Training", date: "2026-01-02", opponent: "SV Nord", goalsFor: 5, goalsAgainst: 0 }
    ];
    const record = opponentRecord(opponents[0], events, opponents, resultOf);
    assert.deepEqual({ w: record.wins, d: record.draws, l: record.losses, gf: record.goalsFor, ga: record.goalsAgainst }, { w: 1, d: 1, l: 1, gf: 5, ga: 7 });
    assert.deepEqual(record.games.map((item) => item.eventId), ["g2", "g3", "g1"]); // neueste zuerst
    assert.equal(opponentRecord(opponents[1], events, opponents, resultOf).wins, 1);
    assert.equal(opponentRecord(null, events, opponents, resultOf).games.length, 0);
  });

  test(`${team}: Event-Dialog speichert opponentId, Gegnerkarte und Event zeigen die Verknuepfung`, async () => {
    const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
    const html = await readFile(new URL(`../outputs/${team}/index.html`, import.meta.url), "utf8");
    assert.match(source, /opponentId: eventOpponentIdFromForm\(\)/);
    assert.match(source, /fillEventOpponentSelect\(editing\?\.opponentId/);
    assert.match(source, /opponentRecord\(opponent, state\.events, state\.opponents, gameResult\)/);
    assert.match(source, /renderEventOpponentPlan\(event\);/);
    assert.match(html, /id="eventOpponentSelect"/);
    assert.match(html, /id="eventOpponentPlan"/);
    assert.match(html, /id="eventOpponent"/); // Freitext-Fallback bleibt
  });
}
