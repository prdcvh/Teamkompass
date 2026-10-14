import { describe, expect, it } from 'vitest';
import { buildExport, exportFileName, revokedPlayers } from './export';
import { type TeamEvent } from './event';
import { type Opponent } from './opponent';
import type { Player } from './player/player';
import { BLANK_RATING, type Rating } from './rating';
import type { DevelopmentPlan } from './records/plan';

const player = (id: string, name: string, consentStatus: Player['consentStatus'] = 'granted'): Player => ({
  id,
  name,
  positions: ['ST'],
  number: 9,
  birthdate: '2012-02-05',
  status: 'Fit',
  injuryUntil: '',
  consentStatus,
  consentDate: '',
});
const event = (id: string, title: string, date: string) => ({ id, title, date, type: 'Training', intensity: 2, location: '', trainingFocus: '', opponent: '', goalsFor: null, goalsAgainst: null, matchDuration: null, notes: '' }) as TeamEvent;

describe('buildExport', () => {
  const rating: Rating = { ...BLANK_RATING, attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, note: 'gut' };
  const input = {
    teamId: 'U14',
    now: new Date('2026-10-12T20:00:00Z'),
    players: [player('p1', 'Ali'), player('p2', 'Ben')],
    events: [event('e2', 'Später', '2026-10-05'), event('e1', 'Früher', '2026-10-01')],
    ratings: new Map([['e1', new Map([['p1', rating]])]]),
    plans: new Map([['p1', [{ id: 'f1', focus: 'Kopfball' } as DevelopmentPlan]]]),
    absences: new Map(),
    measurements: new Map(),
    opponents: [{ id: 'o2', name: 'Zeta' } as Opponent, { id: 'o1', name: 'Alpha' } as Opponent],
  };

  it('enthält Spieler, Events (älteste zuerst) mit ihren Bewertungen, Pläne und Gegner (alphabetisch)', () => {
    const data = buildExport(input);
    expect(data.app).toBe('TeamKompass');
    expect(data.teamId).toBe('U14');
    expect(data.exportedAt).toBe('2026-10-12T20:00:00.000Z');
    expect(data.players.map((entry) => entry['name'])).toEqual(['Ali', 'Ben']);
    expect(data.events.map((entry) => entry['id'])).toEqual(['e1', 'e2']);
    expect(Object.keys(data.events[0]['ratings'] as object)).toEqual(['p1']);
    expect(data.events[1]['ratings']).toEqual({});
    expect(data.developmentPlans['p1'][0]['focus']).toBe('Kopfball');
    expect(data.developmentPlans['p2']).toBeUndefined();
    expect(data.opponents.map((entry) => entry['name'])).toEqual(['Alpha', 'Zeta']);
  });

  it('lässt interne Trainer-Notizen weg', () => {
    expect(JSON.stringify(buildExport(input))).not.toContain('privateNotes');
  });

  it('kann als JSON geschrieben werden', () => {
    expect(() => JSON.parse(JSON.stringify(buildExport(input)))).not.toThrow();
  });
});

describe('exportFileName', () => {
  it('nennt den lokalen Kalendertag', () => {
    expect(exportFileName(new Date(2026, 9, 3, 23, 30))).toBe('teamkompass-export-2026-10-03.json');
  });
});

describe('revokedPlayers', () => {
  it('nennt nur Spieler mit widerrufener Einwilligung', () => {
    const players = [player('p1', 'Ali', 'revoked'), player('p2', 'Ben', 'pending'), player('p3', 'Cem', 'granted')];
    expect(revokedPlayers(players).map((entry) => entry.name)).toEqual(['Ali']);
  });
});
