import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { LayoutService } from '../../core/shell/layout.service';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { EventRating } from './event-rating';

describe('EventRating (Event bewerten)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);

  async function render(options: { mobile?: boolean; eventId?: string; game?: boolean; consent?: string; lineup?: boolean; role?: 'trainer' | 'medical' } = {}) {
    const { mobile = false, eventId = 'e1', game = true, consent, lineup = false, role = 'trainer' } = options;
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.events.events.set('e1', game
      ? { type: 'Spiel', title: 'Heimspiel', date: '2026-10-10', opponent: 'SV Nord', goalsFor: 3, goalsAgainst: 1, intensity: 3, location: 'Platz 1', matchDuration: 70 }
      : { type: 'Training', title: 'Training Montag', date: '2026-10-05', intensity: 2 });
    firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: 'Elias Wagner', positions: ['RV'], number: 2, birthdate: '2012-06-06', status: 'Fit', ...(consent ? { consentStatus: consent } : {}) });
    firebase.players.players.set('p3', { name: '<b>Jan</b> Braun', positions: ['ST'], number: 9, birthdate: '2013-01-01', status: 'Fit' });
    firebase.ratings.ratings.set('e1', new Map([
      ['p1', { attendance: 'present', effort: 1, technique: 2, tactics: 3, comprehension: 4, grade: 2.3, minutes: 70, goals: 1, assists: '', note: 'Starkes Spiel', playerId: 'p1' }],
      ['p3', { attendance: 'absent', note: 'Verletzt', autoAbsence: true, playerId: 'p3' }],
    ]));
    firebase.ratings.privateNotes.set('e1', new Map([['p1', { playerId: 'p1', note: 'Vertraulich' }]]));
    if (lineup) {
      firebase.lineup.lineup = { assignments: { TW: ['p2'] }, byEvent: { e1: { assignments: { TW: ['p1'], RV: ['p2', 'weg'] }, savedAt: '2026-10-09T10:00:00.000Z' } } };
    }
    const params = new BehaviorSubject(convertToParamMap({ id: eventId }));
    TestBed.configureTestingModule({
      providers: [
        ...provideFakeFirebase(firebase),
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: params } },
      ],
    });
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(EventRating);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.toolbar, .notice, .empty')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);
  const qa = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => [...root(fixture).querySelectorAll<T>(selector)];
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const pick = (select: HTMLSelectElement | HTMLInputElement, value: string) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };

  describe('gespeicherte Aufstellung (SCRUM-122)', () => {
    it('zeigt die Aufstellung des Spiels nur lesend: Formation, Positionen, Bank', async () => {
      const fixture = await render({ lineup: true });
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(q(fixture, '.lineup')).not.toBeNull();
      });
      expect(text(q(fixture, '.lineup h2'))).toBe('Aufstellung 1'); // nur der Verteidiger RV zählt in die Formation (Torwart nicht)
      const block = text(q(fixture, '.lineup'));
      expect(block).toContain('TW 1 Jonas Keller');
      expect(block).toContain('RV 2 Elias Wagner');
      expect(block).toContain('Bank: 9 <b>Jan</b> Braun');
      expect(qa(fixture, '.lineup button, .lineup input, .lineup select')).toHaveLength(0);
      expect(firebase.calls).not.toContain('saveLineup');
      expect(firebase.calls).not.toContain('saveEventLineup');
    });

    it('zeigt nichts, wenn für das Spiel keine Aufstellung gespeichert ist', async () => {
      expect(q(await render(), '.lineup')).toBeNull();
    });

    it('zeigt nichts bei Trainings', async () => {
      expect(q(await render({ lineup: true, game: false }), '.lineup')).toBeNull();
    });

    it('zeigt Nicht-Trainern nichts und lädt die Aufstellung nicht', async () => {
      const medical = await render({ lineup: true, role: 'medical' });
      expect(q(medical, '.lineup')).toBeNull();
      expect(firebase.calls).not.toContain('watchLineup');
    });
  });

  describe('Desktop', () => {
    it('zeigt Kopfzeile, Fortschritt und die Matrix mit Gesamtnote je Spieler', async () => {
      const fixture = await render();
      expect(text(q(fixture, 'h1'))).toBe('Heimspiel');
      expect(text(q(fixture, '.meta'))).toContain('Ergebnis 3:1');
      expect(text(q(fixture, '.meta'))).toContain('70 Min.');
      const rows = qa(fixture, 'tbody tr');
      expect(rows).toHaveLength(3);
      expect(text(rows[0])).toContain('Jonas Keller');
      expect(text(rows[0].querySelector('.grade-total'))).toBe('2,3');
      expect(text(rows[1].querySelector('.grade-total'))).toBe('–');
      expect(text(q(fixture, '.progress-label'))).toBe('2 von 3 Spielern erfasst'); // Jonas mit Note, Jan fehlt
      expect(qa(fixture, 'thead th').map(text)).toContain('Tore');
      expect(q<HTMLInputElement>(fixture, 'input[aria-label="Interne Notiz für Jonas Keller"]')?.value).toBe('Vertraulich');
      expect(q<HTMLInputElement>(fixture, 'input[aria-label="Feedback an Jonas Keller"]')?.value).toBe('Starkes Spiel');
    });

    it('zeigt bei Trainings keine Spielspalten und keine Option „Nicht im Kader“', async () => {
      const fixture = await render({ game: false });
      expect(qa(fixture, 'thead th').map(text)).not.toContain('Tore');
      const options = qa<HTMLOptionElement>(fixture, 'select[aria-label="Anwesenheit: Jonas Keller"] option').map(text);
      expect(options).toEqual(['Offen', 'Anwesend', 'Teilweise', 'Fehlt']);
    });

    it('berechnet die Gesamtnote beim Erfassen der Teilnoten', async () => {
      const fixture = await render();
      pick(q<HTMLSelectElement>(fixture, 'select[aria-label="Anwesenheit: Elias Wagner"]')!, 'present');
      for (const [label, value] of [['Einsatz', '1'], ['Fehlerquote', '1'], ['Entscheidungsfindung', '1'], ['Lernfähigkeit', '2']]) {
        pick(q<HTMLSelectElement>(fixture, `select[aria-label="${label}: Elias Wagner"]`)!, value);
      }
      fixture.detectChanges();
      expect(text(qa(fixture, 'tbody tr')[1].querySelector('.grade-total'))).toBe('1,2'); // 0.3+0.3+0.25+0.3 = 1.15 → 1,2 (Gleitkomma-Rundung wie in der bisherigen App)
    });

    it('färbt die Zeile sofort nach der Anwesenheit ein', async () => {
      const fixture = await render();
      const rows = qa(fixture, 'tbody tr');
      expect(rows.map((row) => row.getAttribute('data-tone'))).toEqual(['green', 'none', 'red']);
      pick(q<HTMLSelectElement>(fixture, 'select[aria-label="Anwesenheit: Elias Wagner"]')!, 'limited');
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr')[1].getAttribute('data-tone')).toBe('amber');
    });

    it('„Fehlt“ löscht die Noten, die Gesamtnote verschwindet', async () => {
      const fixture = await render();
      pick(q<HTMLSelectElement>(fixture, 'select[aria-label="Anwesenheit: Jonas Keller"]')!, 'absent');
      fixture.detectChanges();
      expect(text(qa(fixture, 'tbody tr')[0].querySelector('.grade-total'))).toBe('–');
      await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'absent', effort: '', grade: '', minutes: '' }));
    });

    it('speichert Feedback sichtbar und interne Notiz getrennt', async () => {
      const fixture = await render();
      pick(q<HTMLInputElement>(fixture, 'input[aria-label="Feedback an Elias Wagner"]')!, 'Gute Laufwege');
      pick(q<HTMLInputElement>(fixture, 'input[aria-label="Interne Notiz für Elias Wagner"]')!, 'Gespräch nötig');
      await vi.waitFor(() => {
        expect(firebase.ratings.ratings.get('e1')?.get('p2')?.['note']).toBe('Gute Laufwege');
        expect(firebase.ratings.privateNotes.get('e1')?.get('p2')?.['note']).toBe('Gespräch nötig');
      });
      expect(JSON.stringify([...firebase.ratings.ratings.get('e1')!.values()])).not.toContain('Gespräch nötig');
    });

    it('filtert nach „Nur anwesend“ und „Nur fehlend“', async () => {
      const fixture = await render();
      const view = q<HTMLSelectElement>(fixture, '.toolbar select')!;
      pick(view, 'present');
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr')).toHaveLength(1);
      pick(view, 'missing');
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr').map((row) => text(row))).toEqual(expect.arrayContaining([expect.stringContaining('Elias Wagner'), expect.stringContaining('Braun')]));
      expect(qa(fixture, 'tbody tr')).toHaveLength(2);
    });

    it('maskiert Spielernamen (keine unmaskierte HTML-Ausgabe)', async () => {
      const fixture = await render();
      expect(root(fixture).querySelector('tbody b')).toBeNull();
      expect(text(root(fixture).querySelector('tbody'))).toContain('<b>Jan</b> Braun');
    });

    it('meldet ein unbekanntes Event', async () => {
      const fixture = await render({ eventId: 'gibt-es-nicht' });
      expect(text(q(fixture, '.empty'))).toContain('Dieses Event gibt es nicht');
    });

    it('zeigt Ladefehler mit „Erneut versuchen“', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      isMobile.set(false);
      firebase = new FakeFirebase();
      firebase.ratings.watchRatingsError = { code: 'permission-denied' };
      TestBed.configureTestingModule({
        providers: [
          ...provideFakeFirebase(firebase),
          { provide: LayoutService, useValue: { isMobile } },
          { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: 'e1' })) } },
        ],
      });
      TestBed.inject(SessionService).role.set('trainer');
      const fixture = TestBed.createComponent(EventRating);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(q(fixture, '.notice')).not.toBeNull();
      });
      expect(text(q(fixture, '.notice'))).toContain('Die Bewertungen konnten nicht geladen werden');
    });
  });

  describe('Handy (Stepper)', () => {
    it('zeigt einen Spieler je Karte und blättert vor und zurück', async () => {
      const fixture = await render({ mobile: true });
      expect(q(fixture, 'table')).toBeNull();
      expect(text(q(fixture, '.position'))).toBe('1 / 3');
      expect(text(q(fixture, '.card-head'))).toContain('Jonas Keller');
      expect(text(q(fixture, '.card-head'))).toContain('Gesamtnote 2,3');
      const [previous, next] = qa<HTMLButtonElement>(fixture, '.stepper-nav button');
      expect(previous.disabled).toBe(true);
      next.click();
      fixture.detectChanges();
      expect(text(q(fixture, '.position'))).toBe('2 / 3');
      expect(text(q(fixture, '.card-head'))).toContain('Elias Wagner');
      previous.click();
      fixture.detectChanges();
      expect(text(q(fixture, '.card-head'))).toContain('Jonas Keller');
    });

    it('springt per Auswahl zu einem Spieler', async () => {
      const fixture = await render({ mobile: true });
      pick(q<HTMLSelectElement>(fixture, '.jump select')!, '2');
      fixture.detectChanges();
      expect(text(q(fixture, '.position'))).toBe('3 / 3');
    });

    it('setzt Teilnoten per Tipp auf die Note und zeigt die Gesamtnote', async () => {
      const fixture = await render({ mobile: true });
      qa<HTMLButtonElement>(fixture, '.stepper-nav button')[1].click();
      fixture.detectChanges();
      pick(q<HTMLSelectElement>(fixture, 'select[aria-label="Anwesenheit: Elias Wagner"]')!, 'present');
      fixture.detectChanges();
      for (const label of ['Einsatz', 'Fehlerquote', 'Entscheidungsfindung', 'Lernfähigkeit']) {
        q<HTMLButtonElement>(fixture, `button[aria-label="${label} Note 2"]`)!.click();
        fixture.detectChanges();
      }
      expect(q(fixture, 'button[aria-label="Einsatz Note 2"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(text(q(fixture, '.card-head'))).toContain('Gesamtnote 2,0');
      await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p2')).toMatchObject({ attendance: 'present', grade: 2, effort: 2, comprehension: 2 }));
      q<HTMLButtonElement>(fixture, 'button[aria-label="Einsatz nicht erfasst"]')!.click();
      fixture.detectChanges();
      expect(text(q(fixture, '.card-head'))).toContain('Gesamtnote –');
    });

    it('zeigt Spielfelder nur bei Spielen und die interne Notiz', async () => {
      const game = await render({ mobile: true });
      expect(q(game, '.numbers')).not.toBeNull();
      expect(q<HTMLInputElement>(game, 'input[placeholder="Nur für Trainer"]')?.value).toBe('Vertraulich');
      TestBed.resetTestingModule();
      const training = await render({ mobile: true, game: false });
      expect(q(training, '.numbers')).toBeNull();
    });
  });

  describe('Einwilligung (SCRUM-51)', () => {
    it('warnt am PC nur bei widerrufener Einwilligung und sperrt nichts', async () => {
      const fixture = await render({ consent: 'revoked' });
      const rows = qa(fixture, 'tbody tr');
      expect(text(rows[1])).toContain('Einwilligung widerrufen');
      expect(rows[0].querySelector('.consent-chip')).toBeNull();
      expect(rows[2].querySelector('.consent-chip')).toBeNull();
      expect(rows[1].querySelector('select:disabled, input:disabled')).toBeNull();
    });

    it.each(['pending', 'granted'])('zeigt bei „%s“ keine Warnung', async (consent) => {
      const fixture = await render({ consent });
      expect(q(fixture, '.consent-chip')).toBeNull();
    });

    it('warnt am Handy auf der Karte des Spielers', async () => {
      const fixture = await render({ mobile: true, consent: 'revoked' });
      const next = qa<HTMLButtonElement>(fixture, 'button').find((b) => text(b).startsWith('Weiter'))!;
      expect(q(fixture, '.consent-chip')).toBeNull(); // Jonas (erste Karte): kein Widerruf
      next.click();
      fixture.detectChanges();
      expect(text(q(fixture, '.consent-chip'))).toContain('Einwilligung widerrufen');
    });
  });
});
