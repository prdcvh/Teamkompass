import { type TeamEvent } from './event';
import { type Player } from './player';
import { type EventRating } from './profile';
import { BLANK_RATING, type Attendance } from './rating';
import { type Absence, type Measurement } from './records';
import { injuryRisk } from './risk';

/**
 * Die erwarteten Werte stammen aus der echten Funktion `playerInjuryRisk` der bisherigen App (outputs/team-manager/app.js),
 * ausgeführt auf denselben Daten mit festem „heute“ (10.10.2026). Das Ergebnis ist unabhängig von der Zeitzone.
 * Die Texte weichen nur im Dezimaltrenner ab (Komma statt Punkt).
 */
describe('risk (Belastungsindikator, Parität zur bisherigen App)', () => {
  const NOW = new Date('2026-10-10T15:30:00');
  const player = (overrides: Partial<Player> = {}): Player => ({
    id: 'p', name: 'Test', positions: ['ST'], number: 9, birthdate: '2012-01-01', status: 'Fit', injuryUntil: '', consentStatus: 'granted', consentDate: '', ...overrides,
  });
  const entry = (date: string, type: 'Training' | 'Spiel', intensity: number, attendance: Attendance, effort: number, minutes: number | null = null): EventRating => ({
    event: { id: date, type, title: date, date, intensity, location: '', trainingFocus: '', opponent: '', goalsFor: null, goalsAgainst: null, matchDuration: type === 'Spiel' ? 90 : null, notes: '' } as TeamEvent,
    rating: { ...BLANK_RATING, attendance, effort, minutes },
  });
  const absence = (overrides: Partial<Absence>): Absence => ({ id: 'a', kind: 'absence', label: 'Urlaub', detail: '', from: '', to: '', ...overrides });
  const measurement = (id: string, date: string, height: number, weight: number): Measurement => ({ id, date, height, weight });
  const risk = (p: Player, items: EventRating[], absences: Absence[] = [], measurements: Measurement[] = []) => injuryRisk(p, items, absences, measurements, NOW);
  const newestFirst = (items: EventRating[]) => [...items].sort((a, b) => b.event.date.localeCompare(a.event.date));

  const cases: { name: string; result: ReturnType<typeof risk>; expected: [number, string, number, number, string] }[] = [
    { name: 'ruhig (ein altes Training)', result: risk(player(), [entry('2026-09-20', 'Training', 2, 'present', 2)]), expected: [10, 'unauffaellig', 0, 1, 'Deutlich reduzierte Belastung'] },
    {
      name: 'Belastungsspitze mit nachlassendem Einsatz',
      result: risk(player(), newestFirst([
        entry('2026-10-09', 'Spiel', 3, 'present', 3, 90), entry('2026-10-08', 'Training', 3, 'present', 4), entry('2026-10-06', 'Training', 3, 'present', 4),
        entry('2026-09-20', 'Training', 1, 'present', 1), entry('2026-09-15', 'Training', 1, 'present', 1),
      ])),
      expected: [72, 'reduzieren', 9, 5, 'Akute Belastungsspitze (ACWR 3,3) · Nachlassender Einsatz in Folge'],
    },
    { name: 'verletzt', result: risk(player({ status: 'Verletzt', injuryUntil: '2026-10-20' }), [entry('2026-10-01', 'Training', 2, 'present', 2)]), expected: [85, 'aussetzen', 0, 1, 'Aktuell verletzt · Deutlich reduzierte Belastung'] },
    { name: 'angeschlagen', result: risk(player({ status: 'Angeschlagen' }), [entry('2026-10-05', 'Training', 2, 'limited', 3)]), expected: [90, 'aussetzen', 1.2, 1, 'Akute Belastungsspitze (ACWR 4) · Angeschlagen'] },
    {
      name: 'Rückkehr nach Verletzung',
      result: risk(player(), [entry('2026-10-09', 'Training', 2, 'present', 2)], [absence({ kind: 'injury', label: 'Verletzung', detail: 'Zerrung', from: '2026-09-20', to: '2026-10-03' })]),
      expected: [60, 'reduzieren', 2, 1, 'Akute Belastungsspitze (ACWR 4) · Rückkehr nach Verletzung'],
    },
    {
      name: 'kurz nach Urlaub',
      result: risk(player(), [entry('2026-10-09', 'Training', 2, 'present', 2)], [absence({ from: '2026-09-28', to: '2026-10-05' })]),
      expected: [53, 'anpassen', 2, 1, 'Akute Belastungsspitze (ACWR 4) · Kurz nach Abwesenheit (Wiedereinstieg)'],
    },
    {
      name: 'Wachstumsschub',
      result: risk(player(), [entry('2026-10-08', 'Training', 2, 'present', 2)], [], [measurement('m1', '2026-07-01', 150, 40), measurement('m2', '2026-10-01', 155, 43)]),
      expected: [55, 'reduzieren', 2, 1, 'Akute Belastungsspitze (ACWR 4) · Wachstumsschub (1,6 cm/Monat)'],
    },
    {
      name: 'nachlassender Einsatz',
      result: risk(player(), newestFirst([
        entry('2026-10-09', 'Training', 2, 'present', 5), entry('2026-10-07', 'Training', 2, 'present', 5), entry('2026-10-05', 'Training', 2, 'present', 2),
        entry('2026-10-03', 'Training', 2, 'present', 2), entry('2026-10-01', 'Training', 2, 'present', 1),
      ])),
      expected: [66, 'reduzieren', 8, 5, 'Akute Belastungsspitze (ACWR 3,2) · Nachlassender Einsatz in Folge'],
    },
    {
      name: 'laufende Verletzung ohne Ende',
      result: risk(player(), [entry('2026-10-09', 'Training', 2, 'present', 2)], [absence({ kind: 'injury', label: 'Verletzung', from: '2026-10-01', to: '' })]),
      expected: [100, 'aussetzen', 2, 1, 'Aktuell verletzt · Akute Belastungsspitze (ACWR 4)'],
    },
  ];

  for (const { name, result, expected } of cases) {
    it(`${name}: gleiche Prozent, Stufe, Belastung und Gründe wie die bisherige App`, () => {
      const [percentage, tier, load, recentEvents, reason] = expected;
      expect({ percentage: result.percentage, tier: result.tier, load: result.load, recentEvents: result.recentEvents, reason: result.reason }).toEqual({ percentage, tier, load, recentEvents, reason });
    });
  }

  it('ohne Daten unauffällig mit Hinweistext', () => {
    const result = risk(player(), []);
    expect(result).toMatchObject({ percentage: 0, tier: 'unauffaellig', level: 'Unauffällig', load: 0, recentEvents: 0, reason: 'Keine auffälligen Belastungsfaktoren' });
  });

  it('begrenzt den Wert auf 100 und liefert zur Stufe die Handlungsempfehlung', () => {
    const result = risk(player({ status: 'Verletzt', injuryUntil: '2026-10-20' }), [entry('2026-10-09', 'Training', 3, 'present', 2)], [absence({ kind: 'injury', label: 'Verletzung', from: '2026-10-01', to: '' })]);
    expect(result.percentage).toBeLessThanOrEqual(100);
    expect(result.tier).toBe('aussetzen');
    expect(result.action).toContain('ärztliche');
  });
});
