import type { TeamEvent } from '../events/event';
import type { EventRating } from '../profile/profile';
import { BLANK_RATING, type Attendance } from '../ratings/rating';
import type { Absence } from '../records/absence';
import {
  NO_PAUSES,
  type StreakPauses,
  checkInGoalFromDoc,
  checkInState,
  checkInStreak,
  docFromCheckInGoal,
  isPauseDay,
  learningStreak,
  teamGoalProgress,
  weekStart,
} from './streak';

/** Serien (SCRUM-194): Pausen schützen die Serie, offene Termine reißen nichts, Teamziel zählt nur. Feste Uhr. */
describe('streak', () => {
  const event = (id: string, date: string): TeamEvent =>
    ({
      id, type: 'Training', title: 'Training', date, exertion: 4, intensity: 1, location: '', trainingFocus: '', opponent: '',
      goalsFor: null, goalsAgainst: null, matchDuration: null, startTime: '18:00', durationMinutes: 90, locationCoords: null, notes: '',
    }) as TeamEvent;
  const item = (id: string, date: string, attendance: Attendance = 'present'): EventRating => ({ event: event(id, date), rating: { ...BLANK_RATING, attendance } });
  const injury = (from: string, to = ''): Absence => ({ id: 'a', kind: 'injury', label: 'Verletzung', detail: '', from, to });
  const holiday = (startDate: string, endDate: string) => ({ startDate, endDate });
  const pausesOf = (partial: Partial<StreakPauses>): StreakPauses => ({ ...NO_PAUSES, ...partial });
  // Nach Ende der Frist des letzten Termins (11.11.), damit nichts mehr offen ist.
  const later = new Date('2026-11-20T12:00:00+01:00');

  describe('Pause-Schutz', () => {
    it('erkennt Pausen, Abwesenheiten und Verletzungen ohne Ende', () => {
      const pauses = pausesOf({ breaks: [holiday('2026-12-24', '2027-01-06')], absences: [injury('2026-11-10')] });
      expect(isPauseDay('2026-12-25', pauses)).toBe(true);
      expect(isPauseDay('2026-11-20', pauses)).toBe(true); // Verletzung mit offenem Ende
      expect(isPauseDay('2026-11-09', pauses)).toBe(false);
    });

    it('lässt die Serie in einer Pause nicht reißen und nicht wachsen', () => {
      const items = [item('a', '2026-11-02'), item('b', '2026-11-04'), item('c', '2026-11-06'), item('d', '2026-11-09')];
      const answered = new Set(['a', 'b', 'd']); // c nicht beantwortet, liegt aber in den Herbstferien
      expect(checkInStreak(items, answered, NO_PAUSES, later).current).toBe(1); // ohne Pause: c reißt die Serie, nur d zählt
      const result = checkInStreak(items, answered, pausesOf({ breaks: [holiday('2026-11-05', '2026-11-08')] }), later);
      expect(result.current).toBe(3);
    });

    it('zählt einen beantworteten Termin in der Pause nicht mit', () => {
      const items = [item('a', '2026-11-02'), item('b', '2026-11-06')];
      const result = checkInStreak(items, new Set(['a', 'b']), pausesOf({ breaks: [holiday('2026-11-05', '2026-11-08')] }), later);
      expect(result.current).toBe(1);
    });

    it('lässt die Serie bei einer eingetragenen Verletzung stehen', () => {
      const items = [item('a', '2026-11-02'), item('b', '2026-11-04', 'absent'), item('c', '2026-11-06', 'present'), item('d', '2026-11-09')];
      const answered = new Set(['a', 'd']);
      const result = checkInStreak(items, answered, pausesOf({ absences: [injury('2026-11-03', '2026-11-08')] }), later);
      expect(result.current).toBe(2);
      expect(checkInStreak(items, answered, NO_PAUSES, later).current).toBe(1); // ohne Verletzung riss c
    });

    it('meldet, dass die Serie heute ruht', () => {
      const now = new Date('2026-11-06T12:00:00+01:00');
      expect(checkInStreak([], new Set(), pausesOf({ breaks: [holiday('2026-11-05', '2026-11-08')] }), now).pausedToday).toBe(true);
      expect(checkInStreak([], new Set(), NO_PAUSES, now).pausedToday).toBe(false);
    });
  });

  describe('Check-in-Serie', () => {
    it('zählt Termine in Folge und merkt sich die längste Serie', () => {
      const items = [item('a', '2026-11-02'), item('b', '2026-11-03'), item('c', '2026-11-04'), item('d', '2026-11-05'), item('e', '2026-11-06')];
      const result = checkInStreak(items, new Set(['a', 'b', 'd', 'e']), NO_PAUSES, later);
      expect(result).toEqual({ current: 2, best: 2, pausedToday: false });
      expect(checkInStreak(items, new Set(['a', 'b', 'c', 'e']), NO_PAUSES, later)).toMatchObject({ current: 1, best: 3 });
    });

    it('fragt nur Spieler, die beim Termin waren – wer fehlte, verliert nichts', () => {
      const items = [item('a', '2026-11-02'), item('b', '2026-11-03', 'absent'), item('c', '2026-11-04', 'excluded'), item('d', '2026-11-05')];
      expect(checkInState(items[1], new Set(), NO_PAUSES, later)).toBe('not-asked');
      expect(checkInStreak(items, new Set(['a', 'd']), NO_PAUSES, later).current).toBe(2);
    });

    it('reißt nicht, solange die Frist (Ende des Folgetags) läuft', () => {
      const items = [item('a', '2026-11-02'), item('b', '2026-11-04')];
      const answered = new Set(['a']);
      expect(checkInState(items[1], answered, NO_PAUSES, new Date('2026-11-05T23:59:00+01:00'))).toBe('open');
      expect(checkInStreak(items, answered, NO_PAUSES, new Date('2026-11-05T23:59:00+01:00')).current).toBe(1);
      expect(checkInState(items[1], answered, NO_PAUSES, new Date('2026-11-06T00:00:00+01:00'))).toBe('missed');
      expect(checkInStreak(items, answered, NO_PAUSES, new Date('2026-11-06T00:00:00+01:00')).current).toBe(0);
    });

    it('ignoriert Termine in der Zukunft und ohne Daten', () => {
      expect(checkInStreak([item('a', '2026-12-01')], new Set(), NO_PAUSES, later).current).toBe(0);
      expect(checkInStreak([], new Set(), NO_PAUSES, later)).toEqual({ current: 0, best: 0, pausedToday: false });
    });
  });

  describe('Lern-Serie (Wochen)', () => {
    const today = '2026-11-12'; // Donnerstag

    it('rechnet den Montag der Woche aus', () => {
      expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sonntag
      expect(weekStart('2026-11-09')).toBe('2026-11-09'); // Montag
      expect(weekStart('2026-11-12')).toBe('2026-11-09');
    });

    it('zählt Wochen in Folge; die laufende Woche reißt nie', () => {
      expect(learningStreak(['2026-10-27', '2026-11-03'], NO_PAUSES, today).current).toBe(2); // Woche heute noch offen
      expect(learningStreak(['2026-10-27', '2026-11-03', '2026-11-10'], NO_PAUSES, today).current).toBe(3);
    });

    it('reißt bei einer ganz verpassten Woche', () => {
      const result = learningStreak(['2026-10-20', '2026-11-03', '2026-11-10'], NO_PAUSES, today);
      expect(result).toMatchObject({ current: 2, best: 2 });
    });

    it('überspringt Wochen in einer Pause und zählt sie nicht', () => {
      const dates = ['2026-10-20', '2026-11-10']; // dazwischen zwei Ferienwochen
      expect(learningStreak(dates, NO_PAUSES, today).current).toBe(1);
      const result = learningStreak(dates, pausesOf({ breaks: [holiday('2026-10-26', '2026-11-08')] }), today);
      expect(result.current).toBe(2);
    });

    it('lässt eine Verletzung ohne Ende die Serie nicht reißen', () => {
      const result = learningStreak(['2026-10-20'], pausesOf({ absences: [injury('2026-10-26')] }), today);
      expect(result.current).toBe(1);
      expect(result.pausedToday).toBe(true);
    });

    it('hält die Serie an, wenn nichts mehr zu tun ist', () => {
      expect(learningStreak(['2026-10-20', '2026-10-27'], NO_PAUSES, today).current).toBe(0);
      expect(learningStreak(['2026-10-20', '2026-10-27'], NO_PAUSES, today, true).current).toBe(2);
    });

    it('ohne Bestätigung gibt es keine Serie', () => {
      expect(learningStreak([], NO_PAUSES, today)).toEqual({ current: 0, best: 0, pausedToday: false });
      expect(learningStreak(['kaputt'], NO_PAUSES, today).current).toBe(0);
    });
  });

  describe('Teamziel', () => {
    const dates = ['2026-10-30', '2026-11-02', '2026-11-02', '2026-11-12'];

    it('zählt nur den Monat und zeigt den Fortschritt', () => {
      expect(teamGoalProgress(dates, '2026-11', 6)).toEqual({ count: 3, goal: 6, percent: 50, reached: false });
      expect(teamGoalProgress(dates, '2026-11', 3)).toMatchObject({ percent: 100, reached: true });
      expect(teamGoalProgress(dates, '2026-11', 2)).toMatchObject({ percent: 100, reached: true });
    });

    it('ohne Ziel wird nur gezählt', () => {
      expect(teamGoalProgress(dates, '2026-11', null)).toEqual({ count: 3, goal: null, percent: null, reached: false });
    });

    it('liest das Ziel nur, wenn es eine sinnvolle ganze Zahl ist', () => {
      expect(checkInGoalFromDoc({ checkInGoal: 500 })).toBe(500);
      for (const bad of [0, -3, 2.5, '500', null, 10001, undefined]) expect(checkInGoalFromDoc({ checkInGoal: bad })).toBeNull();
      expect(checkInGoalFromDoc(null)).toBeNull();
      expect(docFromCheckInGoal(500)).toEqual({ checkInGoal: 500 });
    });
  });
});
