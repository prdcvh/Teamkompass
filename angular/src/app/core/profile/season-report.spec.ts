import { describe, expect, it } from 'vitest';
import type { TeamEvent } from '../events/event';
import type { LearningPath } from '../learning/learning-path';
import type { Player } from '../player/player';
import { BLANK_RATING } from '../ratings/rating';
import type { Absence } from '../records/absence';
import type { DevelopmentPlan } from '../records/plan';
import { SEASON_REPORT_CSS, seasonReportsHtml } from './season-report-html';
import { buildSeasonReport, seasonReportRange } from './season-report';

const player: Player = {
  id: 'p1',
  name: '<img src=x onerror=alert(1)>',
  positions: ['ST'],
  number: 9,
  birthdate: '2012-02-05',
  status: 'Fit',
  injuryUntil: '',
  injuredSince: '',
  consentStatus: 'granted',
  consentDate: '',
};
const event = (id: string, date: string, type: 'Training' | 'Spiel' = 'Training', notes = ''): TeamEvent => ({ id, type, title: `Termin ${id}`, date, intensity: 2, notes }) as TeamEvent;
const rated = (grade: number, note = '') => ({ ...BLANK_RATING, attendance: 'present' as const, effort: grade, technique: grade, tactics: grade, comprehension: grade, note });
const items = [
  { event: event('e0', '2026-06-01'), rating: rated(5) }, // vor dem Zeitraum
  { event: event('e1', '2026-08-10', 'Training', 'PRIVATE-NOTIZ'), rating: rated(4, 'RUECKMELDUNG-GEHEIM') },
  { event: event('e2', '2026-09-12', 'Spiel'), rating: rated(2) },
  { event: event('e3', '2026-09-20'), rating: { ...BLANK_RATING, attendance: 'absent' as const } },
];
const plan = (id: string, status: DevelopmentPlan['status'], reviewDate: string): DevelopmentPlan => ({
  id,
  focus: `Schwerpunkt ${id}`,
  goal: `Ziel ${id}`,
  actions: '',
  selfReflection: '',
  selfReflectionAt: '',
  coachReview: 'REVIEW-INTERN',
  reviewDate,
  status,
  dueDate: '',
  createdAt: '2026-07-02',
});
const path: LearningPath = {
  id: 'lp1',
  title: 'Kopfball',
  position: '',
  ageGroup: '',
  levels: [
    { id: 'l1', title: 'Absprung', unit: 'u', minutes: 5, url: null, homeTask: '' },
    { id: 'l2', title: 'Timing', unit: 'u', minutes: 5, url: null, homeTask: '' },
  ],
};
const absence: Absence = { id: 'a1', kind: 'injury', label: 'Verletzung', detail: 'Zerrung', from: '2026-09-01', to: '2026-09-10' };

const base = {
  teamName: 'U14',
  teamLabel: 'U14',
  player,
  items,
  plans: [plan('f1', 'Erreicht', '2026-09-01'), plan('f2', 'Erreicht', '2026-05-01'), plan('f3', 'In Arbeit', '2026-09-05')],
  absences: [absence],
  paths: [path],
  progress: { lp1: { l1: '2026-08-20' } },
  scale: 'grades' as const,
  comment: '  Tolle Saison!  ',
  includeHealth: false,
  from: '2026-07-01',
  to: '2026-10-30',
  today: '2026-10-05',
};

describe('seasonReportRange', () => {
  it('laufende und letzte Saison (Saisonbeginn 1. Juli)', () => {
    expect(seasonReportRange('season', '', '', '2026-10-20')).toEqual({ from: '2026-07-01', to: '2026-10-20' });
    expect(seasonReportRange('previous', '', '', '2026-10-20')).toEqual({ from: '2025-07-01', to: '2026-06-30' });
  });
  it('prüft den eigenen Zeitraum', () => {
    expect(seasonReportRange('custom', '', '', '2026-10-20')).toHaveProperty('error');
    expect(seasonReportRange('custom', '2026-09-01', '2026-08-01', '2026-10-20')).toHaveProperty('error');
    expect(seasonReportRange('custom', '2026-11-01', '2026-11-30', '2026-10-20')).toHaveProperty('error');
    expect(seasonReportRange('custom', '2020-01-01', '2026-10-20', '2026-10-20')).toHaveProperty('error');
    expect(seasonReportRange('custom', '2026-09-01', '2027-01-01', '2026-10-20')).toEqual({ from: '2026-09-01', to: '2026-10-20' });
  });
});

