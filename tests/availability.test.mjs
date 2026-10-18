import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-164: Status "Verletzt" ohne Datum belegt kuenftige Termine mit "Fehlt" vor (ab dem Tag,
// an dem der Status gesetzt wurde); beim Zuruecksetzen bleibt vergangenes "Fehlt" stehen.
// Von Hand gesetzte Anwesenheit bleibt immer unangetastet (SCRUM-18). Gilt fuer jede Team-Kopie.
const teams = ["team-manager", "u15", "u17"];
const TODAY = "2026-10-17";

async function setup(team, { players, events, absences = {} }) {
  const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
  const start = source.indexOf("// AVAILABILITY START");
  const end = source.indexOf("// AVAILABILITY END");
  assert.ok(start > 0 && end > start, "AVAILABILITY-Block fehlt");
  const saved = [];
  const state = { players, events, absences };
  const factory = new Function("state", "saved", `
    const localIsoDate = () => "${TODAY}";
    const formatDate = (v) => v.split("-").reverse().join(".");
    const isInjuryAbsence = (a) => a?.kind ? a.kind === "injury" : /^verletz/i.test(a?.label || "");
    const absenceTitle = (a) => a.label;
    const cloudSaveRating = (eventId, playerId) => saved.push(eventId + ":" + playerId);
    const persist = () => {};
    ${source.slice(start, end)}
    return { unavailabilityReason, injuredSinceFor, applyAutoAbsence, reconcileAbsences, playerEffectiveStatus };
  `);
  return { api: factory(state, saved), state, saved };
}

const player = (overrides = {}) => ({ id: "p1", name: "Ali", status: "Fit", injuryUntil: "", ...overrides });

for (const team of teams) {
  test(`${team}: "Verletzt" ohne Datum gilt ab dem gesetzten Tag bis auf Weiteres`, async () => {
    const { api } = await setup(team, { players: [], events: [] });
    const injured = player({ status: "Verletzt", injuredSince: "2026-10-17" });
    assert.equal(api.unavailabilityReason(injured, "2026-10-17"), "Verletzt (bis auf Weiteres)");
    assert.equal(api.unavailabilityReason(injured, "2027-01-10"), "Verletzt (bis auf Weiteres)");
    assert.equal(api.unavailabilityReason(injured, "2026-10-16"), null);
    assert.equal(api.unavailabilityReason(player({ status: "Verletzt" }), "2026-10-20"), null); // aeltere Daten ohne Tag
    assert.equal(api.unavailabilityReason(player({ status: "Verletzt", injuryUntil: "2026-10-20" }), "2026-10-18"), "Verletzt (ca. bis 20.10.2026)");
    assert.equal(api.injuredSinceFor("Verletzt", null, TODAY), TODAY);
    assert.equal(api.injuredSinceFor("Verletzt", { status: "Verletzt", injuredSince: "2026-10-01" }, TODAY), "2026-10-01");
    assert.equal(api.injuredSinceFor("Fit", { status: "Verletzt", injuredSince: "2026-10-01" }, TODAY), "");
  });

  test(`${team}: belegt kuenftige Termine vor, von Hand gesetzte Anwesenheit bleibt`, async () => {
    const events = [
      { id: "past", date: "2026-10-05", ratings: {} },
      { id: "future", date: "2026-11-30", ratings: {} },
      { id: "manual", date: "2026-12-01", ratings: { p1: { attendance: "present" } } },
    ];
    const { api, saved } = await setup(team, { players: [player({ status: "Verletzt", injuredSince: TODAY })], events });
    api.reconcileAbsences({ playerId: "p1", pastBefore: TODAY, keepPastOpenInjury: false });
    assert.deepEqual(saved, ["future:p1"]);
    assert.equal(events[1].ratings.p1.attendance, "absent");
    assert.equal(events[1].ratings.p1.autoAbsence, true);
    assert.equal(events[1].ratings.p1.note, "Verletzt (bis auf Weiteres)");
    assert.equal(events[0].ratings.p1, undefined);
    assert.equal(events[2].ratings.p1.attendance, "present");
    // Ein spaeter angelegter Termin wird ebenso vorbelegt.
    const later = { id: "later", date: "2027-02-01", ratings: {} };
    api.applyAutoAbsence(later);
    assert.equal(later.ratings.p1.attendance, "absent");
  });

  test(`${team}: zurueck auf "Fit": kuenftiges "Fehlt" weg, vergangenes bleibt dauerhaft`, async () => {
    const auto = () => ({ attendance: "absent", note: "Verletzt (bis auf Weiteres)", autoAbsence: true });
    const events = [
      { id: "past", date: "2026-10-05", ratings: { p1: auto() } },
      { id: "future", date: "2026-11-30", ratings: { p1: auto() } },
    ];
    const { api, saved } = await setup(team, { players: [player({ status: "Fit", injuredSince: "" })], events });
    api.reconcileAbsences({ playerId: "p1", pastBefore: TODAY, keepPastOpenInjury: true });
    assert.deepEqual(saved.sort(), ["future:p1", "past:p1"]);
    assert.equal(events[1].ratings.p1.attendance, "open");
    assert.equal(events[0].ratings.p1.attendance, "absent");
    assert.equal(events[0].ratings.p1.autoAbsence, false);
    // Ein spaeterer Abgleich (z. B. nach einer Abwesenheits-Aenderung) laesst es stehen.
    api.reconcileAbsences();
    assert.equal(events[0].ratings.p1.attendance, "absent");
  });

  test(`${team}: Kader-Status nutzt eine laufende Abwesenheit`, async () => {
    const { api } = await setup(team, {
      players: [],
      events: [],
      absences: { p1: [{ id: "a", kind: "injury", label: "Verletzung", from: "2026-10-01", to: "" }] },
    });
    assert.equal(api.playerEffectiveStatus(player()), "Verletzt");
  });
}
