import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Search } from './search';

describe('Search (Suche)', () => {
  let firebase: FakeFirebase;

  async function render(role: 'trainer' | 'player' = 'trainer') {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-02-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: '<b>Ben</b>', positions: ['IV'], number: 4, birthdate: '2012-11-06', status: 'Fit' });
    firebase.events.events.set('e1', { type: 'Spiel', title: 'Spiel gegen Eppstein', date: '2026-09-01', intensity: 3 });
    firebase.opponents.opponents.set('o1', { name: 'SG Eppstein', formation: '4-4-2', style: 'Pressing', updatedAt: '2026-10-01' });
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Search);
    await fixture.whenStable();
    if (role === 'trainer') {
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(root(fixture).querySelector('[role="status"]')).toBeNull();
      });
    } else {
      fixture.detectChanges();
    }
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const input = (fixture: { nativeElement: unknown }) => root(fixture).querySelector('input[type="search"]') as HTMLInputElement;
  const hits = (fixture: { nativeElement: unknown }) =>
    [...root(fixture).querySelectorAll<HTMLAnchorElement>('a.hit')].map((a) => a.textContent?.replace(/\s+/g, ' ').trim());
  const type = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown>; nativeElement: unknown }, value: string) => {
    input(fixture).value = value;
    input(fixture).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  };

  it('hat ein beschriftetes Suchfeld und zeigt zunächst die Bereiche', async () => {
    const fixture = await render();
    expect(root(fixture).querySelector('label.search .tk-sr-only')?.textContent).toBe('TeamKompass durchsuchen');
    expect(hits(fixture)[0]).toContain('Dashboard');
  });

  it('findet Spieler, Events und Gegner und verlinkt sie', async () => {
    const fixture = await render();
    await type(fixture, 'eppstein');
    expect(hits(fixture)).toEqual(['Spiel gegen EppsteinSpiel · 2026-09-01', 'SG EppsteinGegner · 4-4-2']);
    const links = [...root(fixture).querySelectorAll<HTMLAnchorElement>('a.hit')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/events/e1', '/gegneranalyse?suche=SG%20Eppstein']);
    await type(fixture, 'ali');
    expect(root(fixture).querySelector<HTMLAnchorElement>('a.hit')?.getAttribute('href')).toBe('/profile/p1');
  });

  it('gibt Namen als Text aus (kein HTML)', async () => {
    const fixture = await render();
    await type(fixture, 'ben');
    expect(root(fixture).querySelector('a.hit b')).toBeNull();
    expect(hits(fixture)[0]).toContain('<b>Ben</b>');
  });

  it('meldet „Kein Treffer“', async () => {
    const fixture = await render();
    await type(fixture, 'qqqq');
    expect(root(fixture).textContent).toContain('Kein Treffer.');
  });

  it('ist für Nicht-Trainer nicht verfügbar und lädt nichts', async () => {
    const fixture = await render('player');
    expect(input(fixture)).toBeNull();
    expect(root(fixture).textContent).toContain('nur für Trainer');
  });
});
