import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { WakeLockService } from '../../core/device/wake-lock.service';
import { pointsFromDoc } from '../../core/points/points';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Live } from './live';

describe('Live-Modus: Beenden und Zusammenfassung (SCRUM-217)', () => {
  /** Eigene Uhr, damit der Doppeltipp-Schutz (300 ms) deterministisch testbar ist. */
  let clock = 1_000_000;
  beforeEach(() => {
    localStorage.removeItem('teamkompass-live-step');
    localStorage.removeItem('teamkompass-live-outbox');
    clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());
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
    TestBed.inject(SessionService).uid.set('uid-trainer');
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
  const tap = (fixture: { nativeElement: unknown; detectChanges: () => void }, label: string, afterMs = 400) => {
    clock += afterMs;
    root(fixture).querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
    fixture.detectChanges();
  };
  const undoButton = (fixture: { nativeElement: unknown }) => root(fixture).querySelector<HTMLButtonElement>('.undo');

  it('Beenden (SCRUM-217): Zusammenfassung mit Sitzungs-Summen, Stand, Sortierung und „Keine Punkte in dieser Sitzung“', async () => {
    const fixture = await render();
    tap(fixture, 'Plus 1 für Elias');
    tap(fixture, 'Plus 1 für Elias');
    tap(fixture, 'Plus 1 für Elias');
    tap(fixture, 'Minus 1 für Jonas K.');
    tap(fixture, 'Minus 1 für Jonas K.');
    // Jonas B.: +1 und wieder −1 hebt sich auf, zählt als „keine Punkte“.
    tap(fixture, 'Plus 1 für Jonas B.');
    tap(fixture, 'Minus 1 für Jonas B.');
    root(fixture).querySelector<HTMLButtonElement>('button.end')!.click();
    fixture.detectChanges();
    expect(qa(fixture, '.pad')).toHaveLength(0);
    const rows = qa(fixture, '.summary .sum-list')[0]!.querySelectorAll('.sum-row');
    expect([...rows].map((row) => text(row.querySelector('.name')) + ' ' + text(row.querySelector('.given')))).toEqual(['Elias +3', 'Jonas K. −2']);
    expect(qa<HTMLInputElement>(fixture, '.summary input').map((input) => input.value)).toEqual(['4', '-2', '0']);
    expect(text(root(fixture).querySelector('.summary h3'))).toBe('Keine Punkte in dieser Sitzung');
    expect(text(qa(fixture, '.summary .sum-list')[1]!.querySelector('.name'))).toBe('Jonas B.');
    // Abwesende erscheinen nicht unter „Keine Punkte“.
    expect(text(root(fixture).querySelector('.summary'))).not.toContain('Ali');
  });

  it('Beenden: Punktzahl in der Zusammenfassung korrigieren (auch negativ), „Weiter live“ und „Fertig“', async () => {
    const fixture = await render();
    tap(fixture, 'Plus 1 für Jonas K.');
    root(fixture).querySelector<HTMLButtonElement>('button.end')!.click();
    fixture.detectChanges();
    const input = root(fixture).querySelector<HTMLInputElement>('.summary input[aria-label="Punkte: Jonas K."]')!;
    input.value = '-4';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await vi.waitFor(() => expect(pointsFromDoc(firebase.ratings.privateNotes.get('e1')?.get('p1'))).toBe(-4));
    expect(input.value).toBe('-4');
    // Die Sitzung hat jetzt −4 vergeben (+1 getippt, −5 korrigiert).
    expect(text(root(fixture).querySelector('.sum-row .given'))).toBe('−4');
    // Ein Spieler ohne Sitzungs-Punkte lässt sich ebenfalls korrigieren.
    const other = root(fixture).querySelector<HTMLInputElement>('.summary input[aria-label="Punkte: Jonas B."]')!;
    other.value = '2';
    other.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(pointsFromDoc(firebase.ratings.privateNotes.get('e1')?.get('p3'))).toBe(2));

    const names = qa<HTMLButtonElement>(fixture, '.sum-actions button').map(text);
    expect(names).toEqual(['Weiter live', 'Fertig']);
    qa<HTMLButtonElement>(fixture, '.sum-actions button')[0]!.click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('.summary')).toBeNull();
    expect(qa(fixture, '.pad').length).toBeGreaterThan(0);
    expect(text(qa(fixture, '.player')[2]!.querySelector('.score'))).toBe('−4');

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    root(fixture).querySelector<HTMLButtonElement>('button.end')!.click();
    fixture.detectChanges();
    qa<HTMLButtonElement>(fixture, '.sum-actions button')[1]!.click();
    expect(navigate).toHaveBeenCalledWith(['/events', 'e1']);
  });

  it('Rücknahme zählt in der Zusammenfassung mit; ohne Tipps steht dort ein Hinweis', async () => {
    const fixture = await render();
    tap(fixture, 'Plus 1 für Elias');
    tap(fixture, 'Plus 1 für Elias');
    clock += 400;
    undoButton(fixture)!.click();
    fixture.detectChanges();
    root(fixture).querySelector<HTMLButtonElement>('button.end')!.click();
    fixture.detectChanges();
    expect(text(root(fixture).querySelector('.sum-row .given'))).toBe('+1');
  });

  it('Beenden ohne Tipps: Hinweis, alle anwesenden Spieler unter „Keine Punkte“', async () => {
    const fixture = await render();
    root(fixture).querySelector<HTMLButtonElement>('button.end')!.click();
    fixture.detectChanges();
    expect(text(root(fixture).querySelector('.summary .note'))).toBe('In dieser Sitzung wurden keine Punkte vergeben.');
    expect(qa(fixture, '.summary .sum-row .name').map(text)).toEqual(['Elias', 'Jonas B.', 'Jonas K.']);
  });
});
