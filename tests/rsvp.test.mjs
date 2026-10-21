import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-175: Zu-/Absagen. Eine Absage belegt die Anwesenheit mit "Fehlt" vor, eine spaetere Zusage setzt sie
// zurueck auf "Offen" - nur solange niemand die Bewertung von Hand geaendert hat. Gilt fuer jede Team-Kopie.
const teams = ["team-manager", "u15", "u17"];
const TODAY = "2026-10-21";

function block(source, name) {
  const start = source.indexOf(`// ${name} START`);
  const end = source.indexOf(`// ${name} END`);
  assert.ok(start > 0 && end > start, `${name}-Block fehlt`);
  return source.slice(start, end);
}

async function setup(team, { players = [], events = [], absences = {} } = {}) {
  const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
  const saved = [];
  const state = { players, events, absences };
  const factory = new Function("state", "saved", `
    const localIsoDate = (date) => date ? date.toISOString().slice(0, 10) : "${TODAY}";
    const formatDate = (v) => v.split("-").reverse().join(".");
    const isInjuryAbsence = (a) => a?.kind ? a.kind === "injury" : /^verletz/i.test(a?.label || "");
    const absenceTitle = (a) => a.label;
    const cloudSaveRating = (eventId, playerId, rating) => saved.push([eventId, playerId, { ...rating }]);
    const persist = () => {};
    ${block(source, "AVAILABILITY")}
    ${block(source, "RSVP")}
    return { applyRsvpAbsence, reconcileRsvp, rsvpCounts, rsvpStatus, buildRsvpResponse, rsvpListenerEventIds, upcomingRsvpEvents, rsvpAbsenceNote };
  `);
  return { api: factory(state, saved), state, saved };
}

const player = (id = "p1") => ({ id, name: id, status: "Fit", injuryUntil: "" });
const answer = (status, reason = "") => ({ status, reason, by: "player" });

