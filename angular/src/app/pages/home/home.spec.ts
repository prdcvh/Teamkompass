import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LayoutService } from '../../core/shell/layout.service';
import { berlinTodayIso } from '../../core/events/warmup';
import { todayIso } from '../../core/shared/dates';
import { SessionService } from '../../core/auth/session.service';
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

  async function render(role: 'trainer' | 'player' = 'trainer', mobile = false, lineup: Record<string, unknown> | null = null, mutate?: (firebase: FakeFirebase) => void) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.lineup.lineup = lineup;
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: '<b>Ben</b>', positions: ['IV'], number: 4, birthdate: '2012-06-06', status: 'Verletzt' });
    firebase.events.events.set('e1', { type: 'Spiel', title: 'Heimspiel', date: day(-3), goalsFor: 3, goalsAgainst: 1, matchDuration: 70 });
    firebase.events.events.set('e2', { type: 'Spiel', title: '<img src=x onerror=alert(1)>', date: day(4), opponent: 'SV Nord', location: 'Kunstrasen' });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, playerId: 'p1' }]]));
    mutate?.(firebase);
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
    expect(stats).toEqual(['Kader 2', 'Fit 1', 'Events 2', 'Teamnote 2', 'Bilanz (S-U-N) 1-0-0', 'Tore 3:1', 'Belastung hoch 0']);
    expect(text(fixture)).toContain('Ali Adler');
    expect(text(fixture)).toContain('Ø 2');
    expect(text(fixture)).toContain('vs. SV Nord');
    expect(text(fixture)).toContain('Kunstrasen');
    expect(text(fixture)).toContain('in 4 Tagen');
    expect(text(fixture)).toContain('1 Einsatz');
    expect(text(fixture)).not.toContain('1 Einsätze');
    expect(root(fixture).querySelector('.next')?.getAttribute('href')).toBe('/events/e2');
    expect(root(fixture).querySelector('.board .spark')?.getAttribute('aria-label')).toBe('Letzte Noten: 2,0');
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
    const markers = [...link.querySelectorAll('.marker')].map((el) => el.textContent?.replace(/\s+/g, ' ').trim());
    expect(markers).toEqual(['4<b>Ben</b>', '9Ali']);
    expect(link.querySelector('b')).toBeNull();
    const rows = [...root(fixture).querySelectorAll('.lineup-rows li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['AngriffAli Adler', 'Abwehr<b>Ben</b>']);
    expect(text(fixture)).toContain('1-1');
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

  describe('Aufwärmprogramm (SCRUM-178)', () => {
    const today = berlinTodayIso();
    const panel = (fixture: { nativeElement: unknown }) => root(fixture).querySelector('[data-testid=warmup-panel]')!;

    it('zeigt die Wochenquote der laufenden Woche und keinen Hinweis, wenn ein Programm gemacht wurde', async () => {
      const fixture = await render('trainer', false, null, (fb) => {
        fb.events.events.set('w1', { type: 'Training', title: 'Training A', date: today, warmup: '11+ Kids' });
      });
      await ready(fixture);
      expect(panel(fixture).querySelector('[data-testid=warmup-quote]')?.textContent).toBe('1 von 1 Training');
      expect(panel(fixture).querySelector('[data-testid=warmup-hint-current]')).toBeNull();
      const link = panel(fixture).querySelector<HTMLAnchorElement>('a[href^="https://"]')!;
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('weist auf ein Training ohne Programm hin', async () => {
      const fixture = await render('trainer', false, null, (fb) => {
        fb.events.events.set('w1', { type: 'Training', title: 'Training A', date: today });
      });
      await ready(fixture);
      expect(panel(fixture).querySelector('[data-testid=warmup-quote]')?.textContent).toBe('0 von 1 Training');
      expect(panel(fixture).querySelector('[data-testid=warmup-hint-current]')).not.toBeNull();
    });

    it('zeigt in einer Woche ohne Training keinen Hinweis', async () => {
      const fixture = await render();
      await ready(fixture);
      expect(panel(fixture).querySelector('[data-testid=warmup-quote]')).toBeNull();
      expect(panel(fixture).querySelector('.warmup-hint')).toBeNull();
      expect(panel(fixture).textContent).toContain('noch kein Training');
    });
  });

  describe('MVP der Woche und des Monats (SCRUM-105)', () => {
    const withPoints = (firebase: FakeFirebase) => {
      firebase.events.events.set('e3', { type: 'Training', title: 'Training heute', date: day(0) });
      firebase.ratings.privateNotes.set('e3', new Map([['p1', { playerId: 'p1', points: 5 }], ['p2', { playerId: 'p2', points: 5 }]]));
    };
    const lists = (fixture: { nativeElement: unknown }) => [...root(fixture).querySelectorAll('app-home-ranking .panel')];

    it('zeigt zwei Ranglisten mit Platz, Name und Punkten; Gleichstand teilt sich Platz 1 und beide sind MVP', async () => {
      const fixture = await render('trainer', false, null, withPoints);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(lists(fixture)).toHaveLength(2);
      });
      const [week, month] = lists(fixture);
      expect(week.querySelector('h2')?.textContent).toBe('MVP der Woche');
      expect(month.querySelector('h2')?.textContent).toBe('MVP des Monats');
      const rows = [...week.querySelectorAll('li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
      expect(rows).toEqual(['1 <b>Ben</b> MVP5 Punkte', '1 Ali Adler MVP5 Punkte']);
      expect(root(fixture).querySelector('app-home-ranking b')).toBeNull();
    });

    it('zeigt ohne Punkte einen freundlichen Leerzustand', async () => {
      const fixture = await render();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(lists(fixture)).toHaveLength(2);
      });
      expect(text(fixture)).toContain('Noch keine Punkte in diesem Zeitraum');
      expect(root(fixture).querySelector('app-home-ranking li')).toBeNull();
    });

    it('stapelt die Listen am Handy untereinander', async () => {
      const fixture = await render('trainer', true, null, withPoints);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(lists(fixture)).toHaveLength(2);
      });
      expect(root(fixture).querySelector('app-home-ranking .ranking')?.getAttribute('data-variant')).toBe('mobile');
    });
  });

  describe('Pausen-Hinweis (SCRUM-150)', () => {
    const short = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
    const notice = (fixture: { nativeElement: unknown }) => root(fixture).querySelector('[data-testid="break-notice"]')?.textContent?.trim();

    async function withBreak(role: 'trainer' | 'player', start: number, end: number) {
      const fixture = await render(role);
      firebase.planning.breaksDoc = { breaks: { b1: { name: 'Herbstferien', startDate: day(start), endDate: day(end) } } };
      firebase.planning.emitBreaks();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(notice(fixture)).toBeDefined();
      });
      return fixture;
    }

    it('weist Trainer und Spieler auf eine Pause in der nächsten Woche hin', async () => {
      for (const role of ['trainer', 'player'] as const) {
        TestBed.resetTestingModule();
        const fixture = await withBreak(role, 7, 18);
        expect(notice(fixture)).toBe(`Ab ${short(day(7))} Herbstferien (bis ${short(day(18))})`);
      }
    });

    it('nennt eine laufende Pause und zeigt bei ferner Pause nichts', async () => {
      const fixture = await withBreak('player', -2, 5);
      expect(notice(fixture)).toBe(`Herbstferien bis ${short(day(5))}`);
      TestBed.resetTestingModule();
      const far = await render('trainer');
      firebase.planning.breaksDoc = { breaks: { b1: { name: 'Sommerpause', startDate: day(30), endDate: day(60) } } };
      firebase.planning.emitBreaks();
      far.detectChanges();
      await far.whenStable();
      expect(notice(far)).toBeUndefined();
    });
  });
});
