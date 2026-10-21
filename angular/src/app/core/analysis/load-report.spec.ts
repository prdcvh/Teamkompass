import { describe, expect, it } from 'vitest';
import type { TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import type { EventRating } from '../profile/profile';
import { type Attendance, BLANK_RATING } from '../ratings/rating';
import type { Absence } from '../records/absence';
import type { Measurement } from '../records/measurement';
import { addDays } from '../shared/dates';
import { type LoadReportInput, buildLoadReport, canCreateLoadReport, loadReportRange } from './load-report';
import { loadReportHtml } from './load-report-html';

const TODAY = '2026-10-20';
const ago = (days: number) => addDays(TODAY, -days);

const player: Player = {
  id: 'p1',
  name: 'Max Muster',
  positions: ['ST'],
  number: 7,
  birthdate: '2012-02-05',
  status: 'Fit',
  injuryUntil: '',
  injuredSince: '',
  consentStatus: 'granted',
  consentDate: '',
};

function item(id: string, daysAgo: number, attendance: Attendance = 'present', change: Partial<TeamEvent> = {}, minutes: number | null = null): EventRating {
  const event = { id, title: `Training ${id}`, type: 'Training', date: ago(daysAgo), exertion: 5, intensity: 2, durationMinutes: 90, matchDuration: null, ...change } as TeamEvent;
  return { event, rating: { ...BLANK_RATING, attendance, minutes } };
}

function build(change: Partial<LoadReportInput> = {}, period: '4' | '8' | '12' | 'custom' = '4', from = '', to = '') {
  const range = loadReportRange(period, from, to, TODAY);
  if ('error' in range) throw new Error(range.error);
  return buildLoadReport({ teamName: 'Testteam', player, items: [], absences: [], measurements: [], includeHealth: true, from: range.from, to: range.to, today: TODAY, createdBy: 'Trainer', ...change });
}

describe('loadReportRange', () => {
  it('kennt 4/8/12 Wochen und den eigenen Zeitraum', () => {
    expect(loadReportRange('4', '', '', TODAY)).toEqual({ from: ago(27), to: TODAY });
    expect(loadReportRange('8', '', '', TODAY)).toEqual({ from: ago(55), to: TODAY });
    expect(loadReportRange('12', '', '', TODAY)).toEqual({ from: ago(83), to: TODAY });
    expect(loadReportRange('custom', '2026-10-01', '2026-12-01', TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
    expect('error' in loadReportRange('custom', '', TODAY, TODAY)).toBe(true);
    expect('error' in loadReportRange('custom', '2026-10-10', '2026-10-01', TODAY)).toBe(true);
    expect('error' in loadReportRange('custom', '2024-01-01', TODAY, TODAY)).toBe(true);
  });
});

describe('buildLoadReport', () => {
  const items = [
    item('e1', 1),
    item('e2', 3, 'limited'),
    item('e3', 5, 'present', { type: 'Spiel', title: 'Spiel gegen A', matchDuration: 70, durationMinutes: null, exertion: 8 }, 50),
    item('e4', 10, 'absent'),
    item('e5', 40),
    item('e6', -2),
    item('e7', 2, 'open'),
  ];

  it('stellt Termine, Wochen und Summen je Zeitraum zusammen', () => {
    const four = build({ items });
    expect(four.rows.map((row) => row.date)).toEqual([ago(10), ago(5), ago(3), ago(1)]);
    expect(four.rows[0]).toMatchObject({ attendance: 'gefehlt', load: null });
    expect(four.rows[1]).toMatchObject({ type: 'Spiel', minutes: 50, load: 400 });
    expect(four.rows[2]).toMatchObject({ attendance: 'eingeschränkt', load: 270 });
    expect(four.totals).toMatchObject({ sessions: 3, load: 1120, missed: 1 });
    expect(four.weeks).toHaveLength(4);
    expect(four.weeks.at(-1)).toMatchObject({ to: TODAY, load: 1120 });
    expect(four.assessment.load).toBe(1120);

    const eight = build({ items }, '8');
    expect(eight.rows).toHaveLength(5);
    expect(eight.weeks).toHaveLength(8);
    expect(eight.totals.load).toBe(1570);

    const custom = build({ items }, 'custom', ago(45), ago(30));
    expect(custom.rows.map((row) => row.date)).toEqual([ago(40)]);
    expect(custom.to).toBe(ago(30));
    expect(custom.weeks[0].from).toBe(ago(45));
  });

  it('liefert für einen leeren Zeitraum einen Bericht ohne Fehler', () => {
    const report = build();
    expect(report.rows).toEqual([]);
    expect(report.weeks.every((week) => week.load === 0)).toBe(true);
    expect(report.assessment.level).toBe('Unauffällig');
    const html = loadReportHtml(report);
    expect(html).toContain('Keine Termine im Zeitraum.');
    expect(html).toContain('Keine Belastung im Zeitraum eingetragen.');
    expect(html).not.toMatch(/undefined|NaN/);
  });

  it('lässt ohne Häkchen Verletzungen, Abwesenheitsgründe und Verfügbarkeit weg', () => {
    const injured: Player = { ...player, status: 'Verletzt', injuryUntil: ago(-5) };
    const absences: Absence[] = [
      { id: 'a1', kind: 'injury', label: 'Verletzung', detail: 'Bänderriss Sprunggelenk', from: ago(20), to: ago(8) },
      { id: 'a2', kind: 'absence', label: 'Klassenfahrt', detail: '', from: ago(4), to: ago(2) },
    ];
    const list = [item('e1', 12, 'absent'), item('e2', 3, 'absent'), item('e3', 1)];
    const withHealth = build({ player: injured, items: list, absences });
    const withHtml = loadReportHtml(withHealth);
    expect(withHtml).toContain('Bänderriss Sprunggelenk');
    expect(withHtml).toContain('Klassenfahrt');
    expect(withHealth.assessment.availability?.label).toBe('Verletzt');
    // Rückkehr nach einer beendeten Verletzung (ohne laufenden Status) fließt in die Stufe ein.
    expect(build({ items: list, absences }).assessment.reasons).toContain('Rückkehr nach Verletzung');
    expect(build({ items: list, absences, includeHealth: false }).assessment.reasons).not.toContain('Rückkehr nach Verletzung');

    const without = build({ player: injured, items: list, absences, includeHealth: false });
    const html = loadReportHtml(without);
    for (const forbidden of ['Bänderriss', 'Klassenfahrt', 'Verletzt', 'Verletzung:', 'Rückkehr nach Verletzung', 'Verfügbarkeit</span>', 'Gesundheitsdaten eines']) {
      expect(html).not.toContain(forbidden);
    }
    expect(without.assessment.availability).toBeNull();
    expect(without.markers.returns).toEqual([]);
    expect(without.rows.filter((row) => row.attendance === 'gefehlt')).toHaveLength(2);
    expect(without.rows.every((row) => row.reason === '')).toBe(true);
  });

  it('zeigt Wachstum und Erholungs-Hinweise', () => {
    const measurements: Measurement[] = [
      { id: 'm1', date: ago(70), height: 160, weight: null },
      { id: 'm2', date: ago(10), height: 162.4, weight: null },
    ];
    const report = build({ measurements, items: [item('h1', 6, 'present', { exertion: 8 }), item('h2', 5, 'present', { exertion: 8 })] });
    expect(report.markers.growth).toHaveLength(1);
    expect(report.markers.growth[0].perMonth).toBe(1.2);
    expect(report.markers.recovery[0]).toContain('48 Stunden');
    expect(loadReportHtml(report)).toContain('starker Wachstumsschub');
  });

  it('maskiert alle Nutzertexte', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const report = build({
      player: { ...player, name: evil },
      teamName: evil,
      createdBy: evil,
      items: [item('e1', 2, 'absent', { title: evil })],
      absences: [{ id: 'a1', kind: 'injury', label: evil, detail: evil, from: ago(3), to: ago(1) }],
    });
    const html = loadReportHtml(report, 'https://example.org/logo.png"><script>x</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('canCreateLoadReport', () => {
  it('Trainer für jeden Spieler, Spieler nur für sich selbst, sonst niemand', () => {
    expect(canCreateLoadReport('trainer', null, 'p1')).toBe(true);
    expect(canCreateLoadReport('player', 'p1', 'p1')).toBe(true);
    expect(canCreateLoadReport('player', 'p1', 'p2')).toBe(false);
    expect(canCreateLoadReport('player', null, 'p1')).toBe(false);
    for (const role of ['parent', 'medical', 'scout', 'physio', null]) expect(canCreateLoadReport(role, 'p1', 'p1')).toBe(false);
  });
});
