import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { PlayerViewMode } from './player-view-mode';

describe('PlayerViewMode: Übernahme bestehender Bewertungen (SCRUM-115)', () => {
  let firebase: FakeFirebase;

  function setup(options: { marker?: Record<string, unknown> | null; markerError?: unknown; writeError?: unknown; role?: 'trainer' | 'player' } = {}) {
    firebase = new FakeFirebase();
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-10-01' });
    firebase.events.events.set('e2', { type: 'Spiel', title: 'Spiel', date: '2026-10-05' });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, grade: 2, note: 'Kommentar', playerId: 'p1' }]]));
    firebase.ratings.ratings.set('e2', new Map([['p1', { attendance: 'present', grade: 3, minutes: 50, goals: 1, playerId: 'p1' }], ['p2', { attendance: 'absent', playerId: 'p2' }]]));
    if (options.marker !== undefined) firebase.playerView.marker = options.marker;
    firebase.playerView.markerError = options.markerError ?? null;
    firebase.playerView.writeError = options.writeError ?? null;
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(options.role ?? 'trainer');
    const mode = TestBed.inject(PlayerViewMode);
    TestBed.tick();
    return mode;
  }

  it('ohne Kennzeichen: legt einmalig alle Kopien an, ohne die Bewertungen zu verändern, danach „fertig“', async () => {
    const mode = setup({ marker: null });
    const before = structuredClone([...firebase.ratings.ratings].map(([id, map]) => [id, [...map]]));
    await vi.waitFor(() => expect(mode.state()).toBe('on'));
    expect(firebase.calls).toContain('writePlayerViewCopies:3');
    expect(firebase.ratings.values.get('e2')?.get('p1')).toEqual({ playerId: 'p1', attendance: 'present', minutes: 50, goals: 1, assists: '' });
    // Alte Bewertung mit nur einer Gesamtnote: Teilnoten werden übernommen, nichts geht verloren.
    expect(firebase.ratings.grades.get('e2')?.get('p1')).toMatchObject({ effort: 3, technique: 3, tactics: 3, comprehension: 3 });
    expect(firebase.ratings.grades.get('e1')?.get('p1')?.['note']).toBeUndefined();
    expect(firebase.ratings.values.get('e2')?.get('p2')?.['attendance']).toBe('absent');
    // Die vollständigen Bewertungen bleiben unverändert (kein Datenverlust).
    expect([...firebase.ratings.ratings].map(([id, map]) => [id, [...map]])).toEqual(before);
    // Keine automatische Freigabe (PO, 02.11.2026).
    expect(firebase.gradeReleases.releases.size).toBe(0);
  });

  it('mit Kennzeichen: keine Übernahme', async () => {
    const mode = setup();
    await vi.waitFor(() => expect(mode.state()).toBe('on'));
    expect(firebase.calls.some((call) => call.startsWith('writePlayerViewCopies'))).toBe(false);
  });

  it('Regeln kennen die Kopien noch nicht: Bewertungen werden ohne Kopien gespeichert', async () => {
    const mode = setup({ markerError: Object.assign(new Error('denied'), { code: 'permission-denied' }) });
    await vi.waitFor(() => expect(mode.state()).toBe('denied'));
    expect(await mode.writesCopies()).toBe(false);
    expect(firebase.calls.some((call) => call.startsWith('writePlayerViewCopies'))).toBe(false);
  });

  it('Spieler und Eltern lesen das Kennzeichen nicht', () => {
    setup({ role: 'player', marker: null });
    expect(firebase.calls).not.toContain('watchPlayerViewMarker');
    expect(firebase.calls.some((call) => call.startsWith('writePlayerViewCopies'))).toBe(false);
  });

  it('schlägt die Übernahme fehl, bleibt sie wiederholbar (kein Kennzeichen)', async () => {
    const mode = setup({ marker: null, writeError: new Error('offline') });
    await vi.waitFor(() => expect(mode.state()).toBe('error'));
    expect(firebase.playerView.marker).toBeNull();
    // Speichern schreibt die Kopien trotzdem mit.
    expect(await mode.writesCopies()).toBe(true);
  });
});
