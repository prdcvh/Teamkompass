import { type TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import { type EventRating } from '../profile/profile';
import { BLANK_RATING, type Rating } from '../ratings/rating';
import type { Absence } from '../records/absence';
import { type PlayerData, countdownLabel, dashboardFigures, formTrend, itemsFor, leaders, matchResult, nextUpcomingEvent, teamRecord, upcomingEvents } from './team';

describe('team (Dashboard-Auswertungen)', () => {
  const TODAY = '2026-10-10';
  const NOW = new Date('2026-10-10T12:00:00');
  const event = (id: string, date: string, overrides: Partial<TeamEvent> = {}): TeamEvent => ({
    id, type: 'Training', title: `Event ${id}`, date, intensity: 2, exertion: 5, location: '', trainingFocus: '', opponent: '',
    goalsFor: null, goalsAgainst: null, matchDuration: null, startTime: null, durationMinutes: null, locationCoords: null, notes: '', ...overrides,
  });
  const game = (id: string, date: string, goalsFor: number | null, goalsAgainst: number | null) => event(id, date, { type: 'Spiel', goalsFor, goalsAgainst, matchDuration: 90 });
  const player = (id: string, overrides: Partial<Player> = {}): Player => ({
    id, name: `Spieler ${id}`, positions: ['ST'], number: 9, birthdate: '2012-01-01', status: 'Fit', injuryUntil: '', consentStatus: 'granted', consentDate: '', ...overrides,
  });
  const rated = (grade: number, attendance: Rating['attendance'] = 'present'): Rating => ({ ...BLANK_RATING, attendance, effort: grade, technique: grade, tactics: grade, comprehension: grade });
  const data = (p: Player, items: EventRating[], absences: Absence[] = []): PlayerData => ({ player: p, items, absences, measurements: [] });

  describe('Spielergebnisse', () => {
    it('zählt Sieg, Unentschieden, Niederlage und Tore nur bei vollständigem Ergebnis und vergangenen Spielen', () => {
      const events = [
        game('g1', '2026-10-01', 3, 1),
        game('g2', '2026-10-02', 2, 2),
        game('g3', '2026-10-03', 0, 1),
        game('g4', '2026-10-04', null, null), // noch kein Ergebnis
        game('g5', '2026-10-05', 2, null), // unvollständig
        game('g6', '2026-12-01', 0, 0), // Zukunft: kein Unentschieden
        event('t1', '2026-10-06', { goalsFor: 5, goalsAgainst: 0 }), // Training mit Ergebnisfeldern zählt nicht
        game('g7', TODAY, 1, 0), // heute zählt
      ];
      expect(teamRecord(events, TODAY)).toEqual({ wins: 2, draws: 1, losses: 1, goalsFor: 6, goalsAgainst: 4 });
      expect(matchResult(game('x', '2026-12-01', 1, 0), TODAY)).toBeNull();
      expect(matchResult(game('x', '2026-10-01', 0, 0), TODAY)?.outcome).toBe('Unentschieden');
    });

    it('ohne Spiele alles null', () => {
      expect(teamRecord([], TODAY)).toEqual({ wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
    });
  });

  describe('Nächstes Event', () => {
    it('ist das zeitlich nächste ab heute, heute zählt mit', () => {
      const events = [event('a', '2026-10-09'), event('b', '2026-10-20'), event('c', TODAY), event('d', '2026-10-15')];
      expect(nextUpcomingEvent(events, TODAY)?.id).toBe('c');
      expect(nextUpcomingEvent([event('a', '2026-10-09')], TODAY)).toBeNull();
      expect(nextUpcomingEvent([event('x', '')], TODAY)).toBeNull();
    });
  });

  describe('Nächste Events', () => {
    it('liefert die nächsten Events ab heute in zeitlicher Reihenfolge, begrenzt', () => {
      const events = [
        event('a', '2026-10-09'),
        event('b', '2026-10-20'),
        event('c', TODAY, { startTime: '18:00' }),
        event('d', TODAY, { startTime: '09:30' }),
        event('e', '2026-10-15'),
      ];
      expect(upcomingEvents(events, TODAY, 3).map((e) => e.id)).toEqual(['d', 'c', 'e']);
      expect(upcomingEvents([event('a', '2026-10-09'), event('x', '')], TODAY, 3)).toEqual([]);
    });

    it('beschriftet den Abstand in Tagen', () => {
      expect(countdownLabel(TODAY, TODAY)).toBe('Heute');
      expect(countdownLabel('2026-10-11', TODAY)).toBe('Morgen');
      expect(countdownLabel('2026-11-01', TODAY)).toBe('in 22 Tagen');
    });
  });

  describe('Formtrend', () => {
    it('vergleicht die letzte Note mit dem Schnitt davor (kleiner ist besser)', () => {
      expect(formTrend([])).toBeNull();
      expect(formTrend([2])).toBeNull();
      expect(formTrend([3, 3, 2])).toBe('besser');
      expect(formTrend([2, 2, 3])).toBe('schlechter');
      expect(formTrend([2, 2.4, 2.1])).toBe('gleich');
    });
  });

  describe('Bestenliste', () => {
    const e1 = event('e1', '2026-10-01');
    const e2 = event('e2', '2026-10-02');
    const itemsOf = (grades: [number, number]): EventRating[] => [{ event: e1, rating: rated(grades[0]) }, { event: e2, rating: rated(grades[1], 'limited') }];

    it('sortiert nach Notenschnitt (beste zuerst), lässt unbenotete weg und begrenzt auf die Anzahl', () => {
      const list = leaders([
        data(player('a'), itemsOf([3, 3])),
        data(player('b'), itemsOf([1, 2])),
        data(player('c'), [{ event: e1, rating: null }]),
        data(player('d'), itemsOf([2, 2])),
      ], 2);
      expect(list.map((entry) => [entry.player.id, entry.grade, entry.events])).toEqual([['b', 1.5, 2], ['d', 2, 2]]);
      expect(list[0].recent).toEqual([1, 2]);
      expect(list[0].trend).toBe('schlechter');
    });

    it('zählt Events als Teilnahmen (Anwesend/Teilweise)', () => {
      const [entry] = leaders([data(player('a'), [{ event: e1, rating: rated(2) }, { event: e2, rating: rated(2, 'absent') }])], 5);
      expect(entry.events).toBe(1);
    });
  });

  describe('Kennzahlen', () => {
    it('Kader, Fit (Status überlagert von Abwesenheiten), Events, Teamnote, Bilanz, nächstes Event', () => {
      const e1 = event('e1', '2026-10-01');
      const g1 = game('g1', '2026-10-05', 2, 0);
      const future = event('f1', '2026-10-20');
      const events = [e1, g1, future];
      const vacation: Absence = { id: 'a', kind: 'absence', label: 'Urlaub', detail: '', from: '2026-10-08', to: '2026-10-12' };
      const figures = dashboardFigures([
        data(player('a'), [{ event: g1, rating: rated(2) }, { event: e1, rating: rated(4) }]), // Schnitt 3
        data(player('b'), [{ event: g1, rating: rated(1) }]), // Schnitt 1, aber im Urlaub → nicht fit
        data(player('c', { status: 'Verletzt', injuryUntil: '2026-10-30' }), []),
      ], events, TODAY, NOW);
      void vacation;
      expect(figures).toMatchObject({ squad: 3, fit: 2, events: 3, teamGrade: 2, record: { wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0 } });
      expect(figures.next?.id).toBe('f1');
    });

    it('Fit zählt eine laufende Abwesenheit nicht mit', () => {
      const vacation: Absence = { id: 'a', kind: 'absence', label: 'Urlaub', detail: '', from: '2026-10-08', to: '2026-10-12' };
      const figures = dashboardFigures([data(player('a'), [], [vacation]), data(player('b'), [])], [], TODAY, NOW);
      expect(figures.fit).toBe(1);
    });

    it('Teamnote ist leer, solange niemand benotet ist', () => {
      expect(dashboardFigures([data(player('a'), [])], [], TODAY, NOW).teamGrade).toBeNull();
    });

    it('Belastung hoch zählt nur die Stufe „Anpassen“, nicht die Verfügbarkeit (SCRUM-137)', () => {
      const injured = player('a', { status: 'Verletzt', injuryUntil: '2026-10-20' }); // Verletzt ist Verfügbarkeit, keine Belastungsstufe
      const growing = player('c');
      const fit = player('b');
      const growth = [{ id: 'm1', date: '2026-09-01', height: 150, weight: 40 }, { id: 'm2', date: '2026-10-01', height: 151.3, weight: 41 }]; // 1,3 cm/Monat
      const figures = dashboardFigures([data(injured, []), data(fit, []), { ...data(growing, []), measurements: growth }], [], TODAY, NOW);
      expect(figures.highLoad).toBe(1);
    });
  });

  it('itemsFor ordnet die Bewertung des Spielers den Events zu (neueste zuerst)', () => {
    const events = [event('a', '2026-10-01'), event('b', '2026-10-05')];
    const ratings = new Map([['a', new Map([['p1', rated(2)], ['p2', rated(3)]])]]);
    const items = itemsFor('p1', events, ratings);
    expect(items.map((entry) => entry.event.id)).toEqual(['b', 'a']);
    expect(items[0].rating).toBeNull();
    expect(items[1].rating?.effort).toBe(2);
  });
});
