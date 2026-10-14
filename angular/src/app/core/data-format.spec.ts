import { inviteEntry, memberEntry } from './access/access';
import { absenceFromDoc, docFromAbsence } from './records/absence';
import { docFromEvent, eventFromDoc } from './events/event';
import { docFromLineup, normalizeLineup } from './lineup/lineup';
import { docFromMeasurement, measurementFromDoc } from './records/measurement';
import { docFromOpponent, opponentFromDoc } from './opponents/opponent';
import { docFromPlan, planFromDoc } from './records/plan';
import { docFromPlayer, playerFromDoc } from './player/player';
import { docFromRating, ratingFromDoc } from './ratings/rating';

/**
 * Datenformat alt ↔ neu (SCRUM-125): Dokumente genau so, wie die bisherige App (outputs/team-manager/app.js, cloudSave*)
 * sie schreibt, gehen durch die Lese- und Schreiblogik der Angular-App. Es dürfen weder Felder verloren gehen noch
 * umbenannt oder in der Bedeutung verändert werden – sonst zeigt die alte App nach einem Rollback falsche Daten.
 * Reine Tests ohne Datenbank; es werden keine echten Daten gelesen oder geschrieben.
 */
describe('Datenformat alte App ↔ Angular', () => {
  const TODAY = '2026-10-14';

  it('Spieler', () => {
    const live = {
      id: 'p1', name: 'Ali Adler', positions: ['ZM', 'DM'], number: 8, birthdate: '2012-03-12', status: 'Verletzt',
      injuryUntil: '2026-11-01', consentStatus: 'granted', consentDate: '2026-09-01',
    };
    expect(docFromPlayer(playerFromDoc('p1', live))).toEqual(live);
  });

  it('Event: Training und Spiel samt Leerwerten', () => {
    const training = {
      id: 'e1', type: 'Training', title: 'Dienstag', date: '2026-10-13', intensity: 3, location: 'Platz 2',
      trainingFocus: 'Passspiel', opponent: '', goalsFor: '', goalsAgainst: '', matchDuration: '', notes: 'Hinweis',
    };
    expect(docFromEvent(eventFromDoc('e1', training))).toEqual(training);
    const match = { ...training, id: 'e2', type: 'Spiel', trainingFocus: '', opponent: 'SV Nord', goalsFor: 3, goalsAgainst: 1, matchDuration: 70 };
    expect(docFromEvent(eventFromDoc('e2', match))).toEqual(match);
    const open = { ...match, goalsFor: '', goalsAgainst: '' };
    expect(docFromEvent(eventFromDoc('e2', open))).toEqual(open);
  });

  it('Bewertung (inkl. Abwesenheits-Automatik und Teilnoten)', () => {
    const live = {
      attendance: 'present', grade: 2, effort: 2, technique: 3, tactics: 2, comprehension: 2, minutes: 60, goals: 1, assists: 0, note: 'stark',
    };
    const written = docFromRating(ratingFromDoc(live));
    expect(written).toMatchObject({ ...live, grade: expect.anything() });
    for (const key of Object.keys(live)) expect(written, `Feld ${key} fehlt`).toHaveProperty(key);
    const auto = { attendance: 'absent', grade: '', effort: '', technique: '', tactics: '', comprehension: '', minutes: '', goals: '', assists: '', note: '', autoAbsence: true };
    expect(docFromRating(ratingFromDoc(auto))).toMatchObject({ attendance: 'absent', autoAbsence: true });
  });

  it('Förderplan', () => {
    const live = {
      id: 'f1', playerId: 'p1', focus: 'Linker Fuß', goal: 'Sicher passen', actions: 'Übung A', selfReflection: 'ok', selfReflectionAt: '2026-10-01',
      coachReview: 'gut', reviewDate: '2026-11-01', status: 'In Arbeit', dueDate: '2026-12-01', createdAt: '2026-09-01',
    };
    const written = docFromPlan(planFromDoc('f1', live, TODAY));
    for (const [key, value] of Object.entries(live)) if (key !== 'playerId') expect(written[key], `Feld ${key}`).toEqual(value);
  });

  it('Abwesenheit und Verletzung', () => {
    const live = { id: 'a1', playerId: 'p1', kind: 'injury', label: 'Zerrung', detail: 'Oberschenkel', from: '2026-10-01', to: '2026-10-20' };
    const written = docFromAbsence(absenceFromDoc('a1', live));
    for (const [key, value] of Object.entries(live)) if (key !== 'playerId') expect(written[key], `Feld ${key}`).toEqual(value);
    const absence = { id: 'a2', playerId: 'p1', kind: 'absence', label: 'Urlaub', detail: '', from: '2026-07-01', to: '' };
    const writtenAbsence = docFromAbsence(absenceFromDoc('a2', absence));
    for (const [key, value] of Object.entries(absence)) if (key !== 'playerId') expect(writtenAbsence[key], `Feld ${key}`).toEqual(value);
  });

  it('Messwert', () => {
    const live = { id: 'm1', playerId: 'p1', date: '2026-09-15', height: '152', weight: '41.5' };
    const written = docFromMeasurement(measurementFromDoc('m1', live, TODAY));
    for (const [key, value] of Object.entries(live)) if (key !== 'playerId') expect(String(written[key]), `Feld ${key}`).toBe(String(value));
  });

  it('Gegner', () => {
    const live = {
      id: 'o1', name: 'SV Nord', formation: '4-3-3', style: 'Pressing', strengths: 'Tempo', weaknesses: 'Standards', keyPlayers: '#9',
      setPieces: 'Ecke kurz', gamePlan: 'Konter', notes: 'Rasen', updatedAt: '2026-10-10',
    };
    expect(docFromOpponent(opponentFromDoc('o1', live))).toEqual(live);
  });

  it('Aufstellung: Zonen bleiben gleich, die Spiel-Aufstellungen (byEvent) der alten App werden nicht angefasst', () => {
    const live = { assignments: { TW: ['p1'], IV: ['p2', 'p3'], ST: ['p4'] }, byEvent: { e1: { assignments: { TW: ['p1'] } } } };
    const written = docFromLineup(normalizeLineup(live));
    expect(written['assignments']).toMatchObject({ TW: ['p1'], IV: ['p2', 'p3'], ST: ['p4'] });
    // Angular schreibt nur `assignments` (mit merge, siehe LineupApi); `byEvent` darf nie im Schreibdokument stehen.
    expect(Object.keys(written)).toEqual(['assignments']);
  });

  it('Zugänge: Mitgliedschaften und Einladungen der alten App werden richtig gelesen', () => {
    const timestamp = (iso: string) => ({ toDate: () => new Date(iso) });
    const member = { role: 'parent', playerId: 'p1', claimedInviteCode: 'abc', expiresAt: timestamp('2027-01-01T00:00:00Z'), createdAt: timestamp('2026-10-01T00:00:00Z') };
    expect(memberEntry({ id: 'u1', data: member })).toMatchObject({ kind: 'member', role: 'parent', playerId: 'p1' });
    const scout = { role: 'medical', createdAt: timestamp('2026-10-01T00:00:00Z') };
    expect(memberEntry({ id: 'u2', data: scout })).toMatchObject({ role: 'medical', email: '' });
    expect(memberEntry({ id: 'u3', data: { role: 'trainer' } })).toBeNull();
    const invite = { playerId: 'p1', role: 'player', expiresAt: null, createdAt: timestamp('2026-10-01T00:00:00Z') };
    expect(inviteEntry({ id: 'code1', data: invite })).toMatchObject({ kind: 'invite', role: 'player', playerId: 'p1', expiresAt: null });
  });
});