for (const team of teams) {
  test(`${team}: Absage -> "Fehlt", Zusage nach Absage -> "Offen"`, async () => {
    const event = { id: "e1", date: "2026-10-28", ratings: {}, responses: { p1: answer("no", "Familienfeier") } };
    const { api, saved } = await setup(team, { players: [player()], events: [event] });
    assert.equal(api.reconcileRsvp(), true);
    assert.equal(event.ratings.p1.attendance, "absent");
    assert.equal(event.ratings.p1.note, "Abgesagt: Familienfeier");
    assert.equal(event.ratings.p1.rsvpAbsence, true);
    assert.equal(saved.length, 1);

    // Nochmal abgleichen aendert nichts (keine doppelten Schreibvorgaenge).
    assert.equal(api.reconcileRsvp(), false);
    assert.equal(saved.length, 1);

    event.responses.p1 = answer("yes");
    assert.equal(api.reconcileRsvp(), true);
    assert.equal(event.ratings.p1.attendance, "open");
    assert.equal(event.ratings.p1.note, "");
    assert.equal(event.ratings.p1.rsvpAbsence, false);
    assert.equal(saved.length, 2);
  });

  test(`${team}: Von Hand gesetzte Anwesenheit und Eingaben bleiben unangetastet`, async () => {
    const events = [
      { id: "manual", date: "2026-10-28", ratings: { p1: { attendance: "present" } }, responses: { p1: answer("no") } },
      { id: "noted", date: "2026-10-29", ratings: { p1: { attendance: "open", note: "Kommt später" } }, responses: { p1: answer("no") } },
      // Absage, danach vom Trainer von Hand geaendert (Markierung weg): eine Zusage setzt nichts zurueck.
      { id: "edited", date: "2026-10-30", ratings: { p1: { attendance: "absent", note: "Abgesagt", rsvpAbsence: false } }, responses: { p1: answer("yes") } },
    ];
    const { api, saved } = await setup(team, { players: [player()], events });
    assert.equal(api.reconcileRsvp(), false);
    assert.deepEqual(saved, []);
    assert.equal(events[0].ratings.p1.attendance, "present");
    assert.equal(events[1].ratings.p1.note, "Kommt später");
    assert.equal(events[2].ratings.p1.attendance, "absent");
  });

  test(`${team}: Absage ueberschreibt keine Verletzung; nach Zusage greift die Abwesenheit wieder`, async () => {
    const injury = { attendance: "absent", note: "Verletzung", autoAbsence: true };
    const injured = { id: "inj", date: "2026-10-28", ratings: { p1: { ...injury } }, responses: { p1: answer("no") } };
    const { api, saved } = await setup(team, {
      players: [player()],
      events: [injured],
      absences: { p1: [{ id: "a", kind: "injury", label: "Verletzung", from: "2026-10-20", to: "2026-11-05" }] },
    });
    api.reconcileRsvp();
    assert.deepEqual(saved, []);
    assert.equal(injured.ratings.p1.autoAbsence, true);

    // Absage vor der Verletzung gesetzt, dann Zusage: zurueck auf "Offen", danach wieder "Fehlt" wegen Verletzung.
    const rsvpFirst = { id: "rsvp", date: "2026-10-29", ratings: { p1: { attendance: "absent", note: "Abgesagt", rsvpAbsence: true } }, responses: { p1: answer("yes") } };
    const second = await setup(team, {
      players: [player()],
      events: [rsvpFirst],
      absences: { p1: [{ id: "a", kind: "injury", label: "Verletzung", from: "2026-10-20", to: "2026-11-05" }] },
    });
    second.api.reconcileRsvp();
    assert.equal(rsvpFirst.ratings.p1.attendance, "absent");
    assert.equal(rsvpFirst.ratings.p1.autoAbsence, true);
    assert.notEqual(rsvpFirst.ratings.p1.rsvpAbsence, true);
  });

  test(`${team}: neuer Grund aktualisiert die Notiz; nicht geladene Events werden nicht angefasst`, async () => {
    const event = { id: "e1", date: "2026-10-28", ratings: { p1: { attendance: "absent", note: "Abgesagt", rsvpAbsence: true } }, responses: { p1: answer("no", "Klassenfahrt") } };
    const other = { id: "e2", date: "2026-10-28", ratings: {}, responses: { p1: answer("no") } };
    const { api, saved } = await setup(team, { players: [player()], events: [event, other] });
    api.reconcileRsvp((eventId) => eventId === "e1");
    assert.equal(event.ratings.p1.note, "Abgesagt: Klassenfahrt");
    assert.deepEqual(saved.map(([eventId]) => eventId), ["e1"]);
    assert.equal(other.ratings.p1, undefined);
  });

  test(`${team}: Zaehlung, Dokumentinhalt und Terminauswahl`, async () => {
    const { api } = await setup(team);
    const event = { responses: { p1: answer("yes"), p2: answer("no"), p9: answer("no"), p3: { status: "kaputt" } } };
    assert.deepEqual(api.rsvpCounts(event, [player("p1"), player("p2"), player("p3"), player("p4")]), { yes: 1, no: 1, open: 2 });
    assert.equal(api.rsvpStatus({}, "p1"), "open");

    assert.deepEqual(api.buildRsvpResponse("p1", "no", "  Familien\n feier ", "parent"), { playerId: "p1", status: "no", reason: "Familien feier", by: "parent" });
    assert.deepEqual(api.buildRsvpResponse("p1", "yes", "egal", "player"), { playerId: "p1", status: "yes", reason: "", by: "player" });
    assert.equal(api.buildRsvpResponse("p1", "no", "x".repeat(300), "player").reason.length, 200);
    assert.equal(api.buildRsvpResponse("p1", "vielleicht", "", "player"), null);
    assert.equal(api.buildRsvpResponse("p1", "yes", "", "trainer"), null);
    assert.equal(api.buildRsvpResponse("", "yes", "", "player"), null);
    assert.equal(api.rsvpAbsenceNote({ reason: "" }), "Abgesagt");

    const events = [
      { id: "old", date: "2026-10-01" },
      { id: "recent", date: "2026-10-10" },
      { id: "today", date: TODAY, title: "B" },
      { id: "today2", date: TODAY, title: "A" },
      { id: "later", date: "2026-12-01" },
    ];
    assert.deepEqual(api.rsvpListenerEventIds(events, TODAY, 0), ["today", "today2", "later"]);
    assert.deepEqual(api.rsvpListenerEventIds(events, TODAY, 14), ["recent", "today", "today2", "later"]);
    assert.deepEqual(api.upcomingRsvpEvents(events, TODAY, 2).map((event) => event.id), ["today2", "today"]);
  });
}
