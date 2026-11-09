import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LayoutService } from '../../core/shell/layout.service';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Lineup } from './lineup';

/** Drag & Drop auf der Aufstellungsseite (SCRUM-286): Pointer Events wie von Maus bzw. Finger. */
describe('Lineup – Spieler ziehen (SCRUM-286)', () => {
  let firebase: FakeFirebase;
  /** Element, das „unter dem Zeiger“ liegt (jsdom kennt kein Layout). */
  let under: Element | null = null;

  const squad: [string, string, number, string[]][] = [
    ['tw', 'Tom Wart', 1, ['TW']],
    ['iv1', 'Ida Innen', 3, ['IV']],
    ['iv2', 'Ivo Innen', 4, ['IV']],
    ['st', 'Stu Sturm', 10, ['ST']],
    ['bank', 'Ben Bank', 12, ['ST', 'IV']],
    ...['lv', 'rv', 'zm1', 'zm2', 'zm3', 'la', 'ra'].map((id, index): [string, string, number, string[]] => [id, `Feld ${id}`, 20 + index, ['ZM']]),
  ];

  async function render(stored: Record<string, string[]>) {
    firebase = new FakeFirebase();
    for (const [id, name, number, positions] of squad) {
      firebase.players.players.set(id, { name, positions, number, birthdate: '2012-01-01', status: 'Fit' });
    }
    firebase.lineup.lineup = { assignments: stored };
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile: signal(false) } }] });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Lineup);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el(fixture, '.pitch .chip')).not.toBeNull();
    });
    return fixture;
  }

  const el = <T extends Element = HTMLElement>(fixture: { nativeElement: unknown }, selector: string) => (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  const chip = (fixture: { nativeElement: unknown }, name: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.chip')].find((button) => button.getAttribute('aria-label')?.startsWith(name))!;
  const benchButton = (fixture: { nativeElement: unknown }, name: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.bench button')].find((button) => button.getAttribute('aria-label')?.startsWith(name))!;
  const saved = () => (firebase.lineup.lineup as { assignments: Record<string, string[]> }).assignments;

  function pointer(target: Element, type: string, x: number, y: number, pointerType = 'mouse') {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 7 }, isPrimary: { value: true }, pointerType: { value: pointerType } });
    target.dispatchEvent(event);
  }

  /** Zieht vom Element `from` (bzw. dessen Kind `handle`) und lässt über `to` los. */
  async function dragTo(fixture: { detectChanges: () => void }, from: HTMLElement, to: () => Element | null, pointerType = 'mouse', handle: Element = from) {
    pointer(handle, 'pointerdown', 10, 10, pointerType);
    pointer(from, 'pointermove', 30, 40, pointerType);
    fixture.detectChanges();
    under = to();
    pointer(from, 'pointermove', 50, 60, pointerType);
    fixture.detectChanges();
    pointer(from, 'pointerup', 50, 60, pointerType);
    fixture.detectChanges();
  }

  beforeEach(() => {
    under = null;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => under });
  });

  it('stellt einen Bankspieler per Ziehen auf eine freie Position und öffnet dabei keinen Dialog', async () => {
    const fixture = await render({ TW: ['tw'] });
    await dragTo(fixture, benchButton(fixture, 'Stu Sturm'), () => el(fixture, '[data-drop="zone:ST"]'));
    await vi.waitFor(() => expect(saved()['ST']).toEqual(['st']));
    el<HTMLButtonElement>(fixture, '.bench button')!.click(); // der Klick, den der Browser nach dem Loslassen schickt
    fixture.detectChanges();
    expect(el(fixture, 'tk-dialog h2')?.textContent).not.toContain('Auf welche Position?');
  });

  it('hebt beim Ziehen das Ziel hervor und zeigt die Fläche „vom Feld nehmen“', async () => {
    const fixture = await render({ TW: ['tw'], ST: ['st'] });
    const source = chip(fixture, 'Stu Sturm');
    pointer(source, 'pointerdown', 10, 10);
    pointer(source, 'pointermove', 30, 40);
    fixture.detectChanges();
    expect(el(fixture, '[data-testid="remove-drop"]')).not.toBeNull();
    expect(el(fixture, '.ghost')?.textContent).toContain('10 Stu');
    under = el(fixture, '[data-drop="zone:IV"]');
    pointer(source, 'pointermove', 40, 50);
    fixture.detectChanges();
    expect(el(fixture, '[data-drop="zone:IV"]')!.classList).toContain('over');
    pointer(source, 'pointercancel', 40, 50);
    fixture.detectChanges();
    expect(el(fixture, '.ghost')).toBeNull();
    expect(el(fixture, '.over')).toBeNull();
    expect(saved()['ST']).toEqual(['st']); // abgebrochen: nichts gespeichert
  });

  it('nimmt einen Feldspieler vom Feld, wenn er auf „vom Feld nehmen“ gezogen wird', async () => {
    const fixture = await render({ TW: ['tw'], ST: ['st'] });
    await dragTo(fixture, chip(fixture, 'Stu Sturm'), () => el(fixture, '[data-testid="remove-drop"]'), 'touch');
    await vi.waitFor(() => expect(saved()['ST']).toEqual([]));
    expect(saved()['TW']).toEqual(['tw']);
  });

  it('nimmt einen Feldspieler vom Feld, wenn er auf die Bank gezogen wird', async () => {
    const fixture = await render({ TW: ['tw'], ST: ['st'] });
    await dragTo(fixture, chip(fixture, 'Tom Wart'), () => el(fixture, '.bench-panel h2'));
    await vi.waitFor(() => expect(saved()['TW']).toEqual([]));
  });

  it('tauscht beim Ziehen auf einen Feldspieler: der verdrängte geht auf die Bank', async () => {
    const fixture = await render({ TW: ['tw'], ST: ['st'] });
    await dragTo(fixture, benchButton(fixture, 'Ben Bank'), () => chip(fixture, 'Stu Sturm').querySelector('strong'));
    await vi.waitFor(() => expect(saved()['ST']).toEqual(['bank']));
    expect(Object.values(saved()).flat()).not.toContain('st');
  });

  it('zieht mit dem Finger aus der Bank nur über den Griff (sonst scrollt die Seite)', async () => {
    const fixture = await render({ TW: ['tw'] });
    const row = benchButton(fixture, 'Stu Sturm');
    await dragTo(fixture, row, () => el(fixture, '[data-drop="zone:ST"]'), 'touch', row.querySelector('.who')!);
    expect(el(fixture, '.ghost')).toBeNull();
    expect(saved()['ST'] ?? []).toEqual([]);
    await dragTo(fixture, benchButton(fixture, 'Stu Sturm'), () => el(fixture, '[data-drop="zone:ST"]'), 'touch', benchButton(fixture, 'Stu Sturm').querySelector('.grip')!);
    await vi.waitFor(() => expect(saved()['ST']).toEqual(['st']));
  });

  it('öffnet beim einfachen Klick wie bisher den Dialog (kein Ziehen ohne Bewegung)', async () => {
    const fixture = await render({ TW: ['tw'], ST: ['st'] });
    const source = chip(fixture, 'Stu Sturm');
    pointer(source, 'pointerdown', 10, 10);
    pointer(source, 'pointermove', 12, 11); // unter der Schwelle
    pointer(source, 'pointerup', 12, 11);
    source.click();
    fixture.detectChanges();
    expect(el(fixture, 'tk-dialog h2')?.textContent).toContain('Position ST');
    expect(el(fixture, '.ghost')).toBeNull();
  });

  it('meldet über dem Feld, wenn die Startelf schon voll ist, und stellt bei Platz zusätzlich auf', async () => {
    const elf = { TW: ['tw'], LV: ['lv'], IV: ['iv1', 'iv2'], RV: ['rv'], ZM: ['zm1', 'zm2', 'zm3'], LA: ['la'], ST: ['st'], RA: ['ra'] };
    const fixture = await render(elf);
    await dragTo(fixture, benchButton(fixture, 'Ben Bank'), () => el(fixture, '[data-drop="zone:IV"]'));
    expect(el(fixture, '[data-testid="drop-message"]')?.textContent).toContain('bereits voll (11 Spieler)');
    expect(saved()).toEqual(elf);
    await dragTo(fixture, chip(fixture, 'Tom Wart'), () => el(fixture, '[data-testid="remove-drop"]'));
    await vi.waitFor(() => expect(saved()['TW']).toEqual([]));
    fixture.detectChanges();
    await dragTo(fixture, benchButton(fixture, 'Ben Bank'), () => el(fixture, '[data-drop="zone:IV"]'));
    await vi.waitFor(() => expect(saved()['IV']).toEqual(['iv1', 'iv2', 'bank']));
    expect(el(fixture, '[data-testid="drop-message"]')).toBeNull();
  });
});
