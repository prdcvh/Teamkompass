import { type TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import { type EventRating } from '../profile/profile';
import { BLANK_RATING, type Attendance } from '../ratings/rating';
import { injuryRisk, sessionLoad } from '../analysis/risk';
import {
  type SelfReport,
  countsReport,
  docFromSelfReport,
  effectiveExertion,
  isReportOpen,
  openReportItems,
  reportWindow,
  selfReportFromDoc,
  wellnessFromDoc,
  wellnessSum,
  withSelfExertion,
} from './self-report';

/** Selbsteinschätzung der Spieler (SCRUM-138): Frist bis Ende Folgetag, Spielerwert statt Trainerwert. Feste Uhr. */
describe('self-report (Anstrengung der Spieler)', () => {
  const event = (overrides: Partial<TeamEvent> = {}): TeamEvent =>
    ({
      id: 'e1', type: 'Training', title: 'Training', date: '2026-11-03', exertion: 4, intensity: 1, location: '', trainingFocus: '', opponent: '',
      goalsFor: null, goalsAgainst: null, matchDuration: null, startTime: '18:00', durationMinutes: 90, locationCoords: null, notes: '', ...overrides,
    }) as TeamEvent;
  const item = (attendance: Attendance = 'present', overrides: Partial<TeamEvent> = {}): EventRating => ({ event: event(overrides), rating: { ...BLANK_RATING, attendance } });
  const report = (exertion: number, updatedAt: Date | null = new Date('2026-11-03T20:00:00+01:00'), eventId = 'e1'): SelfReport => ({ eventId, date: '2026-11-03', exertion, updatedAt });
  const at = (iso: string) => new Date(iso);

  describe('Frist', () => {
    it('öffnet mit dem Ende des Termins (Beginn + Dauer, Berliner Zeit) und schließt am Ende des Folgetags', () => {
      const window = reportWindow(event())!;
      expect(window.opens.toISOString()).toBe('2026-11-03T18:30:00.000Z'); // 18:00 + 90 min = 19:30 MEZ
      expect(window.closes.toISOString()).toBe('2026-11-04T23:00:00.000Z'); // 05.11. 00:00 MEZ
      expect(isReportOpen(item(), at('2026-11-03T19:29:00+01:00'))).toBe(false);
      expect(isReportOpen(item(), at('2026-11-03T19:30:00+01:00'))).toBe(true);
      expect(isReportOpen(item(), at('2026-11-04T23:59:00+01:00'))).toBe(true);
      expect(isReportOpen(item(), at('2026-11-05T00:00:00+01:00'))).toBe(false);
    });

    it('nutzt bei Spielen die Spieldauer und rechnet in der Sommerzeit richtig', () => {
      const window = reportWindow(event({ type: 'Spiel', date: '2026-06-13', startTime: '10:00', matchDuration: 70, durationMinutes: null }))!;
      expect(window.opens.toISOString()).toBe('2026-06-13T09:10:00.000Z'); // 11:10 MESZ
      expect(window.closes.toISOString()).toBe('2026-06-14T22:00:00.000Z');
    });

    it('ohne Startzeit ab Beginn des Termintags', () => {
      expect(reportWindow(event({ startTime: null }))!.opens.toISOString()).toBe('2026-11-02T23:00:00.000Z');
    });

    it('nur bei „anwesend“ oder „eingeschränkt“', () => {
      const now = at('2026-11-04T10:00:00+01:00');
      expect(isReportOpen(item('present'), now)).toBe(true);
      expect(isReportOpen(item('limited'), now)).toBe(true);
      for (const attendance of ['open', 'absent', 'excluded'] as const) expect(isReportOpen(item(attendance), now)).toBe(false);
      expect(isReportOpen({ event: event(), rating: null }, now)).toBe(false);
    });

    it('listet offene Termine, neueste zuerst', () => {
      const items = [item('present', { id: 'a', date: '2026-11-02' }), item('present', { id: 'b' }), item('present', { id: 'c', date: '2026-10-30' })];
      expect(openReportItems(items, at('2026-11-03T21:00:00+01:00')).map((entry) => entry.event.id)).toEqual(['b', 'a']);
    });
  });

  describe('Spielerwert ersetzt den Trainerwert', () => {
    it('in der Formel Minuten × Anstrengung', () => {
      const items = [item()];
      const replaced = withSelfExertion(items, new Map([['e1', report(8)]]));
      expect(replaced[0].event.exertion).toBe(8);
      expect(sessionLoad(replaced[0].event, replaced[0].rating!)).toBe(720);
      expect(sessionLoad(items[0].event, items[0].rating!)).toBe(360);
      expect(effectiveExertion(event(), report(8))).toBe(8);
    });

    it('fehlt der Spielerwert, zählt der Trainerwert', () => {
      expect(withSelfExertion([item()], new Map())[0].event.exertion).toBe(4);
      expect(withSelfExertion([item()], new Map([['anderer', report(9, null, 'anderer')]]))[0].event.exertion).toBe(4);
      expect(effectiveExertion(event(), undefined)).toBe(4);
    });

    it('nach Ablauf der Frist gilt der Trainerwert: ein später gespeicherter Wert zählt nicht', () => {
      const late = report(9, new Date('2026-11-05T00:00:00+01:00'));
      expect(countsReport(event(), late)).toBe(false);
      expect(effectiveExertion(event(), late)).toBe(4);
      expect(withSelfExertion([item()], new Map([['e1', late]]))[0].event.exertion).toBe(4);
      // Gerade noch in der Frist bzw. offline gespeichert (Server-Zeitpunkt fehlt noch): zählt.
      expect(effectiveExertion(event(), report(9, new Date('2026-11-04T23:59:00+01:00')))).toBe(9);
      expect(effectiveExertion(event(), report(9, null))).toBe(9);
    });

    it('nur bei Teilnahme; die Belastungsampel rechnet mit dem Spielerwert', () => {
      expect(withSelfExertion([item('absent')], new Map([['e1', report(9)]]))[0].event.exertion).toBe(4);
      const player = { id: 'p', name: 'T', positions: [], number: 1, birthdate: '', status: 'Fit', injuryUntil: '', injuredSince: '', consentStatus: 'pending', consentDate: '' } as Player;
      const now = at('2026-11-05T12:00:00+01:00');
      expect(injuryRisk(player, [item()], [], [], now).load).toBe(360);
      expect(injuryRisk(player, withSelfExertion([item()], new Map([['e1', report(8)]])), [], [], now).load).toBe(720);
    });
  });

  describe('Dokumente', () => {
    it('liest nur gültige Werte', () => {
      expect(selfReportFromDoc('e1', { exertion: 7, date: '2026-11-03', updatedAt: '2026-11-03T20:00:00Z' })).toEqual({ eventId: 'e1', date: '2026-11-03', exertion: 7, updatedAt: new Date('2026-11-03T20:00:00Z') });
      expect(selfReportFromDoc('e1', { exertion: 11 })).toBeNull();
      expect(selfReportFromDoc('e1', { exertion: '7' })).toBeNull();
      expect(selfReportFromDoc('e1', { exertion: 3, updatedAt: { toDate: () => new Date(0) } })!.updatedAt).toEqual(new Date(0));
      const wellness = wellnessFromDoc('e1', { date: '2026-11-03', fatigue: 5, sleep: 9, soreness: null, stress: 2 });
      expect([wellness.fatigue, wellness.sleep, wellness.soreness, wellness.stress]).toEqual([5, null, null, 2]);
    });

    it('Summe des Befindens nur bei 4 Antworten', () => {
      expect(wellnessSum({ fatigue: 5, sleep: 6, soreness: 4, stress: 7 })).toBe(22);
      expect(wellnessSum({ fatigue: 5, sleep: null, soreness: 4, stress: 7 })).toBeNull();
    });

    it('schreibt Datum und Rolle mit (die Regeln prüfen beides)', () => {
      expect(docFromSelfReport('p1', event(), 6, 'parent')).toEqual({ playerId: 'p1', eventId: 'e1', date: '2026-11-03', exertion: 6, by: 'parent' });
    });
  });
});
