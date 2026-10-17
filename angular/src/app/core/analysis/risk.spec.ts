import { type TeamEvent, exertionFromLegacyIntensity } from '../events/event';
import type { Player } from '../player/player';
import { type EventRating } from '../profile/profile';
import { BLANK_RATING, type Attendance } from '../ratings/rating';
import type { Absence } from '../records/absence';
import type { Measurement } from '../records/measurement';
import { injuryRisk, sessionLoad } from './risk';

/**
 * Belastungsampel (SCRUM-137): Minuten × Anstrengung, Wochenvergleich ohne Fehlalarm nach Pausen, Wachstum ab 0,6 cm/Monat,
 * Verfügbarkeit getrennt. Die gleichen Fälle prüft tests/load-assessment.test.mjs für die bisherigen App-Kopien.
 */
describe('risk (Belastungsampel)', () => {
  const NOW = new Date('2026-10-16T15:30:00');
  const player = (overrides: Partial<Player> = {}): Player => ({
    id: 'p', name: 'Test', positions: ['ST'], number: 9, birthdate: '2012-01-01', status: 'Fit', injuryUntil: '', injuredSince: '', consentStatus: 'granted', consentDate: '', ...overrides,
  });
  const dayAgo = (n: number): string => {
    const date = new Date(2026, 9, 16 - n);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  /** Ein Termin vor `ago` Tagen; Standard: Training, 90 Minuten, Anstrengung 5. */
  const entry = (ago: number, exertion = 5, minutes: number | null = 90, attendance: Attendance = 'present', type: 'Training' | 'Spiel' = 'Training'): EventRating => ({
    event: {
      id: `e${ago}-${exertion}`, type, title: 'T', date: dayAgo(ago), exertion, intensity: 2, location: '', trainingFocus: '', opponent: '',
      goalsFor: null, goalsAgainst: null, matchDuration: type === 'Spiel' ? (minutes ?? 90) : null, startTime: null, durationMinutes: type === 'Training' ? minutes : null, locationCoords: null, notes: '',
    } as TeamEvent,
    rating: { ...BLANK_RATING, attendance },
  });
  const absence = (overrides: Partial<Absence>): Absence => ({ id: 'a', kind: 'absence', label: 'Urlaub', detail: '', from: '', to: '', ...overrides });
  const measurement = (id: string, date: string, height: number): Measurement => ({ id, date, height, weight: 40 });
  const risk = (items: EventRating[], p: Player = player(), absences: Absence[] = [], measurements: Measurement[] = []) => injuryRisk(p, items, absences, measurements, NOW);
  /** 3 normale Wochen davor: je 2 Trainings à 90 Minuten × 5 = 900. */
  const normalWeeks = [8, 10, 15, 17, 22, 24].map((ago) => entry(ago));

  it('Rückkehr nach 6 Wochen Pause: kein Kader-weites „Anpassen“, nur der Hinweis „Wiedereinstieg“', () => {
    const week1 = risk([entry(2), entry(0)]);
    expect(week1.tier).toBe('unauffaellig');
    expect(week1.reasons).toContain('Wiedereinstieg – langsam steigern');
    const week2 = risk([entry(9), entry(7), entry(2), entry(0)]);
    expect(week2.tier).not.toBe('anpassen');
    expect(week2.weeksWithLoad).toBe(2);
    expect(week2.reasons).toContain('Wiedereinstieg – langsam steigern');
    // Ganzer Kader von 20 Spielern, alle nach derselben Pause: niemand steht auf „Anpassen“.
    const squad = Array.from({ length: 20 }, () => risk([entry(1), entry(3)]));
    expect(squad.filter((result) => result.tier === 'anpassen')).toHaveLength(0);
  });

  it('ein zukünftiger Termin zählt nicht, ein Termin von heute schon', () => {
    const base = [entry(5), entry(12)];
    const future = [entry(-1, 10), entry(-3, 10), entry(-10, 10)];
    expect(risk([...future, ...base])).toEqual(risk(base));
    expect(risk([...future, ...base]).recentEvents).toBe(2);
    expect(risk([entry(0), ...base]).recentEvents).toBe(3);
    // Zwei harte Termine in der Zukunft ergeben keinen Erholungs-Hinweis.
    expect(risk([entry(-1, 9), entry(-2, 9)]).reasons).toEqual([]);
  });

  it('echte Spitze nach 4 normalen Wochen ergibt einen Hinweis (ab dem 1,5-fachen)', () => {
    const calm = risk([...normalWeeks, entry(1), entry(4)]);
    expect(calm.baseline).toBe(900);
    expect(calm.tier).toBe('unauffaellig');
    const mild = risk([...normalWeeks, entry(1), entry(3), entry(6)]); // 1350 = 1,5-fach
    expect(mild.tier).toBe('beobachten');
    expect(mild.reasons[0]).toBe('Belastungsspitze (1,5-fach des Schnitts der 3 Wochen davor)');
    const big = risk([...normalWeeks, entry(1, 6), entry(3, 6), entry(5, 6), entry(6, 6)]); // 2160 = 2,4-fach
    expect(big.tier).toBe('anpassen');
    expect(big.load).toBe(2160);
  });

  it('Wochengrenzen: letzte 7 Tage und die 3 Wochen davor überschneiden sich nicht', () => {
    const result = risk([entry(6, 5, 60), entry(7, 5, 90), entry(27, 10, 30), entry(28, 10, 600)]);
    expect(result.load).toBe(300);
    expect(result.baseline).toBe((450 + 300) / 3);
  });

  it('Wachstum von 0,7 cm pro Monat ergibt einen Hinweis, ab 1,2 einen starken, 0,5 keinen', () => {
    const growth = (height: number) => risk([], player(), [], [measurement('m1', '2026-09-01', 150), measurement('m2', '2026-10-01', height)]);
    expect(growth(150.5).tier).toBe('unauffaellig');
    const hint = growth(150.7);
    expect(hint.tier).toBe('beobachten');
    expect(hint.reasons).toEqual(['Wachstumsschub (0,7 cm/Monat)']);
    const strong = growth(151.3);
    expect(strong.tier).toBe('anpassen');
    expect(strong.reasons[0]).toBe('Starker Wachstumsschub (1,3 cm/Monat)');
  });

  it('Intensität 1/2/3 wird als Anstrengung 3/5/7 gelesen und fließt so in die Belastung ein', () => {
    expect([1, 2, 3].map(exertionFromLegacyIntensity)).toEqual([3, 5, 7]);
    const event = entry(2).event;
    const legacy = (intensity: number) => ({ ...event, exertion: exertionFromLegacyIntensity(intensity) }) as TeamEvent;
    const rating = entry(2).rating!;
    expect([1, 2, 3].map((intensity) => sessionLoad(legacy(intensity), rating))).toEqual([270, 450, 630]);
  });

  it('Belastung = Minuten × Anstrengung: Dauer, gespielte Minuten, „eingeschränkt“ ohne Minuten 60 %', () => {
    const rate = (item: EventRating, patch: Partial<EventRating['rating'] & object> = {}) => sessionLoad(item.event, { ...item.rating!, ...patch });
    expect(rate(entry(2))).toBe(450);
    expect(rate(entry(2, 5, 60))).toBe(300);
    expect(rate(entry(2, 5, null))).toBe(450); // keine Dauer eingetragen: Standard 90
    expect(rate(entry(2), { attendance: 'limited' })).toBe(270);
    const game = entry(2, 7, 70, 'present', 'Spiel');
    expect(rate(game, { minutes: 30 })).toBe(210);
    expect(rate(game)).toBe(490);
    expect(rate(game, { attendance: 'limited' })).toBe(294);
  });

  it('Erholung: zwei Einheiten mit Anstrengung ≥ 7 innerhalb von 48 Stunden ergeben einen Hinweis', () => {
    const hint = 'Zwei sehr harte Einheiten innerhalb von 48 Stunden';
    expect(risk([...normalWeeks, entry(3, 7, 60), entry(1, 7, 60)]).reasons).toContain(hint);
    expect(risk([...normalWeeks, entry(5, 7, 60), entry(1, 7, 60)]).reasons).not.toContain(hint);
    expect(risk([...normalWeeks, entry(3, 6, 60), entry(1, 7, 60)]).reasons).not.toContain(hint);
  });

  it('Verfügbarkeit ist von der Belastungsstufe getrennt; „Nicht einsetzen“ kommt nur von dort', () => {
    const injured = risk([], player({ status: 'Verletzt', injuryUntil: '2026-10-30' }));
    expect(injured.tier).toBe('unauffaellig');
    expect(injured.availability).toMatchObject({ key: 'verletzt', label: 'Verletzt' });
    expect(injured.availability.action).toContain('Nicht einsetzen');
    expect(risk([], player({ status: 'Angeschlagen' })).availability.key).toBe('angeschlagen');
    expect(risk([]).availability).toMatchObject({ key: 'fit', action: '' });
    const running = risk([], player(), [absence({ kind: 'injury', label: 'Verletzung', from: '2026-10-01', to: '' })]);
    expect(running.availability.key).toBe('verletzt');
    expect(running.tier).toBe('unauffaellig');
  });

  it('Rückkehr nach Verletzung ergibt einen Hinweis, kurz nach Abwesenheit nur eine Info', () => {
    const back = risk([], player(), [absence({ kind: 'injury', label: 'Verletzung', from: '2026-09-20', to: dayAgo(5) })]);
    expect(back.tier).toBe('beobachten');
    expect(back.reasons).toContain('Rückkehr nach Verletzung');
    const vacation = risk([], player(), [absence({ from: '2026-10-01', to: dayAgo(5) })]);
    expect(vacation.tier).toBe('unauffaellig');
    expect(vacation.reasons).toContain('Kurz nach Abwesenheit (Wiedereinstieg)');
  });

  it('ohne Daten unauffällig mit Hinweistext, ohne Prozentzahl', () => {
    const result = risk([]);
    expect(result).toMatchObject({ tier: 'unauffaellig', level: 'Unauffällig', load: 0, baseline: 0, recentEvents: 0, reason: 'Keine auffälligen Belastungsfaktoren' });
    expect('percentage' in result).toBe(false);
  });
});
