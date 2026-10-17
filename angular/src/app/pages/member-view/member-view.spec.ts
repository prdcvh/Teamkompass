import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LayoutService } from '../../core/shell/layout.service';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { MemberView } from './member-view';

describe('MemberView (Ansicht für Spieler, Eltern und Medizin)', () => {
  let firebase: FakeFirebase;

  const grades = (grade: number, extra: Record<string, unknown> = {}) => ({ attendance: 'present', effort: grade, technique: grade, tactics: grade, comprehension: grade, ...extra });

  async function render(role: Role, options: { playerId?: string | null; mutate?: (firebase: FakeFirebase) => void } = {}) {
    const playerId = options.playerId === undefined ? 'p1' : options.playerId;
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'granted' });
    firebase.players.players.set('p2', { name: 'Elias Wagner', positions: ['RV'], number: 2, birthdate: '2012-06-06', status: 'Verletzt', injuryUntil: '2026-12-01' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-09-01', intensity: 2, notes: 'Interne Planung' });
    firebase.events.events.set('e2', { type: 'Spiel', title: 'Heimspiel', date: '2026-09-08', goalsFor: 3, goalsAgainst: 1 });
    firebase.ratings.ratings.set('e1', new Map([['p1', grades(3, { playerId: 'p1' })], ['p2', grades(5, { playerId: 'p2', note: 'Nur für Elias' })]]));
    firebase.ratings.ratings.set('e2', new Map([['p1', grades(1, { playerId: 'p1', note: 'Starkes Spiel', goals: 2, assists: 1 })]]));
    firebase.ratings.privateNotes.set('e2', new Map([['p1', { playerId: 'p1', note: 'GEHEIME Trainernotiz' }]]));
    firebase.records.playerRecords.set('p1/developmentPlans', new Map([['dp1', { focus: 'Orientierung', goal: 'Blick heben', status: 'In Arbeit', createdAt: '2026-09-01', selfReflection: '', coachReview: 'Gut dran' }]]));
    firebase.records.playerRecords.set('p1/absences', new Map([['ab1', { kind: 'absence', label: 'Schule', from: '2026-09-01', to: '2026-09-02', playerId: 'p1' }]]));
    firebase.records.playerRecords.set('p1/measurements', new Map([['me1', { date: '2026-07-01', height: '150', weight: '40', playerId: 'p1' }]]));
    firebase.records.playerRecords.set('p2/absences', new Map([['ab2', { kind: 'injury', label: 'Zerrung', from: '2026-09-01', to: '2026-12-01', playerId: 'p2' }]]));
    // Spieler und Eltern dürfen wie in den Regeln nur ihr eigenes Spielerdokument lesen.
    if (role === 'player' || role === 'parent') firebase.players.readablePlayerDocs = new Set(playerId ? [playerId] : []);
    options.mutate?.(firebase);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile: signal(false) } }],
    });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.playerId.set(playerId);
    const fixture = TestBed.createComponent(MemberView);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.header, .notice, .empty')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const text = (fixture: { nativeElement: unknown }, selector?: string) => {
    const element = selector ? root(fixture).querySelector(selector) : root(fixture);
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  };

  async function settled(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }, check: () => void) {
    await vi.waitFor(() => {
      TestBed.tick();
      fixture.detectChanges();
      check();
    });
  }

  describe('Spieler', () => {
    it('zeigt nur das eigene Profil mit eigenen Bewertungen und Rückmeldungen', async () => {
      const fixture = await render('player');
      await settled(fixture, () => expect(text(fixture)).toContain('Starkes Spiel'));
      expect(text(fixture, 'h1')).toBe('Mein Profil');
      expect(text(fixture, '.who strong')).toBe('Jonas Keller');
      expect(text(fixture, '.grade strong')).toBe('2,0');
      expect(root(fixture).querySelector('select')).toBeNull();
      // Nichts von anderen Spielern oder internen Notizen.
      expect(text(fixture)).not.toContain('Elias');
      expect(text(fixture)).not.toContain('Nur für Elias');
      expect(text(fixture)).not.toContain('GEHEIME');
      expect(text(fixture)).not.toContain('Interne Planung');
      expect(text(fixture)).not.toContain('Belastungsindikator');
      expect(text(fixture)).not.toContain('Schnitt der 3 Wochen davor');
    });

    it('liest nur das eigene Dokument und eigene Daten, nie Kader, Notizen, Gegner oder Aufstellung', async () => {
      const fixture = await render('player');
      await settled(fixture, () => expect(text(fixture)).toContain('Starkes Spiel'));
      const calls = firebase.calls;
      expect(calls).toContain('watchPlayerDoc:p1');
      expect(calls).not.toContain('watchPlayers');
      expect(calls.filter((call) => call.startsWith('watchPrivateNotes') || call.startsWith('watchRatings:'))).toEqual([]);
      expect(calls).not.toContain('watchOpponents');
      expect(calls).not.toContain('watchLineup');
      expect(calls.filter((call) => call.startsWith('watchRatingDoc:')).every((call) => call.endsWith(':p1'))).toBe(true);
      // Zusatzdaten nur gefiltert auf die eigene playerId (verlangen die Regeln für Listenabfragen).
      for (const kind of ['developmentPlans', 'absences', 'measurements']) expect(calls).toContain(`ownOnly:p1:${kind}`);
    });

    it('zeigt Förderplan, Abwesenheit und Messwerte; die Selbstreflexion lässt sich speichern', async () => {
      const fixture = await render('player');
      await settled(fixture, () => expect(text(fixture)).toContain('Orientierung'));
      expect(text(fixture)).toContain('Blick heben');
      expect(text(fixture)).toContain('Trainerreview: Gut dran');
      expect(text(fixture)).toContain('Schule');
      expect(text(fixture)).toContain('01.07.2026');

      const area = root(fixture).querySelector('textarea') as HTMLTextAreaElement;
      area.value = 'Ich achte mehr auf den Blick.';
      area.dispatchEvent(new Event('input'));
      const save = [...root(fixture).querySelectorAll('button')].find((button) => button.textContent?.includes('Reflexion speichern')) as HTMLButtonElement;
      save.click();
      await vi.waitFor(() => expect(firebase.calls).toContain('saveSelfReflection:p1:dp1'));
      expect(firebase.records.playerRecords.get('p1/developmentPlans')?.get('dp1')?.['selfReflection']).toBe('Ich achte mehr auf den Blick.');
    });

    it('hat keine Schaltflächen zum Ändern von Plänen, Abwesenheiten oder Messwerten', async () => {
      const fixture = await render('player');
      await settled(fixture, () => expect(text(fixture)).toContain('Orientierung'));
      const labels = [...root(fixture).querySelectorAll('button')].map((button) => button.textContent?.trim());
      expect(labels.some((label) => /Bearbeiten|Löschen|\+ /.test(label ?? ''))).toBe(false);
    });

    it('bietet Abmelden an und verlinkt nicht in Trainer-Bereiche', async () => {
      const fixture = await render('player');
      const links = [...root(fixture).querySelectorAll('a')].map((link) => link.getAttribute('href'));
      expect(links).toEqual(['/abmelden']);
    });

    it('meldet einen Fehler, wenn das Profil nicht gelesen werden darf', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const fixture = await render('player', { mutate: (f) => (f.players.readablePlayerDocs = new Set(['p2'])) });
      expect(text(fixture, '.notice')).toContain('Kader konnte nicht geladen werden');
      expect(text(fixture)).not.toContain('Jonas Keller');
    });

    it('zeigt einen Hinweis, wenn kein Spielerprofil verknüpft ist, und lädt nichts', async () => {
      const fixture = await render('player', { playerId: null });
      expect(text(fixture, '.empty')).toContain('kein Spielerprofil verknüpft');
      // Nur der teamweite Pausen-Hinweis (SCRUM-150) wird gelesen, nichts aus Profil oder Bewertungen.
      expect(firebase.calls.filter((call) => call.startsWith('watch') && call !== 'watchBreaks')).toEqual([]);
    });

    it('zeigt ein nicht (mehr) vorhandenes Profil verständlich an', async () => {
      const fixture = await render('player', { mutate: (f) => f.players.players.delete('p1') });
      expect(text(fixture, '.empty')).toContain('nicht gefunden');
    });
  });

  describe('Eltern', () => {
    it('sehen das Profil des Kindes nur lesend (keine Selbstreflexion)', async () => {
      const fixture = await render('parent');
      await settled(fixture, () => expect(text(fixture)).toContain('Orientierung'));
      expect(text(fixture, 'h1')).toBe('Profil von Jonas Keller');
      expect(text(fixture)).toContain('Starkes Spiel');
      expect(root(fixture).querySelector('textarea')).toBeNull();
      expect(text(fixture)).not.toContain('Elias');
      expect(firebase.calls).not.toContain('watchPlayers');
    });
  });

  describe('Medizin', () => {
    it('sieht Spieler mit Status, Abwesenheiten und Messwerten – ohne Noten, Bewertungen und Förderpläne', async () => {
      const fixture = await render('medical', { playerId: null });
      await settled(fixture, () => expect(text(fixture)).toContain('Schule'));
      expect(text(fixture, 'h1')).toBe('Scout-Ansicht');
      expect(text(fixture, '.who strong')).toBe('Jonas Keller');
      expect(root(fixture).querySelector('.grade')).toBeNull();
      expect(root(fixture).querySelector('.chart')).toBeNull();
      expect(text(fixture)).not.toContain('Förderpläne');
      expect(text(fixture)).not.toContain('Starkes Spiel');
      expect(text(fixture)).toContain('01.07.2026');
      const calls = firebase.calls;
      expect(calls.filter((call) => call.startsWith('watchRatingDoc') || call.startsWith('watchRatings') || call.startsWith('watchPrivateNotes'))).toEqual([]);
      expect(calls.filter((call) => call.includes('developmentPlans'))).toEqual([]);
      expect(calls).toContain('watchPlayerRecords:p1:absences');
      expect(calls).toContain('watchPlayerRecords:p1:measurements');
    });

    it('wechselt den Spieler über die Auswahl', async () => {
      const fixture = await render('medical', { playerId: null });
      await settled(fixture, () => expect(text(fixture)).toContain('Schule'));
      const select = root(fixture).querySelector('select') as HTMLSelectElement;
      select.value = 'p2';
      select.dispatchEvent(new Event('change'));
      await settled(fixture, () => expect(text(fixture)).toContain('Zerrung'));
      expect(text(fixture, '.who strong')).toBe('Elias Wagner');
      expect(text(fixture)).toContain('Verletzt');
      expect(text(fixture)).not.toContain('Schule');
    });
  });
});
