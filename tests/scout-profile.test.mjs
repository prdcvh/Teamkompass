// SCRUM-170: Scouts sehen nur die bereinigte Scout-Sicht (teams/{teamId}/scoutProfiles/{playerId}).
// Diese Tests pruefen die reinen Funktionen, mit denen der Trainer-Client sie baut, in jeder App-Kopie:
// keine Verletzungen, Abwesenheitsgruende, Messwerte, BMI, Status, Rueckmeldungen oder Notizen.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const teams = ["team-manager", "u15", "u17"];
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function loadScoutApi(team) {
  const source = await read(`outputs/${team}/app.js`);
  const block = source.split("// SCOUT-SICHT START")[1].split("\n").slice(1).join("\n").split("// SCOUT-SICHT ENDE")[0];
  return new Function(`${block}\nreturn { buildScoutProfiles, scoutProfileChanges, scoutCacheFromProfiles, scoutStableJson };`)();
}

// Felder, die das Dokument bzw. ein Termin-Eintrag haben darf (gleiche Liste wie hasOnly in firestore.rules).
const PROFILE_KEYS = ["birthdate", "entries", "name", "number", "playerId", "positions", "version"];
const ENTRY_KEYS = ["assists", "attendance", "comprehension", "date", "effort", "eventId", "goals", "goalsAgainst", "goalsFor", "matchDuration", "minutes", "opponent", "tactics", "technique", "title", "type"];

const players = () => [
  { id: "p1", name: "Mika", number: 7, positions: ["ZM", "OM"], birthdate: "2012-03-14", status: "Verletzt", injuryUntil: "2026-12-01", injuredSince: "2026-10-01", consentStatus: "granted", consentDate: "2026-01-01" },
  { id: "p2", name: "Widerruf", number: 9, positions: ["ST"], birthdate: "2012-05-05", status: "Fit", consentStatus: "revoked" },
  { id: "p3", name: "Offen", number: 4, positions: ["IV"], birthdate: "2013-01-01", status: "Angeschlagen", consentStatus: "" }
];
const events = () => [
  {
    id: "e2", type: "Spiel", title: "Liga", date: "2026-10-12", opponent: "FC Test", goalsFor: 2, goalsAgainst: 1, matchDuration: 70, notes: "Mika hatte Knieschmerzen", location: "Heimplatz", exertion: 8,
    ratings: {
      p1: { attendance: "limited", effort: 2, technique: 3, tactics: 2, comprehension: 1, minutes: 35, goals: 1, assists: "", note: "Belastung dosiert wegen Knie", grade: 2.2 },
      p3: { attendance: "absent", effort: "", technique: "", tactics: "", comprehension: "", minutes: "", goals: "", assists: "", note: "Verletzt", autoAbsence: true }
    },
    privateNotes: { p1: "intern: Knie beobachten" }
  },
  {
    id: "e1", type: "Training", title: "Training", date: "2026-10-01", notes: "Knie-Reha", trainingFocus: "Pressing",
    ratings: {
      p1: { attendance: "present", effort: 1, technique: 2, tactics: 2, comprehension: 2, minutes: "", goals: "", assists: "", note: "Stark" },
      p2: { attendance: "present", effort: 3, technique: 3, tactics: 3, comprehension: 3, note: "x" },
      p3: { attendance: "excluded", effort: "", technique: "", tactics: "", comprehension: "", note: "Urlaub" }
    }
  },
  { id: "e3", type: "Training", title: "Zukunft", date: "2026-11-01", ratings: { p1: { attendance: "open", effort: "", technique: "", tactics: "", comprehension: "", note: "" } } }
];

