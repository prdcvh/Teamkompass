import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-129: Kartenwahl und Auswahlfeld "Event" muessen dasselbe Event zeigen.
const teams = ["team-manager", "u15", "u17"];

async function load(team) {
  const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
  const block = source.split("// EVENT-SELECT-SYNC START")[1].split("\n").slice(1).join("\n").split("// EVENT-SELECT-SYNC END")[0];
  const fail = () => { throw new Error("Standardargumente duerfen im Test nicht benutzt werden"); };
  const syncEventSelect = new Function("$", "selectedEvent", `${block}\nreturn syncEventSelect;`)(fail, fail);
  return { source, syncEventSelect };
}

function body(source, header) {
  const start = source.indexOf(header);
  assert.ok(start >= 0, `${header} fehlt`);
  return source.slice(start, source.indexOf("\n}\n", start));
}

for (const team of teams) {
  test(`${team}: Kartenwahl setzt das Auswahlfeld (Karte -> Feld)`, async () => {
    const { source, syncEventSelect } = await load(team);
    const select = { value: "e1" }; // Feld zeigt noch das alte Event
    syncEventSelect(select, "e2"); // Karte e2 wurde gewaehlt
    assert.equal(select.value, "e2");
    // Der Karten-Klick rendert ueber renderEvents ...
    const click = body(source, "function handleEventListClick");
    assert.match(click, /state\.selectedEventId = card\.dataset\.eventId/);
    assert.match(click, /renderEvents\(\)/);
    // ... und renderEvents gleicht das Feld ab (Ursache des Fehlers: tat es nicht).
    assert.match(body(source, "function renderEvents()"), /syncEventSelect\(\)/);
  });

  test(`${team}: Feldwechsel markiert dieselbe Karte (Feld -> Karte), ohne Cloud-Schreiben`, async () => {
    const { source, syncEventSelect } = await load(team);
    const select = { value: "e3" };
    syncEventSelect(select, "e3");
    assert.equal(select.value, "e3");
    const handler = source.split('on("#eventSelect", "change"')[1].split("\n});")[0];
    assert.match(handler, /state\.selectedEventId = event\.target\.value/);
    assert.match(handler, /renderEvents\(\)/); // Markierung kommt aus eventCardsHtml
    assert.doesNotMatch(handler, /cloudSave/); // reine Navigation
    assert.match(body(source, "function eventCardsHtml"), /event\.id === selectedEvent\(\)\?\.id \? "active"/);
  });

  test(`${team}: ohne Event bleibt das Feld unveraendert`, async () => {
    const { syncEventSelect } = await load(team);
    const select = { value: "" };
    syncEventSelect(select, null);
    assert.equal(select.value, "");
  });
}
