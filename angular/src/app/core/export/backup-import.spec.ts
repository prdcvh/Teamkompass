/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type CurrentIds, backupOperations, isBackupId, overwriteCount, parseBackup, summarizeBackup, summaryLines, validateBackup } from './backup-import';
import { buildExport } from './export';
import type { TeamEvent } from '../events/event';
import type { Opponent } from '../opponents/opponent';
import type { Player } from '../player/player';
import { BLANK_RATING } from '../ratings/rating';
import type { DevelopmentPlan } from '../records/plan';

const TODAY = '2026-10-15';

/** Der Einspiel-Kern der bisherigen App (outputs/team-manager/app.js), unverändert aus der Quelldatei geladen. */
function liveBackupApi(): {
  validateBackupData: (raw: unknown) => { ok: boolean; error?: string };
  summarizeBackupImport: (current: unknown, incoming: unknown) => Record<string, unknown>;
  backupCloudOperations: (incoming: unknown) => { path: string[]; data: Record<string, unknown>; merge: boolean }[];
} {
  const source = readFileSync(resolve(process.cwd(), '../outputs/team-manager/app.js'), 'utf8');
  const block = source.split('// BACKUP-IMPORT START')[1].split('\n').slice(1).join('\n').split('// BACKUP-IMPORT END')[0];
  return new Function(`${block}\nreturn { validateBackupData, summarizeBackupImport, backupCloudOperations };`)();
}

/** Eine Sicherung so, wie die bisherige App sie schreibt (JSON.stringify(state)): inkl. Startelf, privateNotes und Ergänzungen. */
const liveBackup = () => ({
  players: [
    { id: 'p1', name: 'Ali Adler', positions: ['ZM', 'DM'], number: 8, birthdate: '2012-03-12', status: 'Verletzt', injuryUntil: '2026-11-01', consentStatus: 'granted', consentDate: '2026-09-01' },
    { id: 'p2', name: 'Ben Berg', positions: ['IV'], number: 4, birthdate: '2012-11-06', status: 'Fit', injuryUntil: '', consentStatus: 'pending', consentDate: '' },
  ],
  events: [
    {
      id: 'e1', type: 'Spiel', title: 'Spiel gegen Eppstein', date: '2026-09-01', intensity: 3, location: 'Platz 1', trainingFocus: '', opponent: 'SG Eppstein',
      goalsFor: 3, goalsAgainst: 1, matchDuration: 70, notes: '',
      ratings: { p1: { attendance: 'present', grade: 2, effort: 2, technique: 2, tactics: 2, comprehension: 2, minutes: 70, goals: 1, assists: '', note: 'stark' } },
      privateNotes: { p1: 'intern: Gespräch nötig' },
    },
    { id: 'e2', type: 'Training', title: 'Dienstag', date: '2026-09-02', intensity: 2, location: '', trainingFocus: 'Umschalten', opponent: '', goalsFor: '', goalsAgainst: '', matchDuration: '', notes: '', ratings: {}, privateNotes: {} },
  ],
  developmentPlans: { p1: [{ id: 'd1', focus: 'Kopfball', goal: 'Mehr Tore', actions: '', selfReflection: '', selfReflectionAt: '', coachReview: '', reviewDate: '', status: 'Offen', dueDate: '', createdAt: '2026-09-01' }], p2: [] },
  absences: { p1: [{ id: 'a1', kind: 'injury', label: 'Verletzung', detail: 'Knie', from: '2026-09-20', to: '' }], p2: [] },
  measurements: { p1: [{ id: 'm1', date: '2026-09-01', height: '151', weight: '40' }], p2: [] },
  opponents: [{ id: 'o1', name: 'SG Eppstein', formation: '4-4-2', style: 'Pressing', strengths: '', weaknesses: '', keyPlayers: '', setPieces: '', gamePlan: '', notes: '', updatedAt: '2026-10-01' }],
  lineup: { assignments: { TW: ['p2'], IV: ['p1', 'unbekannt'] } },
  eventLineups: {},
  selectedEventId: 'e1',
});

const noCurrent = (): CurrentIds => ({
  players: new Set(), events: new Set(), opponents: new Set(), developmentPlans: new Map(), absences: new Map(), measurements: new Map(),
});

