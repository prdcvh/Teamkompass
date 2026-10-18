import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// SCRUM-137: Belastungsampel (Minuten x Anstrengung, Wochenvergleich, Wachstum, Verfuegbarkeit getrennt).
// Der Rechenblock steht in jeder App-Kopie zwischen zwei Markierungen und wird hier ausgeschnitten.
const copies = ["app.js", "outputs/team-manager/app.js", "outputs/u15/app.js", "outputs/u17/app.js"];
const TODAY = new Date(2026, 9, 16);

async function load(file) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const start = source.indexOf("// --- LOAD-ASSESSMENT START");
  const end = source.indexOf("// --- LOAD-ASSESSMENT END");
  assert.ok(start >= 0 && end > start, `${file}: Markierungen fehlen`);
  const factory = new Function(`
    const daysBetween = (a, b) => (b.getTime() - a.getTime()) / 86400000;
    const roundGrade = (v) => Math.round(v * 10) / 10;
    ${source.slice(start, end)}
    return { assessLoad, eventExertion, sessionLoadValue, sessionMinutes, exertionLabel, legacyIntensityForExertion };
  `);
  return { api: factory(), source };
}

const dayAgo = (n) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - n);
const session = (ago, minutes = 90, exertion = 5) => ({ date: dayAgo(ago), load: minutes * exertion, exertion });
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

