// SCRUM-170: Scouts sehen nur eine bereinigte Leistungsansicht (scoutProfiles) - keine Gesundheitsdaten.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const teams = ["team-manager", "u15", "u17"];
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function loadScoutApi(team = "team-manager") {
  const source = await read(`outputs/${team}/app.js`);
  const block = source.split("// SCOUT-PROJECTION START")[1].split("\n").slice(1).join("\n").split("// SCOUT-PROJECTION END")[0];
  return new Function(`${block}\nreturn { effectiveMemberRole, scoutRating, scoutProfileFor, buildScoutProfiles, scoutProfileWrites, scoutStateFromProfiles, stableJson };`)();
}

// Ein Spieler mit allem, was ein Scout NICHT sehen darf.
const player = {
  id: "p1",
  name: "Mika",
  number: 7,
  positions: ["ST", "RA"],
  birthdate: "2012-03-14",
  status: "Verletzt",
  injuryUntil: "2026-11-30",
  injuredSince: "2026-10-01",
  consentStatus: "revoked",
  consentDate: "2026-09-01",
  notes: "Asthma-Spray dabei"
};
const events = [
  { id: "e1", ratings: { p1: { attendance: "absent", note: "Verletzung: Kreuzbandriss", autoAbsence: true, effort: "", technique: "" } } },
  { id: "e2", ratings: { p1: { attendance: "limited", effort: 2, technique: 3, tactics: 2, comprehension: 1, minutes: 45, goals: 1, assists: 0, note: "Belastung dosiert wegen Knie", grade: 2.1 } } },
  { id: "e3", ratings: { p1: { attendance: "open", effort: "", note: "" } } },
  { id: "e4", ratings: { p2: { attendance: "present", effort: 1 } } }
];

const forbiddenText = ["Verletz", "Kreuzband", "Knie", "Asthma", "revoked", "injury", "limited", "autoAbsence", "note", "status", "consent", "2026-11-30"];

test("Scout-Profil enthaelt nur Name, Nummer, Positionen, Geburtsdatum und Teilnoten - keine Gesundheitsdaten", async () => {
  const { scoutProfileFor } = await loadScoutApi();
  const profile = scoutProfileFor(player, events);
  assert.deepEqual(Object.keys(profile).sort(), ["birthdate", "name", "number", "playerId", "positions", "ratings"]);
  assert.deepEqual(profile.positions, ["ST", "RA"]);
  // e3 hat keine Daten, e4 betrifft einen anderen Spieler.
  assert.deepEqual(Object.keys(profile.ratings).sort(), ["e1", "e2"]);
  assert.deepEqual(profile.ratings.e1, { attendance: "absent", effort: "", technique: "", tactics: "", comprehension: "", minutes: "", goals: "", assists: "" });
  assert.deepEqual(profile.ratings.e2, { attendance: "present", effort: 2, technique: 3, tactics: 2, comprehension: 1, minutes: 45, goals: 1, assists: 0 });
  const json = JSON.stringify(profile);
  for (const text of forbiddenText) assert.equal(json.includes(text), false, `Scout-Profil enthaelt "${text}"`);
});

test("Freitext in Teilnoten-Feldern wird nicht durchgereicht", async () => {
  const { scoutRating } = await loadScoutApi();
  const clean = scoutRating({ attendance: "excluded", effort: "Fehlt wegen Krankheit (Grippe)", goals: { x: 1 }, minutes: 90 });
  assert.deepEqual(clean, { attendance: "absent", effort: "", technique: "", tactics: "", comprehension: "", minutes: 90, goals: "", assists: "" });
});

test("Alt-Konten 'medical' ohne healthAccess sind Scouts; Medizin nur mit healthAccess === true", async () => {
  const { effectiveMemberRole } = await loadScoutApi();
  assert.equal(effectiveMemberRole({ role: "medical" }), "scout");
  assert.equal(effectiveMemberRole({ role: "medical", healthAccess: "true" }), "scout");
  assert.equal(effectiveMemberRole({ role: "medical", healthAccess: true }), "medical");
  assert.equal(effectiveMemberRole({ role: "scout" }), "scout");
  assert.equal(effectiveMemberRole({ role: "trainer" }), "trainer");
  assert.equal(effectiveMemberRole({ role: "player", playerId: "p1" }), "player");
  assert.equal(effectiveMemberRole(null), null);
  assert.equal(effectiveMemberRole({}), null);
});

