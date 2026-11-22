import type { TeamEvent } from '../events/event';
import type { ConsentStatus } from '../player/player';
import type { Rating } from '../ratings/rating';
import type { MaturityInputs } from '../records/maturity';
import type { Measurement } from '../records/measurement';
import { type DevelopmentPlayerData, birthQuarter, classifyForPeriod, developmentView } from './development-view';

describe('Entwicklungsansicht: Geburtsquartal × Reifegruppe (SCRUM-258)', () => {
  const today = '2026-11-20';
  const inputs: MaturityInputs = { sex: 'm', parentsConsent: true, motherHeight: 168, fatherHeight: 182, updatedAt: '2026-10-02T10:00:00.000Z' };
  const measure = (height: number, weight: number, extra: Partial<Measurement> = {}): Measurement => ({ id: `m${height}`, date: '2026-10-01', height, weight, ...extra });
  const data = (height: number, weight: number, override: Partial<MaturityInputs> = {}, extra: Partial<Measurement> = {}): DevelopmentPlayerData => ({
    inputs: { ...inputs, ...override },
    measurements: [measure(height, weight, extra)],
  });
  // Größe/Gewicht je Gruppe bei 14,5 Jahren (Jahrgang 2012): 130 cm → spät, 165 cm → im Schnitt, 178 cm → früh.
  const LATE = data(130, 28);
  const AVERAGE = data(165, 51);
  const EARLY = data(178, 60);

  const player = (id: string, birthdate: string, consentStatus: ConsentStatus = 'granted') => ({ id, birthdate, consentStatus });
  const game = (id: string, date: string): TeamEvent => ({ id, type: 'Spiel', date }) as unknown as TeamEvent;
  const rating = (minutes: number | null, attendance: Rating['attendance'] = 'present'): Rating => ({ attendance, minutes }) as unknown as Rating;
  const ratings = (entries: Record<string, Record<string, Rating>>) => new Map(Object.entries(entries).map(([event, byPlayer]) => [event, new Map(Object.entries(byPlayer))]));
  const filter = { from: '2026-09-01', to: today, cohort: 'all' };

  it('ordnet Spieler Quartal und Reifegruppe unabhängig zu: früh geboren heißt nicht früh entwickelt', () => {
    expect(['2012-01-15', '2012-03-31', '2012-04-01', '2012-07-01', '2012-12-31', '', 'x'].map(birthQuarter)).toEqual(['Q1', 'Q1', 'Q2', 'Q3', 'Q4', 'unknown', 'unknown']);
    const result = developmentView({
      players: [player('a', '2012-01-10'), player('b', '2012-02-10'), player('c', '2012-11-10')],
      data: new Map([['a', LATE], ['b', EARLY], ['c', AVERAGE]]),
      events: [],
      ratings: new Map(),
      filter,
      today,
    });
    const q1 = result.rows.find((row) => row.quarter === 'Q1')!;
    expect(q1.cells.late.players).toBe(1); // Q1-Spieler a ist spät entwickelt
    expect(q1.cells.early.players).toBe(1); // Q1-Spieler b ist früh entwickelt
    expect(result.rows.find((row) => row.quarter === 'Q4')!.cells.average.players).toBe(1);
    expect(result.classifiedCount).toBe(3);
  });

  it('Testteam mit ungleichen Gruppen und fehlenden Daten: Anzahlen, Minuten und Nenner stimmen', () => {
    const result = developmentView({
      players: [
        player('a', '2012-01-10'), // Q1 spät, 90+45
        player('b', '2012-02-10'), // Q1 spät, 60
        player('c', '2012-02-20'), // Q1 früh, kein Minuten-Eintrag, fehlt einmal
        player('d', '2012-08-10'), // Q3 im Schnitt, 0 Minuten eingetragen
        player('e', '2012-09-10'), // Q3 ohne Angaben → nicht eingeordnet
        player('f', ''), // ohne Geburtsdatum
        player('g', '2012-12-10', 'revoked'), // widerrufen
      ],
      data: new Map<string, DevelopmentPlayerData>([['a', LATE], ['b', LATE], ['c', EARLY], ['d', AVERAGE], ['e', { inputs: { sex: null, parentsConsent: false, motherHeight: null, fatherHeight: null }, measurements: [] }], ['f', EARLY]]),
      events: [game('g1', '2026-09-10'), game('g2', '2026-10-10'), game('g0', '2026-08-01'), game('gf', '2026-12-01'), { id: 't', type: 'Training', date: '2026-09-12' } as unknown as TeamEvent],
      ratings: ratings({
        g1: { a: rating(90), b: rating(60), c: rating(null, 'absent'), d: rating(0), g: rating(45) },
        g2: { a: rating(45), c: rating(null, 'excluded') },
        g0: { a: rating(500) }, // vor dem Zeitraum
        gf: { a: rating(500) }, // Zukunft
        t: { a: rating(77) }, // Training zählt nicht
      }),
      filter,
      today,
    });
    expect(result.games).toBe(2);
    expect(result.playerCount).toBe(7);
    const q1 = result.rows.find((row) => row.quarter === 'Q1')!;
    expect(q1.cells.late).toMatchObject({ players: 2, minutes: 195, playersWithMinutes: 1 + 1, averageMinutes: 98, gameSlots: 4 });
    expect(q1.cells.early).toMatchObject({ players: 1, minutes: 0, playersWithMinutes: 0, averageMinutes: null, missedGames: 2, gameSlots: 2 });
    const q3 = result.rows.find((row) => row.quarter === 'Q3')!;
    expect(q3.cells.average).toMatchObject({ players: 1, minutes: 0, playersWithMinutes: 1 }); // 0 Minuten sind ein Eintrag
    expect(q3.cells.unclassified.players).toBe(1);
    expect(result.rows.find((row) => row.quarter === 'unknown')!.cells.unclassified.players).toBe(1); // ohne Geburtsdatum keine Reife
    expect(result.rows.find((row) => row.quarter === 'Q4')!.cells.unclassified.players).toBe(1);
    // Nenner: Alle Spieler der Auswahl sind in genau einer Zelle gezählt.
    expect(result.total.players).toBe(7);
    expect(result.classifiedCount).toBe(4);
    expect(result.columnTotals.unclassified.players).toBe(3);
    expect(result.reasons.map((entry) => [entry.reason, entry.count]).sort()).toEqual([['no-inputs', 1], ['not-calculated', 1], ['revoked', 1]]);
    // Die Minuten des widerrufenen Spielers werden mitgezählt (keine Gesundheitsdaten), seine Reife nie.
    expect(result.total.minutes).toBe(90 + 60 + 0 + 45 + 45);
  });

  it('Jahrgangsfilter ändert nur die Auswahl; Spieler ohne Geburtsdatum nur bei „alle Jahrgänge“', () => {
    const players = [player('a', '2012-01-10'), player('b', '2013-01-10'), player('c', '')];
    const base = { players, data: new Map([['a', LATE], ['b', LATE], ['c', LATE]]), events: [], ratings: new Map(), today };
    const all = developmentView({ ...base, filter });
    const only = developmentView({ ...base, filter: { ...filter, cohort: '2012' } });
    expect(all.playerCount).toBe(3);
    expect(only.playerCount).toBe(1);
    expect(only.cohorts).toEqual(['2012', '2013']);
    expect(players).toHaveLength(3); // Eingaben unverändert
  });

  describe('Zuordnung zur Reifegruppe', () => {
    const p = { birthdate: '2012-05-05', consentStatus: 'granted' as ConsentStatus };

    it('ordnet unsichere, veraltete und nicht berechenbare Fälle nie einer Gruppe zu', () => {
      // veraltet: Messung 140 Tage vor dem Stichtag
      expect(classifyForPeriod(p, data(165, 51, {}, { date: '2026-07-01' }), today, today)).toMatchObject({ group: 'unclassified', reason: 'stale' });
      // unsicher: als zur Prüfung markiert
      expect(classifyForPeriod(p, data(165, 51, {}, { quality: 'flagged', flags: ['height-jump'] }), today, today)).toMatchObject({ group: 'unclassified', reason: 'uncertain' });
      // ohne Elterneinverständnis
      expect(classifyForPeriod(p, data(165, 51, { parentsConsent: false }), today, today)).toMatchObject({ group: 'unclassified', reason: 'not-calculated' });
      // außerhalb 12–15 Jahre
      expect(classifyForPeriod({ ...p, birthdate: '2018-05-05' }, AVERAGE, today, today)).toMatchObject({ group: 'unclassified', reason: 'not-calculated' });
      expect(classifyForPeriod(p, AVERAGE, today, today)).toMatchObject({ group: 'average', reason: null });
    });

    it('rechnet bei widerrufener Einwilligung nie – auch wenn Daten vorlägen (SCRUM-252)', () => {
      expect(classifyForPeriod({ ...p, consentStatus: 'revoked' }, AVERAGE, today, today)).toMatchObject({ group: 'unclassified', reason: 'revoked' });
      expect(classifyForPeriod({ ...p, consentStatus: 'revoked' }, AVERAGE, '2026-10-15', today)).toMatchObject({ reason: 'revoked' });
    });

    it('nicht geladene Daten sind „nicht eingeordnet“, nicht „im Schnitt“', () => {
      expect(classifyForPeriod(p, null, today, today)).toMatchObject({ group: 'unclassified', reason: 'load-failed' });
    });

    it('historisch: nutzt den damaligen Stand, wenn Angaben und Messung damals vorlagen', () => {
      expect(classifyForPeriod(p, AVERAGE, '2026-10-15', today)).toMatchObject({ group: 'average' });
      // Messung nach dem Ende des Zeitraums zählt nicht mit: damals gab es keine verwertbare Messung.
      expect(classifyForPeriod(p, data(165, 51, {}, { date: '2026-10-20' }), '2026-10-15', today)).toMatchObject({ group: 'unclassified', reason: 'not-calculated' });
    });

    it('historisch: weist fehlenden damaligen Stand ausdrücklich aus, statt die heutige Reife zu unterstellen', () => {
      // Angaben wurden erst nach dem Zeitraum gespeichert
      expect(classifyForPeriod(p, AVERAGE, '2026-09-30', today)).toMatchObject({ group: 'unclassified', reason: 'no-history' });
      // Angaben ohne Speicherdatum (Altbestand)
      expect(classifyForPeriod(p, data(165, 51, { updatedAt: undefined }), '2026-10-15', today)).toMatchObject({ group: 'unclassified', reason: 'no-history' });
      // Messung nach dem Ende des Zeitraums korrigiert
      const corrected = data(165, 51, {}, { changes: [{ at: '2026-11-01T08:00:00.000Z', reason: 'Tippfehler', before: { height: 156, weight: 51, sittingHeight: null } }] });
      expect(classifyForPeriod(p, corrected, '2026-10-15', today)).toMatchObject({ group: 'unclassified', reason: 'no-history' });
      // aktueller Zeitraum (Ende heute) bleibt davon unberührt
      expect(classifyForPeriod(p, corrected, today, today).reason).not.toBe('no-history');
    });

    it('historische Auswertung zeigt „keine historische Einordnung“ in der Ergebnisansicht', () => {
      const result = developmentView({
        players: [player('a', '2012-05-05'), player('b', '2012-05-06')],
        data: new Map([['a', AVERAGE], ['b', AVERAGE]]),
        events: [],
        ratings: new Map(),
        filter: { from: '2026-08-01', to: '2026-09-30', cohort: 'all' },
        today,
      });
      expect(result.historic).toBe(true);
      expect(result.classifiedCount).toBe(0);
      expect(result.reasons).toEqual([expect.objectContaining({ reason: 'no-history', count: 2 })]);
    });
  });
});