describe('Sicherung einspielen: Dateiprüfung', () => {
  it('nimmt eine Sicherung der bisherigen App an', () => {
    expect(validateBackup(liveBackup()).ok).toBe(true);
  });

  it('lehnt fremde oder kaputte Dateien ab (gleiche Fälle wie die bisherige App)', () => {
    const bad: unknown[] = [
      null, [], 'x', {}, { players: [], events: [] }, { players: [{ id: 'p1' }], events: [] },
      { players: [{ id: '../x', name: 'A' }], events: [] },
      { players: [{ id: 'p1', name: 'A' }], events: [{ id: '__proto__/x' }] },
      { players: [{ id: 'p1', name: 'A' }], events: [{ id: 'e1', ratings: { 'a/b': {} } }] },
      { players: [{ id: '__a__', name: 'A' }], events: [] },
      { players: [{ id: 'p1', name: 'A' }], events: [{ id: 'e1', ratings: { p1: null } }] },
      { players: [{ id: 'p1', name: 'A' }], events: [{ id: 'e1', privateNotes: { p1: 5 } }] },
      { players: [{ id: 'p1', name: 'A' }], events: [], absences: { p1: 'kaputt' } },
      { players: [{ id: 'p1', name: 'A' }], events: [], measurements: { p1: [{ id: 'a/b' }] } },
      { players: [{ id: 'p1', name: 'A' }], events: [], opponents: [{ id: '..' }] },
    ];
    const live = liveBackupApi();
    for (const raw of bad) {
      expect(validateBackup(raw).ok, JSON.stringify(raw)).toBe(false);
      expect(live.validateBackupData(raw).ok, JSON.stringify(raw)).toBe(false);
    }
  });

  it('erlaubt nur sichere Kennungen', () => {
    expect(['p1', 'abc-1_2.x', 'a'.repeat(128)].every(isBackupId)).toBe(true);
    expect(['', '.', '..', 'a/b', '__x__', 'a'.repeat(129), 5, null].some(isBackupId)).toBe(false);
  });
});

describe('Sicherung einspielen: Zusammenfassung und Schreibliste', () => {
  const backup = () => parseBackup(liveBackup(), TODAY);

  it('zählt neu und überschrieben getrennt', () => {
    const current: CurrentIds = {
      ...noCurrent(),
      players: new Set(['p1', 'andere']),
      events: new Set(['e2']),
      developmentPlans: new Map([['p1', new Set(['d1'])]]),
    };
    const summary = summarizeBackup(current, backup());
    expect(summary.players).toEqual({ created: 1, overwritten: 1 });
    expect(summary.events).toEqual({ created: 1, overwritten: 1 });
    expect(summary.ratings).toBe(1);
    expect(summary.plans).toEqual({ created: 0, overwritten: 1 });
    expect(summary.absences).toEqual({ created: 1, overwritten: 0 });
    expect(summary.measurements).toEqual({ created: 1, overwritten: 0 });
    expect(summary.lineup).toBe(true);
    expect(overwriteCount(summary)).toBe(3);
    expect(summaryLines(summary)).toContain('Spieler: 1 neu, 1 werden aktualisiert');
    expect(summaryLines(summary)).toContain('Bewertungen in den Events: 1');
  });

  it('schreibt nur Dokumente aus der Datei und löscht nichts', () => {
    const ops = backupOperations(backup());
    const paths = ops.map((op) => op.path.join('/'));
    expect(paths).toEqual([
      'players/p1', 'players/p2', 'events/e1', 'events/e1/ratings/p1', 'events/e1/privateNotes/p1', 'events/e2',
      'players/p1/developmentPlans/d1', 'players/p1/absences/a1', 'players/p1/measurements/m1', 'opponents/o1', 'meta/lineup',
    ]);
    expect(ops.find((op) => op.path.join('/') === 'events/e1/ratings/p1')!.data['playerId']).toBe('p1');
    expect(ops.find((op) => op.path.join('/') === 'events/e1/privateNotes/p1')!.data).toEqual({ playerId: 'p1', note: 'intern: Gespräch nötig' });
  });

  it('übernimmt die Startelf nur mit bekannten Spielern, führt sie zusammen und lässt eine leere weg', () => {
    const ops = backupOperations(backup());
    const lineup = ops.find((op) => op.path.join('/') === 'meta/lineup')!;
    expect(lineup.merge).toBe(true);
    expect((lineup.data['assignments'] as Record<string, string[]>)['IV']).toEqual(['p1']);
    const empty = parseBackup({ ...liveBackup(), lineup: { assignments: { TW: [] } } }, TODAY);
    expect(empty.lineup).toBeNull();
    expect(backupOperations(empty).some((op) => op.path[0] === 'meta')).toBe(false);
  });

  it('verwirft Förderpläne von Spielern, die nicht in der Datei stehen, und vergibt fehlende Kennungen', () => {
    const raw = { ...liveBackup(), developmentPlans: { p1: [{ focus: 'ohne Kennung' }], fremd: [{ id: 'x1', focus: 'weg' }] } };
    const parsed = parseBackup(raw, TODAY, () => 'neu');
    expect(Object.keys(parsed.developmentPlans)).toEqual(['p1']);
    expect(parsed.developmentPlans['p1'][0]['id']).toBe('dpneu');
  });

  it('ältere Felder der bisherigen App kommen sauber an (Messwerte als Text, Gesamtnote)', () => {
    const raw = { ...liveBackup(), events: [{ ...liveBackup().events[0], ratings: { p1: { attendance: 'present', grade: 3, note: '' } } }] };
    const rating = parseBackup(raw, TODAY).events[0].ratings['p1'];
    expect(rating['effort']).toBe(3);
    expect(parseBackup(liveBackup(), TODAY).players[0]['positions']).toEqual(['ZM', 'DM']);
  });
});

