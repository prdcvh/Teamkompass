import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LayoutService } from '../../core/shell/layout.service';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { TeamAnalysis, formatGoals, formatRecord } from './team-analysis';

describe('TeamAnalysis (Teamanalyse)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);
  const grades = (grade: number) => ({ attendance: 'present', effort: grade, technique: grade, tactics: grade, comprehension: grade });

  async function render(role: 'trainer' | 'player' = 'trainer', mobile = false, withData = true, seed?: (firebase: FakeFirebase) => void) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    if (withData) {
      firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST', 'LA'], number: 9, birthdate: '2012-02-05', status: 'Fit' });
      firebase.players.players.set('p2', { name: '<b>Ben</b>', positions: ['IV'], number: 4, birthdate: '2012-11-06', status: 'Fit' });
      firebase.events.events.set('e1', { type: 'Spiel', title: '<img src=x onerror=alert(1)>', date: '2026-09-01', goalsFor: 3, goalsAgainst: 1, intensity: 3 });
      firebase.events.events.set('e2', { type: 'Training', title: 'Training', date: '2026-09-03', trainingFocus: 'Umschalten', intensity: 2 });
      firebase.ratings.ratings.set('e1', new Map([['p1', { ...grades(2), playerId: 'p1' }], ['p2', { ...grades(4), playerId: 'p2' }]]));
      firebase.ratings.ratings.set('e2', new Map([['p1', { ...grades(2), playerId: 'p1' }]]));
    }
    seed?.(firebase);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile } }],
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

  it('Teamziel: zählt die Check-ins der Mannschaft im Monat, ohne Spielernamen oder Rangliste (SCRUM-194)', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const fixture = await render('trainer', false, false, (fb) => {
      fb.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-02-05', status: 'Fit' });
      fb.players.players.set('p2', { name: 'Ben Bär', positions: ['IV'], number: 4, birthdate: '2012-11-06', status: 'Fit' });
      fb.selfReports.set('p1', 'selfReports', 'e1', { playerId: 'p1', eventId: 'e1', date: `${month}-01`, exertion: 4 });
      fb.selfReports.set('p1', 'selfReports', 'e2', { playerId: 'p1', eventId: 'e2', date: `${month}-02`, exertion: 4 });
      fb.selfReports.set('p2', 'selfReports', 'e1', { playerId: 'p2', eventId: 'e1', date: `${month}-01`, exertion: 5 });
      fb.selfReports.set('p2', 'selfReports', 'e0', { playerId: 'p2', eventId: 'e0', date: '2020-01-01', exertion: 5 });
      fb.settings.settings = { checkInGoal: 6 };
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      const goal = root(fixture).querySelector('[data-testid="team-goal"]');
      expect(goal?.textContent?.replace(/\s+/g, ' ')).toContain('3 von 6 Check-ins');
    });
    const goal = root(fixture).querySelector('[data-testid="team-goal"]')!;
    expect(goal.querySelector('progress')?.getAttribute('value')).toBe('50');
    expect(goal.textContent).not.toContain('Ali');
    expect(goal.textContent).toContain('keine Rangliste');
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
      'Ø Anstrengung': '6,0',
      'Training BB/GGB': '0/0',
      'Training Umschalten': '1',
      'Geburten Q1/Q2': '1/0',
      'Geburten Q3/Q4': '0/1',
      Positionslücken: '3', // ST, LA, IV je nur ein Spieler
    });
    expect(root(fixture).querySelector('svg.chart')?.getAttribute('aria-label')).toContain('Teamnoten nach Event (1 ist die beste Note): ');
    expect(root(fixture).querySelectorAll('svg.chart .dot')).toHaveLength(2);
    const headings = [...root(fixture).querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings.filter((heading) => !heading?.startsWith('Teamziel'))).toEqual(['Teamform', 'Nützliche Kennzahlen', 'Geburtsquartale', 'Positionsabdeckung', 'Trainingsfokus', 'Vereinsvergleich']);
    expect(text(fixture)).toContain('Umschalten (Einheiten)');
    expect(text(fixture)).toContain('Knapp besetztIV, LA, ST');
    expect(root(fixture).querySelector('[aria-label="Q1: 1 Spieler"]')).not.toBeNull();
    expect(root(fixture).querySelector('[aria-label="ST: 1 Spieler"]')).not.toBeNull();
  });

  it('zeigt die fünf Kennzahlen-Blöcke mit hervorgehobenen Zahlen und Profil-Links', async () => {
    const fixture = await render();
    await ready(fixture);
    const blocks = [...root(fixture).querySelectorAll('.insights .insight')];
    expect(blocks.map((b) => b.querySelector('h3')?.textContent)).toEqual(['Topform', 'Belastung im Blick', 'Spielauswertung', 'Trainingssteuerung', 'Kaderstruktur']);
    const figures = [...root(fixture).querySelectorAll('[data-insight="spielauswertung"] .figure strong')].map((el) => el.textContent);
    expect(figures).toEqual(['1 S · 0 U · 0 N', '3:1']);
    const quarters = [...root(fixture).querySelectorAll('[data-insight="kaderstruktur"] .figure')].map((el) => el.textContent?.replace(/\s+/g, ' ').trim());
    expect(quarters).toEqual(['1Q1', '0Q2', '0Q3', '1Q4']);
    const link = root(fixture).querySelector('[data-insight="topform"] a');
    expect(link?.getAttribute('href')).toBe('/profile/p1');
    expect(root(fixture).querySelector('[data-insight="topform"] .value-badge')?.textContent).toContain('Note');
    expect(root(fixture).querySelector('.insights [style]')).toBeNull();
  });

  it('legt die Teamform-Kurve über die volle Breite und füllt das Kennzahlen-Raster lückenlos (SCRUM-287)', async () => {
    const fixture = await render();
    await ready(fixture);
    expect(root(fixture).querySelector('.columns.stack .chart')).not.toBeNull();
    const spans: number[] = [...root(fixture).querySelectorAll('.insights .insight')].map((b) => (b.classList.contains('s2') ? 2 : b.classList.contains('s3') ? 3 : 0));
    expect(spans.reduce((a, b) => a + b, 0)).toBe(12);
  });

  it('formatiert Bilanz und Torverhältnis', () => {
    expect(formatRecord({ wins: 2, draws: 1, losses: 0 })).toBe('2 S · 1 U · 0 N');
    expect(formatGoals({ goalsFor: 0, goalsAgainst: 0 })).toBe('0:0');
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
    expect(text(fixture)).toContain('Keine Auffälligkeiten.');
    expect(root(fixture).querySelectorAll('.insight-empty')).toHaveLength(2);
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
