import type { Measurement } from './measurement';
import {
  type PlanPlayer,
  addMonths,
  berlinToday,
  buildPlan,
  docFromPlanEntry,
  lastValidMeasurement,
  planCounts,
  planEntriesFromDoc,
  planRow,
  resumeEntry,
  roundQueue,
} from './measurement-plan';

const player = (id: string, consentStatus: PlanPlayer['consentStatus'] = 'granted'): PlanPlayer => ({ id, name: `Spieler ${id}`, consentStatus });
const measurement = (date: string, extra: Partial<Measurement> = {}): Measurement => ({ id: `m${date}`, date, height: 150, weight: null, ...extra });

describe('Messplan (Rechenregeln, SCRUM-255)', () => {
  describe('Kalender', () => {
    it('addMonths kappt Monatsenden und rechnet über den Jahreswechsel', () => {
      expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
      expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
      expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
      expect(addMonths('2026-12-15', 3)).toBe('2027-03-15');
      expect(addMonths('2026-10-31', 4)).toBe('2027-02-28');
      expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
      expect(addMonths('2026-05-31', 1)).toBe('2026-06-30');
    });

    it('berlinToday nimmt das Kalenderdatum in Europe/Berlin, nicht das des Geräts', () => {
      expect(berlinToday(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
      expect(berlinToday(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01');
      expect(berlinToday(new Date('2026-12-31T22:30:00Z'))).toBe('2026-12-31');
    });
  });

  describe('Status', () => {
    const today = '2026-11-17';

    it('ohne gültige Messung: Baseline fehlt, kein Termin', () => {
      expect(planRow(player('a'), [], undefined, today)).toMatchObject({ status: 'baseline-missing', nextDue: null, lastDate: null });
      // Nur eine Messung ohne Größe oder nur auffällig markierte zählen nicht als Baseline.
      expect(planRow(player('a'), [measurement('2026-10-01', { height: null }), measurement('2026-10-02', { quality: 'flagged' })], undefined, today).status).toBe('baseline-missing');
    });

    it('Vorschlag drei Monate nach der letzten gültigen Messung: geplant, fällig, überfällig', () => {
      // Termin 2027-02-17
      expect(planRow(player('a'), [measurement('2026-11-17')], undefined, today)).toMatchObject({ status: 'planned', nextDue: '2027-02-17', intervalMonths: 3 });
      expect(planRow(player('a'), [measurement('2026-08-17')], undefined, today)).toMatchObject({ status: 'due', nextDue: '2026-11-17', daysUntil: 0 });
      // 14 Tage Karenz nach dem Termin: noch fällig, danach überfällig
      expect(planRow(player('a'), [measurement('2026-08-03')], undefined, today)).toMatchObject({ status: 'due', daysUntil: -14 });
      expect(planRow(player('a'), [measurement('2026-08-02')], undefined, today)).toMatchObject({ status: 'overdue', daysUntil: -15 });
      // 14 Tage vor dem Termin ist es fällig, einen Tag früher noch geplant
      expect(planRow(player('a'), [measurement('2026-09-01')], undefined, today)).toMatchObject({ nextDue: '2026-12-01', status: 'due' });
      expect(planRow(player('a'), [measurement('2026-08-31')], undefined, today).status).toBe('due');
      expect(planRow(player('a'), [measurement('2026-09-02')], undefined, today).status).toBe('planned');
    });

    it('eigener Rhythmus ersetzt den Vorschlag', () => {
      expect(planRow(player('a'), [measurement('2026-10-17')], { intervalMonths: 1 }, today)).toMatchObject({ nextDue: '2026-11-17', status: 'due', intervalMonths: 1 });
    });

    it('nimmt die jüngste GÜLTIGE Messung, nicht die auffällige', () => {
      const list = [measurement('2026-08-17'), measurement('2026-11-10', { quality: 'flagged', flags: ['height-jump'] })];
      expect(lastValidMeasurement(list)?.date).toBe('2026-08-17');
      expect(planRow(player('a'), list, undefined, today)).toMatchObject({ lastDate: '2026-08-17', status: 'due' });
    });

    it('Messung am Jahresende rückt den Termin ins nächste Jahr', () => {
      expect(planRow(player('a'), [measurement('2026-11-30')], undefined, today).nextDue).toBe('2027-02-28');
      expect(planRow(player('a'), [measurement('2026-12-31')], undefined, today).nextDue).toBe('2027-03-31');
    });

    it('fehlende Einwilligung: neutral, nie fällig, nie überfällig, kein Termin', () => {
      for (const consent of ['pending', 'revoked'] as const) {
        const row = planRow(player('a', consent), [measurement('2025-01-01')], { dueDate: '2026-01-01', dueSetOn: '2025-12-01' }, today);
        expect(row).toMatchObject({ status: 'no-consent', nextDue: null, manual: false, daysUntil: null });
      }
    });

    it('Pause: kein Versäumnis, auch wenn der Termin lange vorbei ist', () => {
      expect(planRow(player('a'), [measurement('2025-01-01')], { paused: true }, today)).toMatchObject({ status: 'paused', daysUntil: null });
      expect(planRow(player('a'), [], { paused: true }, today).status).toBe('paused');
    });
  });

  describe('Manueller Termin', () => {
    const today = '2026-11-17';

    it('vorgezogen oder verschoben gilt, bis danach gemessen wurde', () => {
      const entry = { dueDate: '2026-12-20', dueSetOn: '2026-11-17' };
      expect(planRow(player('a'), [measurement('2026-10-01')], entry, today)).toMatchObject({ nextDue: '2026-12-20', manual: true, status: 'planned' });
      // vorgezogen auf heute
      expect(planRow(player('a'), [measurement('2026-11-01')], { dueDate: today, dueSetOn: today }, today)).toMatchObject({ nextDue: today, manual: true, status: 'due' });
    });

    it('wird durch eine neue Messung genau einmal verbraucht: danach gilt wieder der Rhythmus', () => {
      const entry = { dueDate: '2026-12-20', dueSetOn: '2026-11-17' };
      const before = planRow(player('a'), [measurement('2026-10-01')], entry, today);
      const after = planRow(player('a'), [measurement('2026-10-01'), measurement('2026-11-18')], entry, '2026-11-18');
      expect(before.nextDue).toBe('2026-12-20');
      expect(after).toMatchObject({ nextDue: '2027-02-18', manual: false });
      // nochmaliges Berechnen verschiebt nichts weiter (kein gespeicherter Zähler)
      expect(planRow(player('a'), [measurement('2026-10-01'), measurement('2026-11-18')], entry, '2026-11-18')).toEqual(after);
    });

    it('eine Messung vom Tag des Setzens verbraucht den Termin ebenfalls', () => {
      expect(planRow(player('a'), [measurement('2026-11-17')], { dueDate: '2026-12-20', dueSetOn: '2026-11-17' }, today)).toMatchObject({ nextDue: '2027-02-17', manual: false });
    });

    it('auch ohne Baseline lässt sich ein Termin setzen', () => {
      expect(planRow(player('a'), [], { dueDate: '2026-12-20', dueSetOn: today }, today)).toMatchObject({ status: 'planned', nextDue: '2026-12-20', manual: true });
    });

    it('Fortsetzen nach einer Pause: heute fällig, nicht überfällig', () => {
      const resumed = resumeEntry({ paused: true, intervalMonths: 2 }, today);
      expect(resumed).toEqual({ intervalMonths: 2, dueDate: today, dueSetOn: today });
      expect(planRow(player('a'), [measurement('2025-01-01')], resumed, today)).toMatchObject({ status: 'due', nextDue: today });
    });
  });

  describe('Kader', () => {
    const today = '2026-11-17';

    it('Korrektur einer Messung verändert nur diesen Spieler', () => {
      const players = [player('a'), player('b')];
      const entries = {};
      const first = buildPlan(players, new Map([['a', [measurement('2026-08-17')]], ['b', [measurement('2026-09-01')]]]), entries, today);
      const corrected = buildPlan(players, new Map([['a', [measurement('2026-08-20')]], ['b', [measurement('2026-09-01')]]]), entries, today);
      expect(corrected.find((row) => row.playerId === 'b')).toEqual(first.find((row) => row.playerId === 'b'));
      expect(corrected.find((row) => row.playerId === 'a')?.nextDue).toBe('2026-11-20');
    });

    it('sortiert dringend zuerst; Pausierte und Nicht-Teilnehmende unten', () => {
      const rows = buildPlan(
        [player('p', 'pending'), player('z'), player('y'), player('x'), player('w')],
        new Map([['z', [measurement('2026-08-01')]], ['y', [measurement('2026-11-17')]], ['w', [measurement('2025-01-01')]]]),
        { w: { paused: true } },
        today,
      );
      expect(rows.map((row) => `${row.playerId}:${row.status}`)).toEqual(['z:overdue', 'x:baseline-missing', 'y:planned', 'w:paused', 'p:no-consent']);
    });

    it('Messrunde und Zähler enthalten nie Pausierte oder Spieler ohne Einwilligung', () => {
      const rows = buildPlan(
        [player('a'), player('b'), player('c'), player('d', 'revoked'), player('e')],
        new Map([['a', [measurement('2026-08-01')]], ['b', [measurement('2026-09-01')]], ['e', [measurement('2025-01-01')]]]),
        { e: { paused: true } },
        today,
      );
      expect(roundQueue(rows).map((row) => row.playerId)).toEqual(['a', 'b', 'c']);
      expect(planCounts(rows)).toEqual({ overdue: 1, due: 1, baselineMissing: 1 });
    });
  });

  describe('Speicherformat', () => {
    it('liest nur gültige Einträge', () => {
      expect(
        planEntriesFromDoc({
          measurementPlan: {
            a: { intervalMonths: 2, dueDate: '2026-12-20', dueSetOn: '2026-11-17', paused: true },
            b: { intervalMonths: 9 },
            c: { dueDate: '2026-02-30', dueSetOn: '2026-11-17' },
            d: { dueDate: '2026-12-20' },
            e: 'x',
            f: { paused: 'ja' },
          },
        }),
      ).toEqual({ a: { intervalMonths: 2, dueDate: '2026-12-20', dueSetOn: '2026-11-17', paused: true } });
      expect(planEntriesFromDoc(null)).toEqual({});
      expect(planEntriesFromDoc({ measurementPlan: [] })).toEqual({});
    });

    it('speichert nur Abweichungen vom Vorschlag; sonst null (Feld entfernen)', () => {
      expect(docFromPlanEntry({})).toBeNull();
      expect(docFromPlanEntry({ intervalMonths: 3 })).toBeNull();
      expect(docFromPlanEntry({ intervalMonths: 4, paused: true })).toEqual({ intervalMonths: 4, paused: true });
      expect(docFromPlanEntry({ dueDate: '2026-12-20', dueSetOn: '2026-11-17' })).toEqual({ dueDate: '2026-12-20', dueSetOn: '2026-11-17' });
      // Termin ohne "gesetzt am" wird nie gespeichert
      expect(docFromPlanEntry({ dueDate: '2026-12-20' })).toBeNull();
    });
  });
});
