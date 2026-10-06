import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { FirebaseService } from '../../core/firebase.service';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { FakeFirebase } from '../../core/testing';
import { EventRating } from './event-rating';

describe('EventRating (Event bewerten)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);

  async function render(options: { mobile?: boolean; eventId?: string; game?: boolean } = {}) {
    const { mobile = false, eventId = 'e1', game = true } = options;
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.events.set('e1', game
      ? { type: 'Spiel', title: 'Heimspiel', date: '2026-10-10', opponent: 'SV Nord', goalsFor: 3, goalsAgainst: 1, intensity: 3, location: 'Platz 1', matchDuration: 70 }
      : { type: 'Training', title: 'Training Montag', date: '2026-10-05', intensity: 2 });
    firebase.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.set('p2', { name: 'Elias Wagner', positions: ['RV'], number: 2, birthdate: '2012-06-06', status: 'Fit' });
    firebase.players.set('p3', { name: '<b>Jan</b> Braun', positions: ['ST'], number: 9, birthdate: '2013-01-01', status: 'Fit' });
    firebase.ratings.set('e1', new Map([
      ['p1', { attendance: 'present', effort: 1, technique: 2, tactics: 3, comprehension: 4, grade: 2.3, minutes: 70, goals: 1, assists: '', note: 'Starkes Spiel', playerId: 'p1' }],
      ['p3', { attendance: 'absent', note: 'Verletzt', autoAbsence: true, playerId: 'p3' }],
    ]));
    firebase.privateNotes.set('e1', new Map([['p1', { playerId: 'p1', note: 'Vertraulich' }]]));
    const params = new BehaviorSubject(convertToParamMap({ id: eventId }));
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseService, useValue: firebase },
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: params } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
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

    it('„Fehlt“ löscht die Noten, die Gesamtnote verschwindet', async () => {
      const fixture = await render();
      pick(q<HTMLSelectElement>(fixture, 'select[aria-label="Anwesenheit: Jonas Keller"]')!, 'absent');
      fixture.detectChanges();
      expect(text(qa(fixture, 'tbody tr')[0].querySelector('.grade-total'))).toBe('–');
      await vi.waitFor(() => expect(firebase.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'absent', effort: '', grade: '', minutes: '' }));
    });

    it('speichert Feedback sichtbar und interne Notiz getrennt', async () => {
      const fixture = await render();
      pick(q<HTMLInputElement>(fixture, 'input[aria-label="Feedback an Elias Wagner"]')!, 'Gute Laufwege');
      pick(q<HTMLInputElement>(fixture, 'input[aria-label="Interne Notiz für Elias Wagner"]')!, 'Gespräch nötig');
      await vi.waitFor(() => {
        expect(firebase.ratings.get('e1')?.get('p2')?.['note']).toBe('Gute Laufwege');
        expect(firebase.privateNotes.get('e1')?.get('p2')?.['note']).toBe('Gespräch nötig');
      });
      expect(JSON.stringify([...firebase.ratings.get('e1')!.values()])).not.toContain('Gespräch nötig');
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
      firebase.watchRatingsError = { code: 'permission-denied' };
      TestBed.configureTestingModule({
        providers: [
          { provide: FirebaseService, useValue: firebase },
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
      await vi.waitFor(() => expect(firebase.ratings.get('e1')?.get('p2')).toMatchObject({ attendance: 'present', grade: 2, effort: 2, comprehension: 2 }));
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
});
