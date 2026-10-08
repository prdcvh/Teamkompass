import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FirebaseService } from '../../core/firebase.service';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { FakeFirebase } from '../../core/testing';
import { TeamAnalysis } from './team-analysis';

describe('TeamAnalysis (Teamanalyse)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);
  const grades = (grade: number) => ({ attendance: 'present', effort: grade, technique: grade, tactics: grade, comprehension: grade });

  async function render(role: 'trainer' | 'player' = 'trainer', mobile = false, withData = true) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    if (withData) {
      firebase.players.set('p1', { name: 'Ali Adler', positions: ['ST', 'LA'], number: 9, birthdate: '2012-02-05', status: 'Fit' });
      firebase.players.set('p2', { name: '<b>Ben</b>', positions: ['IV'], number: 4, birthdate: '2012-11-06', status: 'Fit' });
      firebase.events.set('e1', { type: 'Spiel', title: '<img src=x onerror=alert(1)>', date: '2026-09-01', goalsFor: 3, goalsAgainst: 1, intensity: 3 });
      firebase.events.set('e2', { type: 'Training', title: 'Training', date: '2026-09-03', trainingFocus: 'Umschalten', intensity: 2 });
      firebase.ratings.set('e1', new Map([['p1', { ...grades(2), playerId: 'p1' }], ['p2', { ...grades(4), playerId: 'p2' }]]));
      firebase.ratings.set('e2', new Map([['p1', { ...grades(2), playerId: 'p1' }]]));
    }
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: FirebaseService, useValue: firebase }, { provide: LayoutService, useValue: { isMobile } }],
    });
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(TeamAnalysis);
    await fixture.whenStable();
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const text = (fixture: { nativeElement: unknown }) => root(fixture).textContent?.replace(/\s+/g, ' ') ?? '';
  const ready = (fixture: { detectChanges: () => void; nativeElement: unknown }) =>
    vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.stats')).not.toBeNull();
    });

  it('zeigt Kennzahlen, Teamform, Geburtsquartale, Positionsabdeckung und Trainingsfokus', async () => {
    const fixture = await render();
    await ready(fixture);
    const cards = Object.fromEntries([...root(fixture).querySelectorAll('.stat')].map((el) => [el.querySelector('span')?.textContent, el.querySelector('strong')?.textContent]));
    expect(cards).toMatchObject({
      Spiele: '1',
      Bilanz: '1 S · 0 U · 0 N',
      Torverhältnis: '3:1',
      'Ø Teamnote': '2,5', // Spiel Ø 3,0 · Training Ø 2,0
      Teilnahmequote: '100%',
      'Ø Intensität': '2,5',
      'Training BB/GGB': '0/0',
      'Training Umschalten': '1',
      'Geburten Q1/Q2': '1/0',
      'Geburten Q3/Q4': '0/1',
      Positionslücken: '3', // ST, LA, IV je nur ein Spieler
    });
    expect(root(fixture).querySelector('svg.chart')?.getAttribute('aria-label')).toContain('2 Events mit Note');
    expect(root(fixture).querySelectorAll('svg.chart circle')).toHaveLength(2);
    const headings = [...root(fixture).querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings).toEqual(['Teamform', 'Nützliche Kennzahlen', 'Geburtsquartale', 'Positionsabdeckung', 'Trainingsfokus']);
    expect(text(fixture)).toContain('Umschalten: 1 Einheiten');
    expect(text(fixture)).toContain('Knapp besetzt: IV, LA, ST');
    expect(root(fixture).querySelector('[aria-label="Q1: 1 Spieler"]')).not.toBeNull();
    expect(root(fixture).querySelector('[aria-label="ST: 1 Spieler"]')).not.toBeNull();
  });

  it('gibt Spielernamen und Eventtitel nie als HTML aus', async () => {
    const fixture = await render();
    await ready(fixture);
    expect(root(fixture).querySelector('img')).toBeNull();
    expect(root(fixture).querySelector('b')).toBeNull();
    expect(text(fixture)).toContain('<b>Ben</b>');
    // der Eventtitel steht im Tooltip des Diagrammpunkts, ebenfalls als Text
    expect(root(fixture).querySelector('svg title')?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('zeigt ohne Daten leere Zustände statt Fehlern', async () => {
    const fixture = await render('trainer', false, false);
    await ready(fixture);
    expect(root(fixture).querySelector('svg.chart')?.getAttribute('aria-label')).toBe('Noch keine Teamnoten vorhanden');
    expect(text(fixture)).toContain('Noch keine Bewertungen.');
    expect(text(fixture)).toContain('Noch keine Spieler im Kader.');
    expect(text(fixture)).toContain('keine auffälligen Lücken');
  });

  it('zeigt am Handy eine Spalte', async () => {
    const fixture = await render('trainer', true);
    await ready(fixture);
    expect(root(fixture).querySelector('.page')?.getAttribute('data-variant')).toBe('mobile');
  });

  it('lädt für Nicht-Trainer nichts und zeigt nur einen Hinweis', async () => {
    const fixture = await render('player');
    fixture.detectChanges();
    expect(text(fixture)).toContain('nur Trainer');
    expect(root(fixture).querySelector('.stats')).toBeNull();
    expect(firebase.calls).not.toContain('watchPlayers');
  });
});
