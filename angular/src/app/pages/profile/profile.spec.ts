import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { FirebaseService } from '../../core/firebase.service';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { FakeFirebase } from '../../core/testing';
import { Profile } from './profile';

describe('Profile (Spielerprofil)', () => {
  let firebase: FakeFirebase;
  let navigate: ReturnType<typeof vi.fn>;
  const isMobile = signal(false);

  const grades = (grade: number, extra: Record<string, unknown> = {}) => ({ attendance: 'present', effort: grade, technique: grade, tactics: grade, comprehension: grade, ...extra });

  async function render(options: { mobile?: boolean; id?: string; withData?: boolean } = {}) {
    const { mobile = false, id = '', withData = true } = options;
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Verletzt', injuryUntil: '2026-12-01', consentStatus: 'granted', consentDate: '2026-09-01' });
    firebase.players.set('p2', { name: '<b>Elias</b> Wagner', positions: ['RV', 'LV'], number: 2, birthdate: '2012-06-06', status: 'Fit', consentStatus: 'pending' });
    if (withData) {
      firebase.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-09-01', intensity: 2, notes: 'Passspiel' });
      firebase.events.set('e2', { type: 'Spiel', title: '<img src=x onerror=alert(1)>', date: '2026-09-08', intensity: 3, goalsFor: 3, goalsAgainst: 1, matchDuration: 80 });
      firebase.events.set('e3', { type: 'Training', title: 'Training Zukunft', date: '2099-01-01' });
      firebase.ratings.set('e1', new Map([['p1', grades(3, { note: '' })]]));
      firebase.ratings.set('e2', new Map([['p1', grades(1, { note: 'Starkes Spiel', minutes: 80, goals: 2, assists: 1 })]]));
      firebase.ratings.set('e3', new Map([['p1', { attendance: 'absent' }]]));
    }
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseService, useValue: firebase },
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap(id ? { id } : {})) } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Profile);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.header, .notice, .empty')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);
  const qa = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => [...root(fixture).querySelectorAll<T>(selector)];
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('zeigt den ersten Spieler mit Kopfbereich, Schnitt und Datennutzung', async () => {
    const fixture = await render();
    expect(text(q(fixture, '.who strong'))).toBe('Jonas Keller');
    expect(text(q(fixture, '.who'))).toContain('TW');
    expect(text(q(fixture, '.who'))).toContain('Verletzt (ca. bis 01.12.2026)');
    expect(text(q(fixture, '.who'))).toContain('Datennutzung: dokumentiert am 01.09.2026');
    expect(text(q(fixture, '.grade strong'))).toBe('2,0'); // Schnitt aus 3 und 1; „Fehlt“ und Zukunft zählen nicht
  });

  it('zeigt Verlaufsdiagramm, Kompetenzprofil und Verfügbarkeit', async () => {
    const fixture = await render();
    expect(qa(fixture, 'svg circle')).toHaveLength(2);
    expect(q(fixture, 'svg')?.getAttribute('aria-label')).toContain('2 benotete Events');
    const labels = (list: Element) => [...list.querySelectorAll('.bar')].map((bar) => bar.getAttribute('aria-label'));
    expect(labels(qa(fixture, '.bars')[0])).toEqual(['Einsatz 2,0', 'Fehlerquote 2,0', 'Entscheidungsfindung 2,0', 'Lernfähigkeit 2,0']);
    // das Zukunftsevent mit „Fehlt“ zählt nicht
    expect(labels(qa(fixture, '.bars')[1])).toEqual(['Anwesend 2/2', 'Teilweise 0/2', 'Fehlt 0/2', 'Nicht im Kader 0/2']);
  });

  it('zeigt Statistik-Karten mit den berechneten Werten', async () => {
    const fixture = await render();
    const cards = Object.fromEntries(qa(fixture, '.stat').map((card) => [text(card.querySelector('span')), text(card.querySelector('strong'))]));
    expect(cards['Notenschnitt']).toBe('2,0');
    expect(cards['Spiel-Schnitt']).toBe('1,0');
    expect(cards['Training-Schnitt']).toBe('3,0');
    expect(cards['Bewertete Events']).toBe('2');
    expect(cards['Teilnahmen']).toBe('2');
    expect(cards['Trend']).toBe('+2'); // 3 → 1
    expect(cards['Entwicklung Saison']).toBe('+2');
    expect(cards['Bestes Event']).toBe('1,0 · Spiel');
    expect(cards['Einsatzquote']).toBe('100%'); // 80 von 80 Minuten
    expect(cards['Tore + Vorlagen']).toBe('2 + 1');
    expect(cards['Scorer/Spiel']).toBe('3');
    expect(cards['Min./Spiel']).toBe('80');
  });

  it('zeigt die Eventhistorie, neueste zuerst, mit Ergebnis und Notiz', async () => {
    const fixture = await render();
    const rows = qa(fixture, '.history li');
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain('08.09.2026');
    expect(text(rows[0])).toContain('Spiel · 3:1 · Note 1,0');
    expect(text(rows[0])).toContain('Starkes Spiel');
    expect(text(rows[1])).toContain('Training Montag');
    expect(text(rows[1])).toContain('Passspiel'); // Event-Notiz, wenn kein Feedback da ist
  });

  it('maskiert Namen und Titel (keine unmaskierte HTML-Ausgabe)', async () => {
    const fixture = await render();
    expect(root(fixture).querySelector('img')).toBeNull();
    expect(text(q(fixture, '.history'))).toContain('<img src=x onerror=alert(1)>');
    const picker = qa<HTMLOptionElement>(fixture, '.picker option').map(text);
    expect(picker).toContain('2 · <b>Elias</b> Wagner');
    expect(root(fixture).querySelector('.picker b')).toBeNull();
  });

  it('wechselt den Spieler per Auswahl und passt die Adresse an', async () => {
    const fixture = await render();
    const select = q<HTMLSelectElement>(fixture, '.picker select')!;
    select.value = 'p2';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, '.who strong'))).toContain('Wagner');
    });
    expect(navigate).toHaveBeenCalledWith(['/profile', 'p2'], { replaceUrl: true });
    expect(text(q(fixture, '.who'))).toContain('Datennutzung: noch offen');
    expect(text(root(fixture))).toContain('Für diesen Spieler gibt es noch keine Bewertungen.');
    expect(text(q(fixture, '.grade strong'))).toBe('–');
    expect(firebase.calls).toContain('watchRatingDoc:e1:p2');
  });

  it('öffnet den Spieler aus der Adresse', async () => {
    const fixture = await render({ id: 'p2' });
    expect(text(q(fixture, '.who strong'))).toContain('Wagner');
  });

  it('zeigt bei leerem Kader einen Hinweis', async () => {
    isMobile.set(false);
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseService, useValue: firebase },
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Profile);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.empty')).not.toBeNull();
    });
    expect(text(q(fixture, '.empty'))).toContain('Noch kein Spieler im Kader.');
  });

  it('zeigt Ladefehler mit „Erneut versuchen“', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    isMobile.set(false);
    firebase = new FakeFirebase();
    firebase.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    firebase.events.set('e1', { type: 'Training', title: 'T', date: '2026-09-01' });
    firebase.watchRatingDocError = { code: 'permission-denied' };
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseService, useValue: firebase },
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Profile);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.notice')).not.toBeNull();
    });
    expect(text(q(fixture, '.notice'))).toContain('Das Profil konnte nicht geladen werden');
    firebase.watchRatingDocError = null;
    q<HTMLButtonElement>(fixture, '.notice button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.header')).not.toBeNull();
    });
  });

  it('nutzt am Handy dieselbe Seite einspaltig', async () => {
    const fixture = await render({ mobile: true });
    expect(q(fixture, '.page')?.getAttribute('data-variant')).toBe('mobile');
    expect(qa(fixture, '.stat')).toHaveLength(14);
  });
});
