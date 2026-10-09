import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FirebaseService } from '../../core/firebase.service';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { FakeFirebase } from '../../core/testing';
import { Lineup } from './lineup';

describe('Lineup (Aufstellung)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);

  const squad: [string, string, number, string[], number][] = [
    ['tw', 'Tom Wart', 1, ['TW'], 2],
    ['lv', 'Lars Links', 2, ['LV'], 2.5],
    ['iv1', 'Ida Innen', 3, ['IV'], 2],
    ['iv2', 'Ivo Innen', 4, ['IV'], 3],
    ['rv', 'Rita Rechts', 5, ['RV'], 2],
    ['zm1', 'Zoe Mitte', 6, ['ZM'], 2],
    ['zm2', 'Zack Mitte', 7, ['ZM'], 2],
    ['zm3', 'Zeno Mitte', 8, ['ZM'], 3],
    ['la', 'Lea Außen', 9, ['LA'], 3],
    ['st', '<b>Stu</b> Sturm', 10, ['ST'], 1],
    ['ra', 'Ron Außen', 11, ['RA'], 2],
    ['bank', 'Ben Bank', 12, ['ST', 'IV'], 4],
  ];

  async function render(role: 'trainer' | 'medical' = 'trainer', mobile = false, stored: Record<string, unknown> | null = null) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    for (const [id, name, number, positions] of squad) {
      firebase.players.set(id, { name, positions, number, birthdate: '2012-01-01', status: 'Fit' });
    }
    firebase.events.set('e1', { type: 'Training', title: 'Training', date: '2026-09-01', intensity: 2 });
    firebase.ratings.set(
      'e1',
      new Map(squad.map(([id, , , , grade]) => [id, { attendance: 'present', effort: grade, technique: grade, tactics: grade, comprehension: grade, playerId: id }])),
    );
    firebase.lineup = stored;
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }, { provide: LayoutService, useValue: { isMobile } }] });
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Lineup);
    await fixture.whenStable();
    if (role === 'trainer') {
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(root(fixture).querySelector('.pitch')).not.toBeNull();
      });
    }
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);
  const qa = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => [...root(fixture).querySelectorAll<T>(selector)];
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const flush = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const saved = () => (firebase.lineup as { assignments: Record<string, string[]> } | null)?.assignments;
  const full = { assignments: { TW: ['tw'], LV: ['lv'], IV: ['iv1', 'iv2'], RV: ['rv'], ZM: ['zm1', 'zm2', 'zm3'], LA: ['la'], ST: ['st'], RA: ['ra'] } };

  it('zeigt ohne gespeicherte Startelf den besten Vorschlag mit Formation, Bank und Mannschaftsnote', async () => {
    const fixture = await render();
    expect(text(q(fixture, '.meta'))).toMatch(/^\d(-\d)+ · 11\/11 auf dem Feld · Mannschaftsnote Ø \d,\d$/);
    expect(qa(fixture, '.pitch .chip')).toHaveLength(11);
    expect(qa(fixture, '.bench li')).toHaveLength(1); // 12 Spieler, 11 auf dem Feld
    expect(firebase.calls).not.toContain('saveLineup'); // nur Anzeige, nichts geschrieben
  });

  it('zeigt eine gespeicherte Startelf wie gespeichert (4-3-3, Bankspieler unten)', async () => {
    const fixture = await render('trainer', false, full);
    expect(text(q(fixture, '.meta'))).toContain('4-3-3 · 11/11 auf dem Feld');
    expect(text(q(fixture, '.bench'))).toContain('Ben Bank');
    expect(qa(fixture, '.pitch .chip')).toHaveLength(11);
  });

  it('gibt Spielernamen nie als HTML aus', async () => {
    const fixture = await render('trainer', false, full);
    expect(root(fixture).querySelector('b')).toBeNull();
    expect(text(q(fixture, '.pitch'))).toContain('10 <b>Stu</b>');
  });

  it('wechselt die Formation per Vorlage und speichert die Startelf', async () => {
    const fixture = await render('trainer', false, full);
    const buttons = qa<HTMLButtonElement>(fixture, '.formation');
    expect(buttons.length).toBeGreaterThan(1);
    expect(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(qa(fixture, '.badge')).toHaveLength(1); // genau eine Empfehlung
    buttons[1].click(); // 4-2-3-1 braucht DM/OM: mit diesem Kader nicht voll besetzbar
    await vi.waitFor(() => expect(firebase.calls).toContain('saveLineup'));
    const assignments = saved()!;
    const all = Object.values(assignments).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeLessThan(11);
  });

  it('tauscht beim Auswechseln: Bankspieler kommt aufs Feld, der ersetzte geht auf die Bank', async () => {
    const fixture = await render('trainer', false, full);
    const stChip = qa<HTMLButtonElement>(fixture, '.chip').find((chip) => chip.getAttribute('aria-label')?.includes('Stu'))!;
    stChip.click();
    await flush(fixture);
    expect(text(q(fixture, 'tk-dialog h2'))).toBe('Position ST');
    const options = qa<HTMLButtonElement>(fixture, '.pick button');
    expect(options).toHaveLength(12);
    options.find((button) => text(button).includes('Ben Bank'))!.click();
    await vi.waitFor(() => expect(saved()?.['ST']).toEqual(['bank']));
    expect(Object.values(saved()!).flat()).not.toContain('st');
    expect(Object.values(saved()!).flat()).toHaveLength(11);
  });

  it('tauscht zwei Spieler auf dem Feld', async () => {
    const fixture = await render('trainer', false, full);
    qa<HTMLButtonElement>(fixture, '.chip').find((chip) => chip.getAttribute('aria-label')?.includes('Tom'))!.click();
    await flush(fixture);
    qa<HTMLButtonElement>(fixture, '.pick button').find((button) => text(button).includes('Ida Innen'))!.click();
    await vi.waitFor(() => expect(saved()?.['TW']).toEqual(['iv1']));
    expect(saved()?.['IV']).toContain('tw');
  });

  it('nimmt einen Spieler vom Feld', async () => {
    const fixture = await render('trainer', false, full);
    qa<HTMLButtonElement>(fixture, '.chip').find((chip) => chip.getAttribute('aria-label')?.includes('Ron'))!.click();
    await flush(fixture);
    q<HTMLButtonElement>(fixture, '.actions button')!.click();
    await vi.waitFor(() => expect(saved()?.['RA']).toEqual([]));
    await flush(fixture);
    expect(text(q(fixture, '.meta'))).toContain('10/11 auf dem Feld');
    expect(qa(fixture, '.bench li')).toHaveLength(2);
  });

  it('lehnt den zwölften Spieler auf dem Feld mit einem Hinweis ab', async () => {
    const fixture = await render('trainer', false, full);
    qa<HTMLButtonElement>(fixture, '.bench button')[0].click();
    await flush(fixture);
    expect(text(q(fixture, 'tk-dialog h2'))).toBe('Auf welche Position?');
    qa<HTMLButtonElement>(fixture, '.zone-grid button').find((button) => text(button) === 'ST')!.click();
    await flush(fixture);
    expect(text(q(fixture, 'tk-dialog [role="alert"]'))).toContain('bereits voll');
    expect(firebase.calls).not.toContain('saveLineup');
  });

  it('stellt einen Bankspieler auf eine freie Position, sobald jemand vom Feld ist', async () => {
    const fixture = await render('trainer', false, { assignments: { ...full.assignments, RA: [] } });
    qa<HTMLButtonElement>(fixture, '.bench button').find((button) => text(button).includes('Ben Bank'))!.click();
    await flush(fixture);
    qa<HTMLButtonElement>(fixture, '.zone-grid button').find((button) => text(button) === 'RA')!.click();
    await vi.waitFor(() => expect(saved()?.['RA']).toEqual(['bank']));
  });

  it('markiert Spieler außerhalb ihrer Position', async () => {
    const fixture = await render('trainer', false, { assignments: { ...full.assignments, ST: [], HS: ['st'] } });
    expect(qa(fixture, '.chip.off')).toHaveLength(1);
    expect(qa<HTMLElement>(fixture, '.chip.off')[0].getAttribute('aria-label')).toContain('nicht auf eigener Position');
  });

  it('zeigt am Handy eine Auswahlliste statt der Formationskarten', async () => {
    const fixture = await render('trainer', true, full);
    expect(q(fixture, '.formations')).toBeNull();
    const select = q<HTMLSelectElement>(fixture, 'select[aria-label="Formation wählen"]')!;
    expect(select).not.toBeNull();
    expect(text(select.querySelector('option[selected], option:checked'))).toContain('4-3-3');
  });

  it('zeigt Nicht-Trainern nur einen Hinweis und lädt nichts', async () => {
    const fixture = await render('medical');
    fixture.detectChanges();
    expect(text(root(fixture))).toContain('nur Trainer');
    expect(q(fixture, '.pitch')).toBeNull();
    expect(firebase.calls).not.toContain('watchLineup');
  });
});