describe('Sicherung einspielen: Live-App und Angular gegenseitig', () => {
  const player = (id: string, name: string): Player => ({ id, name, positions: ['ST'], number: 9, birthdate: '2012-02-05', status: 'Fit', injuryUntil: '', consentStatus: 'granted', consentDate: '' });
  const event = (id: string, title: string): TeamEvent =>
    ({ id, title, date: '2026-09-01', type: 'Training', intensity: 2, exertion: 5, location: '', trainingFocus: 'Umschalten', opponent: '', goalsFor: null, goalsAgainst: null, matchDuration: null, notes: '' }) as TeamEvent;
  const angularExport = () =>
    JSON.parse(
      JSON.stringify(
        buildExport({
          teamId: 'U14',
          now: new Date('2026-10-15T20:00:00Z'),
          players: [player('p1', 'Ali'), player('p2', 'Ben')],
          events: [event('e1', 'Dienstag')],
          ratings: new Map([['e1', new Map([['p1', { ...BLANK_RATING, attendance: 'present' as const, effort: 2, technique: 3, tactics: 2, comprehension: 2, note: 'gut' }]])]]),
          plans: new Map([['p1', [{ id: 'f1', focus: 'Kopfball', goal: '', actions: '', selfReflection: '', selfReflectionAt: '', coachReview: '', reviewDate: '', status: 'Offen', dueDate: '', createdAt: '2026-09-01' } as DevelopmentPlan]]]),
          absences: new Map([['p1', [{ id: 'a1', kind: 'absence' as const, label: 'Urlaub', detail: '', from: '2026-10-01', to: '2026-10-10' }]]]),
          measurements: new Map([['p2', [{ id: 'm1', date: '2026-09-01', height: 150, weight: 40 }]]]),
          opponents: [{ id: 'o1', name: 'SG Eppstein', formation: '4-4-2', style: 'Pressing', strengths: '', weaknesses: '', keyPlayers: '', setPieces: '', gamePlan: '', notes: '', updatedAt: '2026-10-01' } as Opponent],
        }),
      ),
    );

  it('Live → Angular: eine Sicherung der bisherigen App lässt sich vollständig einspielen', () => {
    const raw = liveBackup();
    expect(validateBackup(raw).ok).toBe(true);
    const ops = backupOperations(parseBackup(raw, TODAY));
    expect(ops.find((op) => op.path.join('/') === 'players/p1')!.data).toEqual(raw.players[0]);
    expect(ops.find((op) => op.path.join('/') === 'events/e1')!.data).toMatchObject({ id: 'e1', title: 'Spiel gegen Eppstein', goalsFor: 3, matchDuration: 70 });
    expect(ops.find((op) => op.path.join('/') === 'players/p1/measurements/m1')!.data).toMatchObject({ height: '151', weight: '40', playerId: 'p1' });
  });

  it('Angular → Live: die Sicherung dieser App besteht die Prüfung der bisherigen App', () => {
    const exported = angularExport();
    expect(liveBackupApi().validateBackupData(exported)).toEqual({ ok: true });
    expect(validateBackup(exported).ok).toBe(true);
  });

  it('Angular → Angular und Live: gleiche Schreibliste (Pfade, Felder, merge) wie die bisherige App', () => {
    const exported = angularExport();
    const live = liveBackupApi();
    const liveOps = live.backupCloudOperations({ ...exported, lineup: { assignments: {} } });
    const ours = backupOperations(parseBackup(exported, TODAY));
    expect(ours.map((op) => op.path.join('/'))).toEqual(liveOps.map((op) => op.path.join('/')));
    for (const [index, op] of ours.entries()) {
      expect(op.data, op.path.join('/')).toEqual(liveOps[index].data);
      expect(op.merge, op.path.join('/')).toBe(liveOps[index].merge);
    }
  });

  it('das Einspielen ist wiederholbar: gleiche Sicherung zweimal ergibt dieselben Dokumente', () => {
    const exported = angularExport();
    const first = backupOperations(parseBackup(exported, TODAY));
    const again = backupOperations(parseBackup(JSON.parse(JSON.stringify(exported)), TODAY));
    expect(again).toEqual(first);
    const summary = summarizeBackup(
      { ...noCurrent(), players: new Set(['p1', 'p2']), events: new Set(['e1']), opponents: new Set(['o1']), developmentPlans: new Map([['p1', new Set(['f1'])]]) },
      parseBackup(exported, TODAY),
    );
    expect(summary.players).toEqual({ created: 0, overwritten: 2 });
    expect(summary.plans).toEqual({ created: 0, overwritten: 1 });
  });
});
