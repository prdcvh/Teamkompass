import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { WakeLockService } from '../../core/device/wake-lock.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Live } from './live';

describe('Live (Live-Modus, SCRUM-213)', () => {
  let firebase: FakeFirebase;
  const wakeLock = { keepAwake: vi.fn(() => Promise.resolve(true)), release: vi.fn() };

  async function render(options: { game?: boolean } = {}) {
    const { game = false } = options;
    firebase = new FakeFirebase();
    firebase.events.events.set('e1', game
      ? { type: 'Spiel', title: 'Heimspiel', date: '2026-10-10', matchDuration: 70 }
      : { type: 'Training', title: 'Training Montag', date: '2026-10-05', intensity: 2 });
    firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: 'Elias Wagner', positions: ['RV'], number: 2, birthdate: '2012-06-06', status: 'Fit' });
    firebase.players.players.set('p3', { name: 'Jonas Braun', positions: ['ST'], number: 9, birthdate: '2013-01-01', status: 'Fit' });
    firebase.players.players.set('p4', { name: 'Ali Fehlt', positions: ['ST'], number: 10, birthdate: '2013-01-01', status: 'Fit' });
    firebase.ratings.ratings.set('e1', new Map([['p4', { attendance: 'absent', note: '', playerId: 'p4' }]]));
    firebase.ratings.privateNotes.set('e1', new Map([['p2', { playerId: 'p2', note: '', points: 1 }]]));
    TestBed.configureTestingModule({
      providers: [
        ...provideFakeFirebase(firebase),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: 'e1' })) } },
        { provide: WakeLockService, useValue: wakeLock },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Live);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.players, .notice')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const qa = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => [...root(fixture).querySelectorAll<T>(selector)];
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const names = (fixture: { nativeElement: unknown }) => qa(fixture, '.player .name').map(text);
  const tap = (fixture: { nativeElement: unknown; detectChanges: () => void }, label: string) => {
    root(fixture).querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
    fixture.detectChanges();
  };

  it('zeigt anwesende Spieler alphabetisch mit Vornamen (bei gleichem Vornamen mit Initial) und Punkten, Abwesende unter „Nicht da“', async () => {
    const fixture = await render();
    expect(names(fixture)).toEqual(['Elias', 'Jonas B.', 'Jonas K.']);
    expect(text(qa(fixture, '.player')[0])).toContain('1');
    expect(text(root(fixture).querySelector('.away summary'))).toBe('Nicht da (1)');
    expect(text(root(fixture).querySelector('.away p'))).toBe('Ali');
    expect(wakeLock.keepAwake).toHaveBeenCalled();
  });

  it('Plus und Minus ändern um die Schrittweite, auch unter 0; die Reihenfolge bleibt fest', async () => {
    const fixture = await render();
    tap(fixture, 'Minus 1 für Elias');
    tap(fixture, 'Minus 1 für Elias');
    tap(fixture, 'Minus 1 für Elias');
    await vi.waitFor(() => expect(firebase.ratings.privateNotes.get('e1')?.get('p2')).toMatchObject({ points: -2 }));
    const first = qa(fixture, '.player')[0]!;
    expect(text(first.querySelector('.score'))).toBe('−2');
    expect(first.classList.contains('negative')).toBe(true);
    // Jonas K. bekommt viele Punkte, rutscht aber nicht nach oben.
    root(fixture).querySelector<HTMLButtonElement>('.step')!.click();
    fixture.detectChanges();
    tap(fixture, 'Plus 2 für Jonas K.');
    tap(fixture, 'Plus 2 für Jonas K.');
    await vi.waitFor(() => expect(firebase.calls).toContain('addPoints:e1:p1:2'));
    expect(names(fixture)).toEqual(['Elias', 'Jonas B.', 'Jonas K.']);
    expect(text(qa(fixture, '.player')[2]!.querySelector('.score'))).toBe('4');
  });

  it('schreibt die Änderung (increment), nicht den Endwert', async () => {
    const fixture = await render();
    tap(fixture, 'Plus 1 für Elias');
    await vi.waitFor(() => expect(firebase.calls).toContain('addPoints:e1:p2:1'));
    expect(firebase.calls.some((call) => call.startsWith('savePoints'))).toBe(false);
  });

  it('bei einem Spiel gibt es keinen Live-Modus', async () => {
    const fixture = await render({ game: true });
    expect(text(root(fixture).querySelector('.notice'))).toContain('nur bei Trainings');
    expect(qa(fixture, '.pad')).toHaveLength(0);
  });
});