for (const team of teams) {
  test(`${team}: Scout-Sicht enthält keine Gesundheitsdaten, Gründe oder Notizen (SCRUM-170)`, async () => {
    const { buildScoutProfiles } = await loadScoutApi(team);
    const profiles = buildScoutProfiles(players(), events());
    const text = JSON.stringify([...profiles.values()]);
    for (const forbidden of ["Verletzt", "Knie", "intern", "Urlaub", "Belastung", "Stark", "injury", "injured", "status", "consent", "Angeschlagen", "Heimplatz", "Pressing", "note", "autoAbsence", "limited", "exertion"]) {
      assert.ok(!text.includes(forbidden), `${team}: Scout-Sicht enthält „${forbidden}“`);
    }
    for (const profile of profiles.values()) {
      assert.deepEqual(Object.keys(profile).sort(), PROFILE_KEYS);
      for (const entry of profile.entries) assert.ok(Object.keys(entry).every((key) => ENTRY_KEYS.includes(key)), `${team}: unerwartetes Feld in ${JSON.stringify(entry)}`);
    }
  });

  test(`${team}: Scout-Sicht enthält Noten, Statistik und Anwesenheit ohne Grund; Widerruf und offene Termine fehlen`, async () => {
    const { buildScoutProfiles } = await loadScoutApi(team);
    const profiles = buildScoutProfiles(players(), events());
    assert.deepEqual([...profiles.keys()], ["p1", "p3"], `${team}: Spieler mit widerrufener Einwilligung darf nicht erscheinen`);
    const p1 = profiles.get("p1");
    assert.equal(p1.name, "Mika");
    assert.equal(p1.number, 7);
    assert.deepEqual(p1.positions, ["ZM", "OM"]);
    assert.equal(p1.birthdate, "2012-03-14");
    assert.equal(p1.version, 1);
    assert.deepEqual(p1.entries.map((entry) => entry.eventId), ["e1", "e2"], `${team}: aelteste zuerst, offener Zukunftstermin fehlt`);
    assert.deepEqual(p1.entries[0], { eventId: "e1", date: "2026-10-01", type: "Training", title: "Training", attendance: "present", effort: 1, technique: 2, tactics: 2, comprehension: 2, minutes: null, goals: null, assists: null });
    assert.deepEqual(p1.entries[1], { eventId: "e2", date: "2026-10-12", type: "Spiel", title: "Liga", attendance: "present", opponent: "FC Test", goalsFor: 2, goalsAgainst: 1, matchDuration: 70, effort: 2, technique: 3, tactics: 2, comprehension: 1, minutes: 35, goals: 1, assists: null });
    const p3 = profiles.get("p3");
    assert.deepEqual(p3.entries, [
      { eventId: "e1", date: "2026-10-01", type: "Training", title: "Training", attendance: "excluded" },
      { eventId: "e2", date: "2026-10-12", type: "Spiel", title: "Liga", attendance: "absent", opponent: "FC Test", goalsFor: 2, goalsAgainst: 1, matchDuration: 70 }
    ]);
  });

  test(`${team}: Abgleich schreibt nur Geändertes und löscht Überzähliges (Reihenfolge der Felder egal)`, async () => {
    const { buildScoutProfiles, scoutProfileChanges } = await loadScoutApi(team);
    const wanted = buildScoutProfiles(players(), events());
    const reordered = (doc) => Object.fromEntries(Object.entries(doc).reverse().map(([key, value]) => [key, key === "entries" ? value.map((entry) => Object.fromEntries(Object.entries(entry).reverse())) : value]));
    const published = new Map([["p1", reordered(wanted.get("p1"))], ["p3", { ...wanted.get("p3"), name: "Alt" }], ["p2", { playerId: "p2" }], ["weg", { playerId: "weg" }]]);
    const changes = scoutProfileChanges(published, wanted);
    assert.deepEqual(changes.map((change) => `${change.type}:${change.id}`).sort(), ["delete:p2", "delete:weg", "set:p3"]);
    // Kein Scout-Zugang mehr: alles loeschen.
    assert.deepEqual(scoutProfileChanges(published, new Map()).map((change) => change.type), ["delete", "delete", "delete", "delete"]);
    assert.deepEqual(scoutProfileChanges(new Map(), new Map()), []);
  });

  test(`${team}: Scout-Ansicht baut aus der Scout-Sicht Profile mit denselben Noten und ohne Notizen`, async () => {
    const { buildScoutProfiles, scoutCacheFromProfiles } = await loadScoutApi(team);
    const docs = [...buildScoutProfiles(players(), events()).values()];
    const cache = scoutCacheFromProfiles(docs);
    assert.deepEqual(cache.players.map((player) => player.id), ["p1", "p3"]);
    assert.equal(cache.players[0].status, "");
    assert.deepEqual(cache.events.map((event) => event.id).sort(), ["e1", "e2"]);
    const game = cache.events.find((event) => event.id === "e2");
    assert.deepEqual({ goalsFor: game.goalsFor, goalsAgainst: game.goalsAgainst, matchDuration: game.matchDuration, opponent: game.opponent }, { goalsFor: 2, goalsAgainst: 1, matchDuration: 70, opponent: "FC Test" });
    assert.equal(game.notes, undefined);
    assert.deepEqual(cache.ratings.e2.p1, { attendance: "present", effort: 2, technique: 3, tactics: 2, comprehension: 1, minutes: 35, goals: 1, assists: "", note: "" });
    assert.deepEqual(cache.ratings.e2.p3, { attendance: "absent", effort: "", technique: "", tactics: "", comprehension: "", minutes: "", goals: "", assists: "", note: "" });
    // Unbekannte Anwesenheit und fremde Felder in einem (manipulierten) Dokument werden nicht uebernommen.
    const odd = scoutCacheFromProfiles([{ playerId: "x", name: "X", entries: [{ eventId: "e9", attendance: "limited", note: "geheim", reason: "Verletzt" }] }]);
    assert.equal(odd.ratings.e9.x.attendance, "present");
    assert.equal(odd.ratings.e9.x.note, "");
    assert.equal(JSON.stringify(odd).includes("Verletzt"), false);
  });
}