describe('buildSeasonReport', () => {
  const report = buildSeasonReport(base);

  it('zählt nur Termine im Zeitraum und nicht in der Zukunft', () => {
    expect(report.to).toBe('2026-10-05');
    expect(report.attendance.counted).toBe(3);
    expect(report.attendance.took).toBe(2);
    expect(report.attendance.trainings).toBe(1);
    expect(report.attendance.games).toBe(1);
  });

  it('zeigt den Verlauf des Kompetenzprofils je Monat', () => {
    expect(report.months.map((month) => [month.month, month.overall])).toEqual([
      ['2026-08', 4],
      ['2026-09', 2],
    ]);
    expect(report.overall).toBe(3);
  });

  it('nennt nur im Zeitraum erreichte Förderziele', () => {
    expect(report.goals.achieved.map((goal) => goal.focus)).toEqual(['Schwerpunkt f1']);
    expect(report.goals.running).toBe(1);
  });

  it('zeigt Lernpfad-Stufen mit den im Zeitraum bestätigten', () => {
    expect(report.paths).toEqual([{ title: 'Kopfball', done: 1, total: 2, inPeriod: [{ number: 1, title: 'Absprung', date: '2026-08-20' }] }]);
  });

  it('enthält ohne Häkchen keine Gesundheitsdaten, mit Häkchen die Abwesenheiten', () => {
    expect(report.health).toBeNull();
    const html = seasonReportsHtml([report]);
    expect(html).not.toContain('Zerrung');
    const withHealth = buildSeasonReport({ ...base, includeHealth: true });
    expect(withHealth.health).toEqual([{ kind: 'Verletzung', text: 'Verletzung · Zerrung', from: '2026-09-01', to: '2026-09-10' }]);
    expect(seasonReportsHtml([withHealth])).toContain('Zerrung');
  });

  it('übernimmt den Kommentar getrimmt und gekürzt', () => {
    expect(report.comment).toBe('Tolle Saison!');
    expect(buildSeasonReport({ ...base, comment: 'x'.repeat(5000) }).comment).toHaveLength(1500);
  });
});

describe('seasonReportsHtml', () => {
  const html = seasonReportsHtml([buildSeasonReport({ ...base, comment: '<script>alert(1)</script>' }), buildSeasonReport({ ...base, player: { ...player, id: 'p2', name: 'Zweiter' } })], 'logo.png');

  it('enthält keine privaten Trainer-Notizen, Rückmeldungen oder Review-Texte', () => {
    expect(html).not.toContain('PRIVATE-NOTIZ');
    expect(html).not.toContain('RUECKMELDUNG-GEHEIM');
    expect(html).not.toContain('REVIEW-INTERN');
  });

  it('maskiert Nutzertexte und hat keine Inline-Styles', () => {
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/<style|style=/i);
    expect(SEASON_REPORT_CSS).toContain('break-before: page');
  });

  it('hat einen Abschnitt je Spieler', () => {
    expect(html.match(/<section class="player">/g)).toHaveLength(2);
    expect(html).toContain('Zweiter');
  });

  it('meldet fehlende Daten', () => {
    const empty = seasonReportsHtml([buildSeasonReport({ ...base, items: [], plans: [], paths: [], comment: '' })]);
    expect(empty).toContain('Keine Bewertungen im Zeitraum.');
    expect(empty).toContain('kein Förderziel');
    expect(empty).toContain('Kein Kommentar des Trainers.');
  });
});
