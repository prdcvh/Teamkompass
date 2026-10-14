import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LayoutService } from '../../core/layout.service';
import { todayIso } from '../../core/dates';
import { SessionService } from '../../core/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Home } from './home';

describe('Home (Start-Dashboard)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);
  const day = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return todayIso(date);
  };

  async function render(role: 'trainer' | 'player' = 'trainer', mobile = false, lineup: Record<string, unknown> | null = null) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.lineup.lineup = lineup;
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: '<b>Ben</b>', positions: ['IV'], number: 4, birthdate: '2012-06-06', status: 'Verletzt' });
    firebase.events.events.set('e1', { type: 'Spiel', title: 'Heimspiel', date: day(-3), goalsFor: 3, goalsAgainst: 1, matchDuration: 70 });
    firebase.events.events.set('e2', { type: 'Spiel', title: '<img src=x onerror=alert(1)>', date: day(4), opponent: 'SV Nord', location: 'Kunstrasen' });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, playerId: 'p1' }]]));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile } }],
    });
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Home);
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

  it('zeigt Kennzahlen, nächstes Event und Bestenliste', async () => {
    const fixture = await render();
    await ready(fixture);
    const stats = [...root(fixture).querySelectorAll('.stat')].map((el) => `${el.querySelector('span')?.textContent} ${el.querySelector('strong')?.textContent}`);
    expect(stats).toEqual(['Kader 2', 'Fit 1', 'Events 2', 'Teamnote 2', 'Bilanz (S-U-N) 1-0-0', 'Tore 3:1', 'Belastung hoch 1']);
    expect(text(fixture)).toContain('Ali Adler');
    expect(text(fixture)).toContain('Ø 2');
    expect(text(fixture)).toContain('vs. SV Nord');
    expect(text(fixture)).toContain('Kunstrasen');
  });

  it('gibt Namen und Titel nie als HTML aus', async () => {
    const fixture = await render();
    await ready(fixture);
    expect(root(fixture).querySelector('img')).toBeNull();
    expect(root(fixture).querySelector('b')).toBeNull();
    expect(text(fixture)).toContain('<img src=x onerror=alert(1)>');
  });

  it('zeigt am Handy höchstens fünf Plätze in der Bestenliste und zwei Spalten Kennzahlen', async () => {
    const fixture = await render('trainer', true);
    await ready(fixture);
    expect(root(fixture).querySelector('.page')?.getAttribute('data-variant')).toBe('mobile');
    expect(root(fixture).querySelectorAll('.board li').length).toBeLessThanOrEqual(5);
  });

  it('zeigt die Startelf als Kurzansicht, die zur Aufstellung führt', async () => {
    const fixture = await render('trainer', false, { assignments: { ST: ['p1'], IV: ['p2'], TW: [] } });
    await ready(fixture);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.lineup-link')).not.toBeNull();
    });
    const link = root(fixture).querySelector<HTMLAnchorElement>('.lineup-link')!;
    expect(link.getAttribute('href')).toBe('/aufstellung');
    expect(link.getAttribute('aria-label')).toBe('Aufstellung öffnen, Formation 1-1');
    const rows = [...link.querySelectorAll('.lineup-rows li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['AngriffAli Adler', 'Abwehr<b>Ben</b>']);
    expect(link.querySelector('b')).toBeNull();
  });

  it('weist ohne gespeicherte Aufstellung auf die Aufstellung hin', async () => {
    const fixture = await render();
    await ready(fixture);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('Noch keine Aufstellung gespeichert.');
    });
    expect(root(fixture).querySelector('a[href="/aufstellung"]')?.textContent).toContain('Aufstellung anlegen');
  });

  it('lädt für Spieler keine Teamauswertung', async () => {
    const fixture = await render('player');
    fixture.detectChanges();
    expect(text(fixture)).toContain(environment.teamName);
    expect(root(fixture).querySelector('.stats')).toBeNull();
    expect(firebase.calls).not.toContain('watchPlayers');
    expect(firebase.lineup.lineupWatchers).toBe(0);
  });
});
