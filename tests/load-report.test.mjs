import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-139: Belastungsprotokoll (PDF). Die Rechen- und Berichtsbloecke stehen in jeder App-Kopie zwischen
// Markierungen und werden hier ausgeschnitten (wie in tests/load-assessment.test.mjs).
const copies = ["app.js", "outputs/team-manager/app.js", "outputs/u15/app.js", "outputs/u17/app.js"];
const TODAY = "2026-10-20";

function slice(source, startMarker, endMarker, file) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0 && end > start, `${file}: Markierungen ${startMarker} fehlen`);
  return source.slice(start, end);
}

async function load(file) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const escape = source.match(/function escapeHtml\(value\) \{[\s\S]*?\n\}/);
  assert.ok(escape, `${file}: escapeHtml fehlt`);
  const factory = new Function(`
    const daysBetween = (a, b) => (b.getTime() - a.getTime()) / 86400000;
    const roundGrade = (v) => Math.round(v * 10) / 10;
    ${escape[0]}
    ${slice(source, "// --- LOAD-ASSESSMENT START", "// --- LOAD-ASSESSMENT END", file)}
    ${slice(source, "// --- LOAD-REPORT START", "// --- LOAD-REPORT END", file)}
    return { buildLoadReport, loadReportHtml, loadReportRange };
  `);
  return { api: factory(), source };
}

