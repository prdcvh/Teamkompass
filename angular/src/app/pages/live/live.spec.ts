import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { WakeLockService } from '../../core/device/wake-lock.service';
import { pointsFromDoc } from '../../core/points/points';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Live } from './live';

describe('Live (Live-Modus, SCRUM-213/214/215)', () => {
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
  const names = (fixture: { nativeElement: unknown }) => qa(fixture, '.player .name').map(text);
  const tap = (fixture: { nativeElement: unknown; detectChanges: () => void }, label: string, afterMs = 400) => {
    clock += afterMs;
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
    await vi.waitFor(() => expect(pointsFromDoc(firebase.ratings.privateNotes.get('e1')?.get('p2'))).toBe(-2));
    const first = qa(fixture, '.player')[0]!;
    expect(text(first.querySelector('.score'))).toBe('−2');
    expect(first.classList.contains('negative')).toBe(true);
    // Jonas K. bekommt viele Punkte, rutscht aber nicht nach oben.
    tap(fixture, 'Schrittweite 2');
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

  const stepButtons = (fixture: { nativeElement: unknown }) => qa(fixture, '.step-row .step:not(.other)').map(text);
  const enterCustom = (fixture: { nativeElement: unknown; detectChanges: () => void }, value: string) => {
    if (!root(fixture).querySelector('.custom')) {
      root(fixture).querySelector<HTMLButtonElement>('.step.other')!.click();
      fixture.detectChanges();
    }
    const input = root(fixture).querySelector<HTMLInputElement>('.custom input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    root(fixture).querySelector<HTMLFormElement>('.custom')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  it('Umschaltleiste mit 1 2 3 5, gewählter Wert hervorgehoben, Plus/Minus zeigen die Schrittweite', async () => {
    const fixture = await render();
    expect(stepButtons(fixture)).toEqual(['1', '2', '3', '5']);
    expect(qa(fixture, '.step.active').map(text)).toEqual(['1']);
    tap(fixture, 'Schrittweite 3');
    expect(qa(fixture, '.step.active').map(text)).toEqual(['3']);
    expect(text(qa(fixture, '.pad.plus')[0])).toBe('+3');
    expect(text(qa(fixture, '.pad.minus')[0])).toBe('−3');
    tap(fixture, 'Plus 3 für Elias');
    await vi.waitFor(() => expect(firebase.calls).toContain('addPoints:e1:p2:3'));
  });

  it('eigene Zahl: ungültige Eingaben werden mit Hinweis abgelehnt, gültige werden gewählt und als Knopf ergänzt', async () => {
    const fixture = await render();
    for (const bad of ['', '0', '-2', '2.5', '21']) {
      enterCustom(fixture, bad);
      expect(text(root(fixture).querySelector('.hint.error')), bad).toContain('ganze Zahl von 1 bis 20');
      expect(stepButtons(fixture)).toEqual(['1', '2', '3', '5']);
      expect(qa(fixture, '.step.active').map(text)).toEqual(['1']);
    }
    enterCustom(fixture, '7');
    expect(stepButtons(fixture)).toEqual(['1', '2', '3', '5', '7']);
    expect(qa(fixture, '.step.active').map(text)).toEqual(['7']);
    expect(root(fixture).querySelector('.hint.error')).toBeNull();
    expect(text(qa(fixture, '.pad.plus')[0])).toBe('+7');
  });

  it('merkt die Schrittweite (und die eigene Zahl) für den nächsten Start und zeigt dann kurz „Schrittweite: 7“', async () => {
    const first = await render();
    expect(root(first).querySelector('.hint')).toBeNull(); // Standard 1: kein Hinweis
    enterCustom(first, '7');
    first.destroy();
    TestBed.resetTestingModule();
    const second = await render();
    expect(stepButtons(second)).toEqual(['1', '2', '3', '5', '7']);
    expect(qa(second, '.step.active').map(text)).toEqual(['7']);
    expect(text(root(second).querySelector('.hint'))).toBe('Schrittweite: 7');
  });

  const feedback = (fixture: { nativeElement: unknown }) => text(root(fixture).querySelector('.feedback'));
  const undoButton = (fixture: { nativeElement: unknown }) => root(fixture).querySelector<HTMLButtonElement>('.undo');
  const undo = (fixture: { nativeElement: unknown; detectChanges: () => void }) => {
    clock += 400;
    undoButton(fixture)!.click();
    fixture.detectChanges();
  };

  it('zeigt nach jedem Tipp die neue Punktzahl groß und einen Rückgängig-Knopf mit Namen und Änderung', async () => {
    const fixture = await render();
    expect(feedback(fixture)).toBe('');
    expect(undoButton(fixture)).toBeNull();
    tap(fixture, 'Plus 1 für Elias');
    expect(feedback(fixture)).toBe('Elias +1 → 2');
    expect(text(undoButton(fixture))).toBe('Rückgängig: Elias +1');
    tap(fixture, 'Schrittweite 2');
    tap(fixture, 'Minus 2 für Jonas K.');
    expect(feedback(fixture)).toBe('Jonas K. −2 → −2');
    expect(text(undoButton(fixture))).toBe('Rückgängig: Jonas K. −2');
    expect(root(fixture).querySelector('.feedback.down')).not.toBeNull();
  });

  it('Rückgängig nimmt genau die letzte Änderung zurück, mehrfach Schritt für Schritt', async () => {
    const fixture = await render();
    tap(fixture, 'Plus 1 für Elias');
    tap(fixture, 'Schrittweite 3');
    tap(fixture, 'Minus 3 für Jonas B.');
    tap(fixture, 'Plus 3 für Elias');
    expect(text(qa(fixture, '.player')[0]!.querySelector('.score'))).toBe('5');
    undo(fixture); // Elias +3 zurück
    expect(text(qa(fixture, '.player')[0]!.querySelector('.score'))).toBe('2');
    expect(text(undoButton(fixture))).toBe('Rückgängig: Jonas B. −3');
    undo(fixture);
    expect(text(qa(fixture, '.player')[1]!.querySelector('.score'))).toBe('0');
    undo(fixture);
    expect(text(qa(fixture, '.player')[0]!.querySelector('.score'))).toBe('1');
    expect(undoButton(fixture)).toBeNull(); // nichts mehr zurückzunehmen
    // Rückgängig schreibt als Gegen-Increment, nicht als Endwert.
    await vi.waitFor(() => expect(firebase.calls).toContain('addPoints:e1:p2:-3'));
    expect(firebase.calls.some((call) => call.startsWith('savePoints'))).toBe(false);
  });

  it('der Rückgängig-Knopf verschwindet nach einigen Sekunden; die Änderungen bleiben zurücknehmbar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const fixture = await render();
      tap(fixture, 'Plus 1 für Elias');
      expect(undoButton(fixture)).not.toBeNull();
      vi.advanceTimersByTime(6100);
      fixture.detectChanges();
      expect(undoButton(fixture)).toBeNull();
      expect(feedback(fixture)).toBe('');
      tap(fixture, 'Plus 1 für Elias');
      undo(fixture);
      undo(fixture);
      expect(text(qa(fixture, '.player')[0]!.querySelector('.score'))).toBe('1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Doppeltipp-Schutz: zwei Tipps auf denselben Knopf innerhalb von 300 ms zählen einmal, Tipps mit Abstand und andere Knöpfe nicht', async () => {
    const fixture = await render();
    tap(fixture, 'Plus 1 für Elias');
    tap(fixture, 'Plus 1 für Elias', 100); // Prellen
    expect(text(qa(fixture, '.player')[0]!.querySelector('.score'))).toBe('2');
    tap(fixture, 'Minus 1 für Elias', 50); // anderer Knopf: zählt
    expect(text(qa(fixture, '.player')[0]!.querySelector('.score'))).toBe('1');
    tap(fixture, 'Plus 1 für Jonas K.', 50); // anderer Spieler: zählt
    expect(text(qa(fixture, '.player')[2]!.querySelector('.score'))).toBe('1');
    // Bewusst schnell: dreimal +1 im Abstand von 320 ms geht durch.
    tap(fixture, 'Plus 1 für Jonas B.', 400);
    tap(fixture, 'Plus 1 für Jonas B.', 320);
    tap(fixture, 'Plus 1 für Jonas B.', 320);
    expect(text(qa(fixture, '.player')[1]!.querySelector('.score'))).toBe('3');
    await vi.waitFor(() => expect(firebase.calls.filter((call) => call === 'addPoints:e1:p2:1')).toHaveLength(1));
  });

  it('Rückgängig hat denselben Schutz gegen Prellen, ohne Datenlöschen im Live-Modus', async () => {
    const fixture = await render();
    tap(fixture, 'Plus 1 für Elias');
    tap(fixture, 'Plus 1 für Jonas K.');
    clock += 400;
    undoButton(fixture)!.click();
    clock += 100;
    undoButton(fixture)!.click(); // Prellen: nur eine Änderung zurück
    fixture.detectChanges();
    expect(text(qa(fixture, '.player')[2]!.querySelector('.score'))).toBe('0');
    expect(text(qa(fixture, '.player')[0]!.querySelector('.score'))).toBe('2');
    // „Beenden“ fragt nicht nach und es gibt keine Lösch-Knöpfe.
    expect(root(fixture).querySelector('.end')!.tagName).toBe('BUTTON');
    expect(qa(fixture, 'button').some((button) => /lösch|entfern|zurücksetzen/i.test(text(button)))).toBe(false);
  });

  it('bei einem Spiel gibt es keinen Live-Modus', async () => {
    const fixture = await render({ game: true });
    expect(text(root(fixture).querySelector('.notice'))).toContain('nur bei Trainings');
    expect(qa(fixture, '.pad')).toHaveLength(0);
  });

  it('Funkloch (SCRUM-216): Hinweis oben zeigt „Gespeichert“ bzw. „Offline“ mit Anzahl, Zeilen zeigen „noch nicht gesendet“', async () => {
    const fixture = await render();
    const status = () => root(fixture).querySelector('.bar .save');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(status())).toBe('Gespeichert');
    });
    firebase.ratings.goOffline();
    tap(fixture, 'Plus 1 für Elias');
    tap(fixture, 'Plus 1 für Elias');
    tap(fixture, 'Minus 1 für Jonas K.');
    fixture.detectChanges();
    // Weiter tippen geht, die Punkte erscheinen sofort.
    expect(text(qa(fixture, '.player')[0]!.querySelector('.score'))).toBe('3');
    expect(text(status())).toBe('Offline – wird gespeichert, sobald Netz da ist (3 Änderungen warten)');
    expect(status()!.classList.contains('offline')).toBe(true);
    expect(text(qa(fixture, '.player')[0]!.querySelector('.waiting'))).toBe('noch nicht gesendet (2)');
    expect(text(qa(fixture, '.player')[2]!.querySelector('.waiting'))).toBe('noch nicht gesendet (1)');
    expect(qa(fixture, '.player')[1]!.querySelector('.waiting')).toBeNull();

    firebase.ratings.goOnline();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(status())).toBe('Gespeichert');
    });
    expect(qa(fixture, '.waiting')).toHaveLength(0);
    expect(text(qa(fixture, '.player')[0]!.querySelector('.score'))).toBe('3');
    expect(pointsFromDoc(firebase.ratings.privateNotes.get('e1')?.get('p2'))).toBe(3);
  });

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