for (const file of copies) {
  test(`${file}: Rueckkehr nach 6 Wochen Pause ergibt kein Anpassen (Wiedereinstieg-Hinweis)`, async () => {
    const { api } = await load(file);
    // Ganzer Kader trainiert nach 6 Wochen Pause wieder: erste Woche, dann zweite Woche.
    const week1 = api.assessLoad({ sessions: [session(2), session(0)], today: TODAY });
    assert.equal(week1.tier, "unauffaellig");
    assert.ok(week1.reasons.includes("Wiedereinstieg – langsam steigern"));
    const week2 = api.assessLoad({ sessions: [session(9), session(7), session(2), session(0)], today: TODAY });
    assert.notEqual(week2.tier, "anpassen");
    assert.ok(week2.reasons.includes("Wiedereinstieg – langsam steigern"));
    assert.equal(week2.weeksWithLoad, 2);
  });

  test(`${file}: zukuenftiger Termin zaehlt nicht`, async () => {
    const { api } = await load(file);
    const result = api.assessLoad({ sessions: [session(-1, 90, 10), session(-3, 90, 10), session(2)], today: TODAY });
    assert.equal(result.load, 450);
    assert.equal(result.recentEvents, 1);
    assert.ok(!result.reasons.some((text) => text.includes("harte")));
  });

  test(`${file}: echte Spitze nach 4 normalen Wochen ergibt einen Hinweis`, async () => {
    const { api } = await load(file);
    const normal = [session(8), session(10), session(15), session(17), session(22), session(24)];
    // 3 Wochen davor je 2 x 90 x 5 = 900, Schnitt 900.
    const calm = api.assessLoad({ sessions: [...normal, session(1), session(4)], today: TODAY });
    assert.equal(calm.baseline, 900);
    assert.equal(calm.tier, "unauffaellig");
    const mild = api.assessLoad({ sessions: [...normal, session(1), session(3), session(6)], today: TODAY }); // 1350 = 1,5-fach
    assert.equal(mild.tier, "beobachten");
    assert.ok(mild.reasons[0].startsWith("Belastungsspitze"));
    const big = api.assessLoad({ sessions: [...normal, session(1, 90, 6), session(3, 90, 6), session(6, 90, 6), session(5, 90, 6)], today: TODAY }); // 2160 = 2,4-fach
    assert.equal(big.tier, "anpassen");
    assert.match(big.reasons[0], /^Belastungsspitze \(2,4-fach/);
  });

  test(`${file}: Wochengrenzen ueberschneiden sich nicht (7 Tage + 3 Wochen davor)`, async () => {
    const { api } = await load(file);
    const result = api.assessLoad({ sessions: [session(6, 60, 5), session(7, 90, 5), session(27, 30, 10), session(28, 600, 10)], today: TODAY });
    assert.equal(result.load, 300); // Tag 6 = letzte Woche
    assert.equal(result.baseline, (450 + 300) / 3); // Tag 7 und Tag 27 zaehlen, Tag 28 nicht mehr
  });

  test(`${file}: Wachstum ab 0,6 cm/Monat ergibt einen Hinweis, ab 1,2 einen starken`, async () => {
    const { api } = await load(file);
    const growth = (delta) => api.assessLoad({ measurements: [{ date: "2026-09-01", height: 150 }, { date: "2026-10-01", height: 150 + delta }], today: TODAY });
    assert.equal(growth(0.5).tier, "unauffaellig");
    const hint = growth(0.7);
    assert.equal(hint.tier, "beobachten");
    assert.equal(hint.reasons[0], "Wachstumsschub (0,7 cm/Monat)");
    const strong = growth(1.3);
    assert.equal(strong.tier, "anpassen");
    assert.match(strong.reasons[0], /^Starker Wachstumsschub/);
  });

  test(`${file}: Wachstum zaehlt nur Messungen der letzten 90 Tage (SCRUM-157)`, async () => {
    const { api } = await load(file);
    const run = (dates) => api.assessLoad({ measurements: [{ date: dates[0], height: 150 }, { date: dates[1], height: 151.5 }], today: TODAY });
    // Schub vor einem Jahr: kein Hinweis mehr
    assert.equal(run(["2025-09-01", "2025-10-01"]).tier, "unauffaellig");
    // juengste Messung ok, aeltere ausserhalb des Fensters: keine zwei Messungen -> kein Hinweis
    assert.equal(run(["2026-06-01", "2026-10-01"]).tier, "unauffaellig");
    // beide im Fenster: Hinweis bleibt
    assert.equal(run(["2026-08-01", "2026-09-01"]).tier, "anpassen");
  });

  test(`${file}: Intensitaet 1/2/3 wird als 3/5/7 gelesen`, async () => {
    const { api } = await load(file);
    assert.deepEqual([1, 2, 3].map((intensity) => api.eventExertion({ intensity })), [3, 5, 7]);
    assert.equal(api.eventExertion({ intensity: 3, exertion: 8 }), 8);
    assert.equal(api.eventExertion({ intensity: 3, exertion: 0 }), 0);
    assert.equal(api.eventExertion({}), 5);
    assert.deepEqual([3, 5, 7].map(api.legacyIntensityForExertion), [1, 2, 3]);
    assert.equal(api.exertionLabel(7), "7 · sehr schwer");
  });

  test(`${file}: Minuten x Anstrengung (Dauer, gespielte Minuten, eingeschraenkt 60 %)`, async () => {
    const { api } = await load(file);
    const training = { type: "Training", exertion: 5 };
    assert.equal(api.sessionLoadValue(training, { attendance: "present" }), 450); // Standard 90 Minuten
    assert.equal(api.sessionLoadValue({ ...training, durationMinutes: 60 }, { attendance: "present" }), 300);
    assert.equal(api.sessionLoadValue(training, { attendance: "limited" }), 270);
    const game = { type: "Spiel", intensity: 3, matchDuration: 70 };
    assert.equal(api.sessionLoadValue(game, { attendance: "present", minutes: 30 }), 210);
    assert.equal(api.sessionLoadValue(game, { attendance: "present", minutes: "" }), 490);
    assert.equal(api.sessionLoadValue(game, { attendance: "limited", minutes: "" }), 294);
  });

  test(`${file}: Erholung - zwei Einheiten mit Anstrengung >= 7 innerhalb 48 Stunden`, async () => {
    const { api } = await load(file);
    const base = [session(8), session(10), session(15), session(17), session(22), session(24)];
    const hard = api.assessLoad({ sessions: [...base, session(3, 60, 7), session(1, 60, 7)], today: TODAY });
    assert.ok(hard.reasons.includes("Zwei sehr harte Einheiten innerhalb von 48 Stunden"));
    const apart = api.assessLoad({ sessions: [...base, session(5, 60, 7), session(1, 60, 7)], today: TODAY });
    assert.ok(!apart.reasons.includes("Zwei sehr harte Einheiten innerhalb von 48 Stunden"));
  });

  test(`${file}: Verfuegbarkeit ist getrennt von der Belastungsstufe`, async () => {
    const { api } = await load(file);
    const injured = api.assessLoad({ status: "Verletzt", today: TODAY });
    assert.equal(injured.tier, "unauffaellig");
    assert.equal(injured.availability.label, "Verletzt");
    assert.match(injured.availability.action, /Nicht einsetzen/);
    assert.equal(api.assessLoad({ status: "Angeschlagen", today: TODAY }).availability.label, "Angeschlagen");
    assert.equal(api.assessLoad({ status: "Fit", today: TODAY }).availability.label, "Fit");
    assert.equal(api.assessLoad({ status: "Fit", injuredNow: true, today: TODAY }).availability.label, "Verletzt");
  });

  test(`${file}: Rueckkehr nach Verletzung gibt einen Hinweis, Abwesenheit nur eine Info`, async () => {
    const { api } = await load(file);
    const back = api.assessLoad({ lastInjuryEnd: iso(dayAgo(5)), today: TODAY });
    assert.equal(back.tier, "beobachten");
    assert.ok(back.reasons.includes("Rückkehr nach Verletzung"));
    const vacation = api.assessLoad({ lastAbsenceEnd: iso(dayAgo(5)), today: TODAY });
    assert.equal(vacation.tier, "unauffaellig");
    assert.ok(vacation.reasons.includes("Kurz nach Abwesenheit (Wiedereinstieg)"));
  });

  test(`${file}: Anzeige ohne Prozentzahl, PDF und Startseite nutzen die neue Ampel`, async () => {
    const { source } = await load(file);
    assert.ok(!/risk\.percentage/.test(source));
    const pdf = source.slice(source.indexOf("function downloadProfilePdf"), source.indexOf("function profilePerformanceSvg"));
    assert.ok(pdf.includes("playerInjuryRisk(playerId)"));
    assert.ok(pdf.includes("Belastung letzte 7 Tage") && pdf.includes("Schnitt der 3 Wochen davor") && pdf.includes("Verfügbarkeit"));
    assert.ok(source.includes('playerInjuryRisk(player.id).tier === "anpassen"'));
  });
}
