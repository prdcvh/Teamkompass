import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { FirebaseService } from '../../core/firebase.service';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { FakeFirebase } from '../../core/testing';
import { Profile } from './profile';

describe('Profile (Spielerprofil)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);

  const rating = (grade: number, attendance = 'present') => ({ attendance, effort: grade, technique: grade, tactics: grade, comprehension: grade, grade, minutes: '', goals: '', assists: '', note: '' });

  async function render(id = 'p1', mobile = false) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'granted', consentDate: '2026-09-01' });
    firebase.players.set('p2', { name: 'Ben Bauer', positions: ['TW'], number: 1, birthdate: '2012-06-06', status: 'Fit' });
    firebase.events.set('e1', { type: 'Training', title: 'Training A', date: '2026-09-01' });
    firebase.events.set('e2', { type: 'Spiel', title: 'Spiel B', date: '2026-09-08', opponent: 'SV Nord' });
    firebase.ratings.set('e1', new Map([['p1', { ...rating(2), playerId: 'p1' }]]));
    firebase.ratings.set('e2', new Map([['p1', { ...rating(4), playerId: 'p1' }]]));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FirebaseService, useValue: firebase },
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap(id ? { id } : {})) } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Profile);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.muted[role="status"]')).toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const text = (fixture: { nativeElement: unknown }) => root(fixture).textContent?.replace(/\s+/g, ' ') ?? '';

  it('zeigt Kopf, Ø Note, Verlauf und Eventhistorie des gewählten Spielers', async () => {
    const fixture = await render('p1');
    const content = text(fixture);
    expect(content).toContain('Ali Adler');
    expect(content).toContain('Datennutzung: dokumentiert am 01.09.2026');
    expect(root(fixture).querySelector('svg.trend')).not.toBeNull();
    expect(root(fixture).querySelectorAll('svg.trend circle.dot')).toHaveLength(2);
    expect(content).toContain('Training A');
    expect(content).toContain('Spiel B');
    expect(root(fixture).querySelector('[data-variant="desktop"]')).not.toBeNull();
  });

  it('abonniert nur die Bewertungen des gewählten Spielers', async () => {
    await render('p1');
    expect(firebase.calls).toContain('watchPlayerRating:e1:p1');
    expect(firebase.calls.some((call) => call.startsWith('watchRatings'))).toBe(false);
  });

  it('zeigt für einen Spieler ohne Bewertungen einen leeren Verlauf', async () => {
    const fixture = await render('p2');
    expect(text(fixture)).toContain('Ben Bauer');
    expect(text(fixture)).toContain('Noch keine benoteten Events vorhanden.');
    expect(root(fixture).querySelector('svg.trend')).toBeNull();
  });

  it('meldet einen unbekannten Spieler statt eines leeren Profils', async () => {
    const fixture = await render('gibtsnicht');
    expect(text(fixture)).toContain('Diesen Spieler gibt es nicht (mehr).');
  });

  it('zeigt am Handy die mobile Variante', async () => {
    const fixture = await render('p1', true);
    expect(root(fixture).querySelector('[data-variant="mobile"]')).not.toBeNull();
  });

  it('zeigt Ladefehler mit Hinweis und erlaubt „Erneut versuchen“', async () => {
    const fixture = await render('p1');
    firebase.failPlayerRating('e1', 'p1', { code: 'permission-denied' });
    fixture.detectChanges();
    const alert = root(fixture).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('konnten nicht geladen werden');
  });
});
