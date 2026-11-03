import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { CurrentTeam } from '../../core/team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Knowledge } from './knowledge';

describe('Lernpfade im Tab „Wissen“ (SCRUM-192)', () => {
  let firebase: FakeFirebase;

  async function render(options: { denied?: boolean } = {}) {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Tom Tor', positions: ['TW'], number: 1, birthdate: '2012-05-05' });
    firebase.players.players.set('p2', { name: 'Sina Sturm', positions: ['ST'], number: 9, birthdate: '2012-05-05' });
    firebase.knowledge.doc = { knowledge: { k1: { type: 'link', title: 'Fangtechnik Video', url: 'https://www.youtube.com/watch?v=abc', description: '', category: '' } } };
    firebase.learning.paths.set('lp1', {
      title: 'Torwart: Fangen',
      position: 'TW',
      ageGroup: 'U14',
      levels: [
        { id: 'a', title: 'Grundstellung', unit: 'x', minutes: 3, url: null, homeTask: '' },
        { id: 'b', title: 'Hohe Bälle', unit: 'y', minutes: 5, url: null, homeTask: '' },
      ],
    });
    firebase.learning.progress.set('p1', { playerId: 'p1', paths: { lp1: { a: '2026-10-13' } } });
    if (options.denied) firebase.learning.watchError = { code: 'permission-denied' };
    await TestBed.configureTestingModule({ imports: [Knowledge], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    TestBed.inject(SessionService).role.set('trainer');
    TestBed.inject(CurrentTeam).label.set('U14');
    const fixture = TestBed.createComponent(Knowledge);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const button = (fixture: { nativeElement: unknown }, text: string | RegExp) =>
    [...root(fixture).querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      typeof text === 'string' ? b.textContent?.trim() === text || b.getAttribute('aria-label') === text : text.test(b.textContent ?? ''),
    );
  function type(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string, event = 'input') {
    element.value = value;
    element.dispatchEvent(new Event(event, { bubbles: true }));
  }

  it('listet Pfade mit Position, Altersklasse und Stufen', async () => {
    const fixture = await render();
    const list = root(fixture).querySelector('[data-testid="path-list"]')!;
    expect(list.textContent).toContain('Torwart: Fangen');
    expect(list.textContent).toContain('TW');
    expect(list.textContent).toContain('U14');
    expect(list.textContent).toContain('Stufe 2 Hohe Bälle');
  });

  it('Trainer bestätigt die nächste Stufe eines passenden Spielers und nimmt sie zurück', async () => {
    const fixture = await render();
    button(fixture, 'Stufen bestätigen')!.click();
    await fixture.whenStable();
    const players = root(fixture).querySelector('[data-testid="player-progress"]')!;
    // Nur der Torwart passt zur Position des Pfads.
    expect(players.textContent).toContain('Tom Tor');
    expect(players.textContent).not.toContain('Sina Sturm');
    expect(players.textContent).toContain('1 von 2 Stufen bestätigt');
    button(fixture, 'Stufe 2 für Tom Tor bestätigen')!.click();
    await fixture.whenStable();
    expect(firebase.calls.some((call) => call.startsWith('setLevel:p1:lp1:b:'))).toBe(true);
    await vi.waitFor(() => expect(root(fixture).textContent).toContain('Alle 2 Stufen bestätigt'));
    button(fixture, 'Stufe 2 für Tom Tor zurücknehmen')!.click();
    await fixture.whenStable();
    expect(firebase.calls).toContain('setLevel:p1:lp1:b:null');
  });

  it('legt einen Pfad an und übernimmt einen Link aus „Wissen“', async () => {
    const fixture = await render();
    button(fixture, '+ Lernpfad anlegen')!.click();
    await fixture.whenStable();
    const field = (name: string) => root(fixture).querySelector(`[name="${name}"]`) as HTMLInputElement;
    // Ohne Angaben: Fehler, nichts gespeichert.
    (root(fixture).querySelector('tk-path-dialog form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(root(fixture).textContent).toContain('Bitte einen Namen für den Lernpfad angeben.');
    expect(firebase.calls.some((call) => call.startsWith('savePath'))).toBe(false);

    expect((field('pathAgeGroup') as unknown as HTMLSelectElement).value).toBe('U14');
    type(field('pathTitle'), 'Feldspieler: erster Kontakt');
    type(field('levelTitle0'), 'Ballannahme');
    type(field('levelUnit0'), 'Zu zweit passen');
    type(field('levelKnowledge0') as unknown as HTMLSelectElement, 'k1', 'change');
    await fixture.whenStable();
    expect(field('levelUrl0').value).toBe('https://www.youtube.com/watch?v=abc');
    button(fixture, '+ Stufe hinzufügen')!.click();
    await fixture.whenStable();
    type(field('levelTitle1'), 'Schulterblick');
    type(field('levelUnit1'), 'Vor dem Pass schauen');
    type(field('levelHomeTask1'), 'Wand-Pässe');
    (root(fixture).querySelector('tk-path-dialog form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    const saved = [...firebase.learning.paths.values()].find((path) => path['title'] === 'Feldspieler: erster Kontakt');
    expect(saved).toMatchObject({ position: '', ageGroup: 'U14' });
    expect((saved?.['levels'] as unknown[]).length).toBe(2);
    expect(saved?.['levels']).toMatchObject([{ title: 'Ballannahme', url: 'https://www.youtube.com/watch?v=abc' }, { title: 'Schulterblick', homeTask: 'Wand-Pässe' }]);
  });

  it('löscht einen Pfad erst nach Rückfrage', async () => {
    const fixture = await render();
    button(fixture, 'Lernpfad bearbeiten: Torwart: Fangen')!.click();
    await fixture.whenStable();
    button(fixture, 'Lernpfad löschen')!.click();
    await fixture.whenStable();
    expect(root(fixture).textContent).toContain('mit allen bestätigten Stufen der Spieler darin');
    expect(firebase.calls.some((call) => call.startsWith('deletePath'))).toBe(false);
    [...root(fixture).querySelectorAll<HTMLButtonElement>('tk-learning-paths button')].find((b) => b.textContent?.trim() === 'Endgültig löschen')!.click();
    await fixture.whenStable();
    expect(firebase.calls).toContain('deletePath:lp1:p1');
  });

  it('ohne veröffentlichte Regeln: Hinweis statt Fehler', async () => {
    const fixture = await render({ denied: true });
    await vi.waitFor(() => expect(root(fixture).textContent).toContain('Lernpfade sind in diesem Team noch nicht freigeschaltet'));
    expect(button(fixture, '+ Lernpfad anlegen')).toBeUndefined();
  });
});