test("Abgleich schreibt nur Abweichungen und loescht Profile geloeschter Spieler", async () => {
  const { buildScoutProfiles, scoutProfileWrites } = await loadScoutApi();
  const expected = buildScoutProfiles([player, { id: "p2", name: "Ben", number: 4, positions: [], birthdate: "2012-01-01" }], events);
  const first = scoutProfileWrites(expected, {});
  assert.deepEqual(first.set.map(([id]) => id).sort(), ["p1", "p2"]);
  assert.deepEqual(first.remove, []);
  // Gleicher Stand (andere Schluesselreihenfolge) -> nichts zu tun.
  const existing = JSON.parse(JSON.stringify(expected));
  existing.p1 = Object.fromEntries(Object.entries(existing.p1).reverse());
  assert.deepEqual(scoutProfileWrites(expected, existing), { set: [], remove: [] });
  // Geaenderte Note und ein geloeschter Spieler.
  existing.p2.ratings = { e4: { ...existing.p2.ratings.e4, effort: 3 } };
  existing.p9 = { playerId: "p9", name: "weg" };
  const next = scoutProfileWrites(expected, existing);
  assert.deepEqual(next.set.map(([id]) => id), ["p2"]);
  assert.deepEqual(next.remove, ["p9"]);
  // Ein Alt-Profil mit Gesundheitsfeld (z. B. manuell angelegt) wird ueberschrieben.
  existing.p2 = { ...expected.p2, status: "Verletzt" };
  assert.deepEqual(scoutProfileWrites(expected, existing).set.map(([id]) => id), ["p2"]);
});

test("Scout-Zustand aus den Profilen hat keine Status-, Abwesenheits-, Mess- oder Notizdaten", async () => {
  const { buildScoutProfiles, scoutStateFromProfiles } = await loadScoutApi();
  // Selbst ein manipuliertes Profil mit Zusatzfeldern bringt diese nicht in den Scout-Zustand.
  const profiles = buildScoutProfiles([player], events);
  profiles.p1.status = "Verletzt";
  profiles.p1.ratings.e2.note = "Knie";
  const { players, ratingsByEvent } = scoutStateFromProfiles(profiles);
  assert.deepEqual(players, [{ id: "p1", name: "Mika", number: 7, positions: ["ST", "RA"], birthdate: "2012-03-14", status: "" }]);
  assert.deepEqual(Object.keys(ratingsByEvent).sort(), ["e1", "e2"]);
  assert.equal(ratingsByEvent.e2.p1.effort, 2);
  const json = JSON.stringify({ players, ratingsByEvent });
  for (const text of forbiddenText.filter((item) => item !== "status")) assert.equal(json.includes(text), false, `Scout-Zustand enthaelt "${text}"`);
});

test("Scout-Ansicht laedt keine Gesundheitsdaten und Rollen sind in allen Team-Kopien getrennt", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const html = await read(`outputs/${team}/index.html`);
    const scoutBranch = app.split('} else if (currentRole === "scout") {')[1].split("\n  }\n}")[0];
    assert.match(scoutBranch, /teamCollection\("scoutProfiles"\)/);
    for (const forbidden of ['"players"', '"absences"', '"measurements"', '"ratings"', '"privateNotes"', '"developmentPlans"']) {
      assert.equal(scoutBranch.includes(forbidden), false, `${team}: Scout-Zweig liest ${forbidden}`);
    }
    assert.match(app, /currentRole = effectiveMemberRole\(member\)/);
    assert.match(app, /role === "medical" \? \{ healthAccess: true \}/);
    assert.match(html, /id="addScoutBtn"[^>]*>Scout-Zugang anlegen</);
    assert.match(html, /id="addMedicalBtn"[^>]*>Medizin-Zugang anlegen</);
    assert.match(html, /id="medicalManagerPanel"/);
    assert.match(html, /id="scoutManagerPanel"/);
  }
  const rules = await read("firestore.rules");
  assert.match(rules, /function isScout\(\)/);
  assert.match(rules, /match \/scoutProfiles\/\{playerId\}/);
  assert.match(rules, /healthAccess', false\) == true/);
});
