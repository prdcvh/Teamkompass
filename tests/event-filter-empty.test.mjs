import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-166: Ladephase, leerer Bestand und Suche ohne Treffer sind drei getrennte Faelle.
// SCRUM-131: Eventsuche ohne Treffer darf nicht "Noch keine Events angelegt" melden.
const teams = ["team-manager", "u15", "u17"];

async function setup(team, events, loadState = "ready") {
  const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
  const listPart = source.slice(source.indexOf("let eventFilter"), source.indexOf("function ratingPlayersForEvent"));
  const resetStart = source.indexOf("function resetEventFilter");
  const resetPart = resetStart < 0 ? "function resetEventFilter() {}" : source.slice(resetStart, source.indexOf("function handleEventListClick"));
  const dom = new Map();
  const el = (id) => {
    if (!dom.has(id)) {
      const node = { innerHTML: "", value: "", hidden: false, open: false, textContent: "", classes: new Set() };
      node.classList = { toggle: (name, on) => (on ? node.classes.add(name) : node.classes.delete(name)) };
      dom.set(id, node);
    }
    return dom.get(id);
  };
  const state = { events, selectedEventId: events[0]?.id };
  const factory = new Function("state", "$", "getEventsLoadState", `
    const localIsoDate = () => "2026-10-15";
    const escapeHtml = (v) => String(v);
    const gameResult = () => null;
    const intensityLabel = () => "";
    const exertionLabel = () => "";
    const eventExertion = () => 5;
    const selectedEvent = () => state.events.find((e) => e.id === state.selectedEventId) || state.events[0];
    const renderRatingTable = () => {};
    const showsRsvp = () => false; // SCRUM-175: Zu-/Absagen nur im Rollen-Modus
    const rsvpCountsText = () => "";
    const rsvpCounts = () => ({});
    function syncEventSelect() {} // SCRUM-129 (liegt ausserhalb des ausgeschnittenen Bereichs)
    ${listPart}
    ${resetPart}
    return { renderEvents, resetEventFilter, setFilter: (f) => { eventFilter = f; } };
  `);
  return { api: factory(state, (sel) => el(sel.slice(1)), () => loadState), el };
}

const events = [
  { id: "a", title: "Training Dienstag", date: "2026-09-01", type: "Training" },
  { id: "b", title: "Spiel gegen Nidda", date: "2026-09-08", type: "Spiel", opponent: "Nidda" }
];

for (const team of teams) {
  test(`${team}: Suche ohne Treffer meldet keinen leeren Datenbestand`, async () => {
    const { api, el } = await setup(team, events);
    api.setFilter({ query: "kein-treffer", type: "all" });
    api.renderEvents();
    const html = el("eventList").innerHTML;
    assert.doesNotMatch(html, /Noch keine Events angelegt/);
    assert.match(html, /Keine Events für diese Suche gefunden/);
    assert.match(html, /data-reset-event-filter/);
    assert.ok(el("eventsView").classes.has("events-filter-empty"), "Detailbereich wird ausgeblendet");
  });

  test(`${team}: leerer Datenbestand behaelt die Meldung, Zuruecksetzen stellt Liste her`, async () => {
    const empty = await setup(team, []);
    empty.api.renderEvents();
    assert.match(empty.el("eventList").innerHTML, /Noch keine Events angelegt/);
    assert.ok(!empty.el("eventsView").classes.has("events-filter-empty"));

    const { api, el } = await setup(team, events);
    api.setFilter({ query: "kein-treffer", type: "Spiel" });
    api.renderEvents();
    api.resetEventFilter();
    assert.equal(el("eventSearch").value, "");
    assert.equal(el("eventTypeFilter").value, "all");
    assert.ok(!el("eventsView").classes.has("events-filter-empty"));
    assert.match(el("pastEventsList").innerHTML, /Training Dienstag/);
  });

  test(`${team}: Detail ausserhalb des Filters wird gekennzeichnet`, async () => {
    const { api, el } = await setup(team, events); // ausgewaehlt: "a" (Training)
    api.setFilter({ query: "", type: "Spiel" });
    api.renderEvents();
    assert.equal(el("eventOutsideFilterNote").hidden, false);
    api.setFilter({ query: "", type: "all" });
    api.renderEvents();
    assert.equal(el("eventOutsideFilterNote").hidden, true);
  });
}

for (const team of teams) {
  test(`${team}: SCRUM-166 Ladephase zeigt Statusmeldung statt "Noch keine Events angelegt"`, async () => {
    const { api, el } = await setup(team, [], "loading");
    api.renderEvents();
    const html = el("eventList").innerHTML;
    assert.match(html, /Events werden geladen/);
    assert.doesNotMatch(html, /Noch keine Events angelegt/);
    assert.doesNotMatch(html, /Keine Events für diese Suche/);
  });

  test(`${team}: SCRUM-166 Ladefehler meldet weder leeren Bestand noch Laden`, async () => {
    const { api, el } = await setup(team, [], "error");
    api.renderEvents();
    const html = el("eventList").innerHTML;
    assert.match(html, /konnten nicht geladen werden/);
    assert.doesNotMatch(html, /Noch keine Events angelegt/);
  });

  test(`${team}: SCRUM-166 nach abgeschlossener leerer Abfrage erscheint "Noch keine Events angelegt"`, async () => {
    const { api, el } = await setup(team, [], "ready");
    api.renderEvents();
    const html = el("eventList").innerHTML;
    assert.match(html, /Noch keine Events angelegt/);
    assert.doesNotMatch(html, /werden geladen/);
  });

  test(`${team}: SCRUM-166 geladener Bestand mit Suche ohne Treffer bleibt unveraendert`, async () => {
    const { api, el } = await setup(team, events, "ready");
    api.setFilter({ query: "kein-treffer", type: "all" });
    api.renderEvents();
    assert.match(el("eventList").innerHTML, /Keine Events für diese Suche gefunden/);
    assert.doesNotMatch(el("eventList").innerHTML, /werden geladen/);
  });

  test(`${team}: SCRUM-166 vorhandene Events werden auch waehrend des Ladens (Cache) angezeigt`, async () => {
    const { api, el } = await setup(team, events, "loading");
    api.renderEvents();
    assert.doesNotMatch(el("eventList").innerHTML + el("pastEventsList").innerHTML, /werden geladen/);
    assert.match(el("pastEventsList").innerHTML, /Training Dienstag/);
  });
}