const addDays = (iso, days) => {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const ago = (days) => addDays(TODAY, -days);

const PLAYER = { name: "Max Muster", number: 7, status: "Fit", injuryUntil: "" };
const training = (id, daysAgo, attendance = "present", extra = {}) => ({
  id, type: "Training", title: `Training ${id}`, date: ago(daysAgo), durationMinutes: 90, exertion: 5,
  ratings: { p1: { attendance, note: attendance === "absent" ? "Verletzt: Bänderriss" : "", ...extra } }
});

function build(api, overrides = {}) {
  const range = api.loadReportRange({ period: overrides.period || "4", from: overrides.from, to: overrides.to, today: TODAY });
  return api.buildLoadReport({
    player: PLAYER, playerId: "p1", events: [], absences: [], measurements: [], includeHealth: true,
    from: range.from, to: range.to, today: TODAY, teamName: "Testteam", createdBy: "Trainer", ...overrides
  });
}

test("alle App-Kopien enthalten denselben Berichtsblock", async () => {
  const blocks = await Promise.all(copies.map(async (file) => {
    const { source } = await load(file);
    return slice(source, "// --- LOAD-REPORT START", "// --- LOAD-REPORT END", file);
  }));
  assert.equal(new Set(blocks).size, 1);
});

for (const file of copies) {
  test(`${file}: Zeitraum 4/8/12 Wochen und eigener Zeitraum`, async () => {
    const { api } = await load(file);
    assert.deepEqual(api.loadReportRange({ period: "4", today: TODAY }), { from: ago(27), to: TODAY });
    assert.deepEqual(api.loadReportRange({ period: "8", today: TODAY }), { from: ago(55), to: TODAY });
    assert.deepEqual(api.loadReportRange({ period: "12", today: TODAY }), { from: ago(83), to: TODAY });
    assert.deepEqual(api.loadReportRange({ period: "custom", from: "2026-09-01", to: "2026-09-30", today: TODAY }), { from: "2026-09-01", to: "2026-09-30" });
    // Ende in der Zukunft wird auf heute gekappt; falsche Angaben ergeben eine Meldung statt eines Berichts.
    assert.deepEqual(api.loadReportRange({ period: "custom", from: "2026-10-01", to: "2026-12-01", today: TODAY }), { from: "2026-10-01", to: TODAY });
    assert.ok(api.loadReportRange({ period: "custom", from: "", to: TODAY, today: TODAY }).error);
    assert.ok(api.loadReportRange({ period: "custom", from: "2026-10-10", to: "2026-10-01", today: TODAY }).error);
    assert.ok(api.loadReportRange({ period: "custom", from: "2026-11-01", to: "2026-11-05", today: TODAY }).error);
    assert.ok(api.loadReportRange({ period: "custom", from: "2024-01-01", to: TODAY, today: TODAY }).error);
  });

  test(`${file}: Datenzusammenstellung je Zeitraum (Termine, Wochen, Summen)`, async () => {
    const { api } = await load(file);
    const events = [
      training("e1", 1),
      training("e2", 3, "limited"),
      { id: "e3", type: "Spiel", title: "Spiel gegen A", date: ago(5), matchDuration: 70, exertion: 8, ratings: { p1: { attendance: "present", minutes: 50 } } },
      training("e4", 10, "absent"),
      training("e5", 40),
      training("e6", -2), // Zukunft: zaehlt nie
      { id: "e7", type: "Training", title: "ohne Eintrag", date: ago(2), ratings: { p2: { attendance: "present" } } }
    ];
    const four = build(api, { events });
    assert.deepEqual(four.rows.map((row) => row.date), [ago(10), ago(5), ago(3), ago(1)]);
    assert.equal(four.rows[0].attendance, "gefehlt");
    assert.equal(four.rows[0].load, null);
    assert.equal(four.rows[1].type, "Spiel");
    assert.equal(four.rows[1].minutes, 50);
    assert.equal(four.rows[1].load, 400);
    assert.equal(four.rows[2].attendance, "eingeschränkt");
    assert.equal(four.rows[2].load, 270);
    assert.equal(four.totals.sessions, 3);
    assert.equal(four.totals.load, 450 + 270 + 400);
    assert.equal(four.weeks.length, 4);
    assert.equal(four.weeks.at(-1).to, TODAY);
    assert.equal(four.weeks.at(-1).load, 450 + 270 + 400);
    assert.equal(four.weeks.reduce((sum, week) => sum + week.load, 0), four.totals.load);
    assert.equal(four.assessment.load, 1120);

    const eight = build(api, { events, period: "8" });
    assert.equal(eight.rows.length, 5);
    assert.equal(eight.weeks.length, 8);
    assert.equal(eight.totals.load, four.totals.load + 450);

    // Eigener Zeitraum in der Vergangenheit: Stand und Stufe zum Ende des Zeitraums.
    const custom = build(api, { events, period: "custom", from: ago(45), to: ago(30) });
    assert.deepEqual(custom.rows.map((row) => row.date), [ago(40)]);
    assert.equal(custom.to, ago(30));
    assert.equal(custom.assessment.load, 0);
    assert.equal(custom.weeks.length, 3);
    assert.equal(custom.weeks[0].from, ago(45));
  });

  test(`${file}: leerer Zeitraum ergibt einen Bericht ohne Fehler`, async () => {
    const { api } = await load(file);
    const report = build(api);
    assert.equal(report.rows.length, 0);
    assert.equal(report.totals.sessions, 0);
    assert.equal(report.weeks.length, 4);
    assert.ok(report.weeks.every((week) => week.load === 0));
    assert.equal(report.assessment.level, "Unauffällig");
    assert.equal(report.wellness, null);
    assert.equal(report.hasSelfExertion, false);
    const html = api.loadReportHtml(report);
    assert.match(html, /Keine Termine im Zeitraum/);
    assert.match(html, /Keine Belastung im Zeitraum eingetragen/);
    assert.match(html, /Keine Messungen im Zeitraum/);
    assert.doesNotMatch(html, /undefined|NaN/);
    assert.doesNotMatch(html, /Befinden \(Selbsteinsch/);
    assert.doesNotMatch(html, /Eigene Angabe/);
  });

  test(`${file}: ohne Haekchen keine Verletzungs-, Abwesenheits- oder Befindensdaten`, async () => {
    const { api } = await load(file);
    const injured = { ...PLAYER, status: "Verletzt", injuryUntil: ago(-5) };
    const absences = [
      { id: "a1", kind: "injury", label: "Verletzung", detail: "Bänderriss Sprunggelenk", from: ago(20), to: ago(8) },
      { id: "a2", kind: "other", label: "Klassenfahrt", detail: "", from: ago(4), to: ago(2) }
    ];
    const events = [
      training("e1", 12, "absent"),
      training("e2", 3, "absent"),
      training("e3", 1, "present", { wellness: { fatigue: 4, sleep: 2, soreness: 3, stress: 1 }, selfExertion: 6 })
    ];
    const withHealth = build(api, { player: injured, events, absences, includeHealth: true });
    const withHtml = api.loadReportHtml(withHealth);
    assert.match(withHtml, /Bänderriss Sprunggelenk/);
    assert.match(withHtml, /Klassenfahrt/);
    assert.match(withHtml, /Verletzt/);
    assert.ok(withHealth.wellness);
    assert.equal(withHealth.assessment.availability.label, "Verletzt");
    // Rueckkehr nach einer beendeten Verletzung (ohne laufenden Status) fliesst in die Stufe ein.
    const returned = build(api, { events, absences, includeHealth: true });
    assert.ok(returned.assessment.reasons.includes("Rückkehr nach Verletzung"));
    assert.ok(!build(api, { events, absences, includeHealth: false }).assessment.reasons.includes("Rückkehr nach Verletzung"));
    assert.match(withHtml, /Gesundheitsdaten/);

    const without = build(api, { player: injured, events, absences, includeHealth: false });
    const html = api.loadReportHtml(without);
    for (const forbidden of ["Bänderriss", "Klassenfahrt", "Verletzt", "Verletzung:", "Rückkehr nach Verletzung", "Müdigkeit", "Muskelkater", "Verfügbarkeit</span>", "Gesundheitsdaten eines"]) {
      assert.ok(!html.includes(forbidden), `enthaelt ohne Haekchen: ${forbidden}`);
    }
    assert.equal(without.assessment.availability, null);
    assert.equal(without.wellness, null);
    assert.deepEqual(without.markers.returns, []);
    assert.ok(without.rows.every((row) => row.reason === "" && row.wellness === null));
    assert.ok(!without.assessment.reasons.some((reason) => /Verletzung|Abwesenheit/.test(reason)));
    // Die Teilnahme "gefehlt" selbst bleibt (keine Begruendung), ebenso die eigene Anstrengungsangabe.
    assert.equal(without.rows.filter((row) => row.attendance === "gefehlt").length, 2);
    assert.equal(without.rows.at(-1).selfExertion, 6);
  });

  test(`${file}: Risikomarker Wachstum und Erholung`, async () => {
    const { api } = await load(file);
    const measurements = [
      { date: ago(70), height: 160 },
      { date: ago(10), height: 162.4 }
    ];
    const hard = (id, daysAgo) => ({ ...training(id, daysAgo), exertion: 8 });
    const report = build(api, { measurements, events: [hard("h1", 6), hard("h2", 5)] });
    assert.equal(report.markers.growth.length, 1);
    assert.equal(report.markers.growth[0].perMonth, 1.2);
    assert.match(api.loadReportHtml(report), /starker Wachstumsschub/);
    assert.equal(report.markers.recovery.length, 1);
    assert.match(report.markers.recovery[0], /48 Stunden/);
  });

  test(`${file}: alle Nutzertexte werden maskiert`, async () => {
    const { api } = await load(file);
    const evil = "<img src=x onerror=alert(1)>";
    const report = build(api, {
      player: { ...PLAYER, name: evil },
      teamName: evil,
      createdBy: evil,
      events: [{ ...training("e1", 2, "absent"), title: evil }],
      absences: [{ id: "a1", kind: "injury", label: evil, detail: evil, from: ago(3), to: ago(1) }]
    });
    const html = api.loadReportHtml(report, { logoUrl: "https://example.org/logo.png\"><script>x</script>" });
    assert.ok(!html.includes("<img src=x"), "ungeschuetzter Name/Titel");
    assert.ok(!html.includes("<script>"), "ungeschuetzte Logo-Adresse");
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  });
}

test("Belastungsprotokoll: nur Trainer fuer alle, Spieler nur fuer sich selbst (Live-Kopien)", async () => {
  for (const team of ["team-manager", "u15", "u17"]) {
    const source = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
    const body = source.match(/function canCreateLoadReport\(playerId\) \{[\s\S]*?\n\}/)[0];
    const check = (role, ownId, playerId) => new Function("currentRole", "currentPlayerId", `${body}; return canCreateLoadReport(${JSON.stringify(playerId)});`)(role, ownId);
    assert.equal(check(null, null, "p1"), true, `${team}: lokaler Modus`);
    assert.equal(check("trainer", null, "p1"), true, `${team}: Trainer`);
    assert.equal(check("player", "p1", "p1"), true, `${team}: eigenes Protokoll`);
    assert.equal(check("player", "p1", "p2"), false, `${team}: fremdes Protokoll`);
    assert.equal(check("player", null, "p1"), false, `${team}: Spieler ohne Verknuepfung`);
    for (const role of ["parent", "medical", "scout", "physio", "unbekannt"]) assert.equal(check(role, "p1", "p1"), false, `${team}: Rolle ${role}`);
  }
});