test("Scouts abonnieren nur die Scout-Sicht; Medizin wie bisher Spieler, Abwesenheiten und Messwerte (SCRUM-170)", async () => {
  for (const team of teams) {
    const app = await read(`outputs/${team}/app.js`);
    const sync = app.slice(app.indexOf("function startCloudSync()"), app.indexOf("// ratings/developmentPlans liegen als Unter-Collections"));
    const scoutBranch = sync.slice(sync.indexOf('if (currentRole === "scout") {'), sync.indexOf("// Event-Metadaten"));
    assert.match(scoutBranch, /teamCollection\("scoutProfiles"\)/, `${team}: Scout liest die Scout-Sicht nicht`);
    assert.match(scoutBranch, /return;\s*\}\s*$/, `${team}: Scout-Zweig endet nicht vor den uebrigen Abos`);
    assert.doesNotMatch(scoutBranch, /teamCollection\("(players|events)"/, `${team}: Scout liest Rohdaten`);
    assert.match(sync, /\} else if \(currentRole === "physio"\) \{[\s\S]*?syncAbsenceListeners[\s\S]*?syncMeasurementListeners/, `${team}: Medizin laedt Abwesenheiten/Messwerte nicht mehr`);
    assert.doesNotMatch(app, /currentRole === "medical"/, `${team}: alte Rollenkennung wird noch direkt geprueft`);
    assert.match(app, /currentRole = normalizeRole\(member\.role\);/, `${team}: bisherige "medical"-Konten werden nicht zu Scouts`);
    assert.match(app, /function normalizeRole\(role\) \{\s*return role === "medical" \? "scout" : role;\s*\}/);
    // Export und Profil-PDF (mit Belastung/Verfuegbarkeit) sind fuer Scouts gesperrt.
    assert.match(app, /function exportData\(\) \{\s*if \(currentRole === "scout"\) return;/);
    assert.match(app, /function downloadProfilePdf\(\) \{[\s\S]{0,120}if \(currentRole === "scout"\) return;/);
  }
});

test("Scout- und Medizin-Zugänge werden getrennt angelegt und verwaltet (SCRUM-170)", async () => {
  for (const team of teams) {
    const html = await read(`outputs/${team}/index.html`);
    for (const id of ["scoutManagerList", "physioManagerList", "addScoutBtn", "addPhysioBtn"]) assert.match(html, new RegExp(`id="${id}"`), `${team}: ${id} fehlt`);
    assert.match(html, /data-action="add-physio"[^>]*>Medizin-Zugang anlegen</);
    assert.match(html, /data-action="add-scout"[^>]*>Scout-Zugang anlegen</);
    const app = await read(`outputs/${team}/app.js`);
    assert.match(app, /async function createScoutAccount\(\) \{\s*return createStaffAccount\("scout"\);/);
    assert.match(app, /async function createPhysioAccount\(\) \{\s*return createStaffAccount\("physio"\);/);
    assert.doesNotMatch(app, /createStaffAccount\("medical"\)/, `${team}: legt noch alte "medical"-Konten an`);
    const css = await read(`outputs/${team}/base.css`);
    for (const selector of ["#profileAvailabilityPanel", "#absencePanel", "#measurementPanel", "#developmentPanel", "#exportBtn", "#profilePdfBtn"]) {
      assert.ok(css.includes(`body.role-scout ${selector}`), `${team}: ${selector} ist fuer Scouts nicht ausgeblendet`);
    }
    for (const id of ["profileAvailabilityPanel", "absencePanel", "measurementPanel", "developmentPanel"]) assert.match(html, new RegExp(`id="${id}"`), `${team}: ${id} fehlt im HTML`);
  }
  const rules = await read("firestore.rules");
  assert.match(rules, /function isScout\(\) \{\s*return isTeamMember\(\) && memberDoc\(\)\.data\.role in \["scout", "medical"\];/);
  assert.match(rules, /isTrainer\(\) && request\.resource\.data\.role in \["trainer", "scout", "physio"\]/);
});
