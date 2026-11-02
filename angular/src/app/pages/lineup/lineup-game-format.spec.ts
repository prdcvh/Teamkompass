import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LayoutService } from '../../core/shell/layout.service';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { todayIso } from '../../core/shared/dates';
import { Lineup } from './lineup';

const day = (offset: number) => todayIso(new Date(Date.now() + offset * 86_400_000));

describe('Lineup: Spielformen (SCRUM-187)', () => {
  let firebase: FakeFirebase;
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
    ['st', 'Stu Sturm', 10, ['ST'], 1],
    ['ra', 'Ron Außen', 11, ['RA'], 2],
    ['bank', 'Ben Bank', 12, ['ST', 'IV'], 4],
  ];
  const full = { assignments: { TW: ['tw'], LV: ['lv'], IV: ['iv1', 'iv2'], RV: ['rv'], ZM: ['zm1', 'zm2', 'zm3'], LA: ['la'], ST: ['st'], RA: ['ra'] } };

  async function render(teamFormat: string | null, stored: Record<string, unknown> | null, games: [string, number][]) {
    firebase = new FakeFirebase();
    for (const [id, name, number, positions] of squad) firebase.players.players.set(id, { name, positions, number, birthdate: '2012-01-01', status: 'Fit' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-09-01', intensity: 2 });
    firebase.ratings.ratings.set(
      'e1',
      new Map(squad.map(([id, , , , grade]) => [id, { attendance: 'present', effort: grade, technique: grade, tactics: grade, comprehension: grade, playerId: id }])),
    );
    for (const [id, offset] of games) firebase.events.events.set(id, { type: 'Spiel', title: `Spiel ${id}`, date: day(offset), intensity: 3, opponent: 'SV Nord' });
    firebase.lineup.lineup = stored;
    if (teamFormat) firebase.settings.settings = { gameFormat: teamFormat };
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile: signal(false) } }] });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Lineup);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.pitch')).not.toBeNull();
    });
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

  const formatSelect = (fixture: { nativeElement: unknown }) => q<HTMLSelectElement>(fixture, '.target [data-testid="game-format"]')!;
  const byEvent = () => (firebase.lineup.lineup as { byEvent?: Record<string, { assignments: Record<string, string[]>; gameFormat?: string }> } | null)?.byEvent;

  const renderWith = (teamFormat: string | null, stored: Record<string, unknown> | null = null, games: [string, number][] = []) => render(teamFormat, stored, games);

  it('ohne Spielform im Team gilt 11:11 und die Aufstellung bleibt unverändert', async () => {
    const fixture = await renderWith(null, full);
    expect(text(q(fixture, '.meta'))).toContain('4-3-3 · 11/11 auf dem Feld');
    expect(q(fixture, '[data-testid="rotation-hint"]')).toBeNull();
    expect(qa(fixture, '.pitch .zone')).toHaveLength(14);
  });

  it('5:5 aus den Teameinstellungen: zwei Formationen, nur genutzte Zonen, Rotationshinweis, Vorschlag mit fünf Spielern', async () => {
    const fixture = await renderWith('5:5');
    expect(text(q(fixture, '.meta'))).toContain('0/5 auf dem Feld (5:5)');
    expect(qa(fixture, '.formation strong').map(text)).toEqual(['1-2-1', '2-2']);
    expect(qa(fixture, '.pitch .zone').length).toBeLessThan(14);
    expect(text(q(fixture, '[data-testid="rotation-hint"]'))).toContain('ähnlich viel spielen');
    q<HTMLButtonElement>(fixture, 'button.suggest')!.click();
    await vi.waitFor(() => expect(firebase.calls).toContain('saveLineup'));
    await flush(fixture);
    expect(qa(fixture, '.pitch .chip')).toHaveLength(5);
    expect(text(q(fixture, '.meta'))).toContain('5/5 auf dem Feld');
    expect(qa(fixture, '.bench li')).toHaveLength(7);
  });

  it('lehnt den sechsten Spieler bei 5:5 ab', async () => {
    const fixture = await renderWith('5:5', { assignments: { TW: ['tw'], LV: ['lv'], RV: ['rv'], LA: ['la'], RA: ['ra'] } });
    qa<HTMLButtonElement>(fixture, '.bench button')[0].click();
    await flush(fixture);
    qa<HTMLButtonElement>(fixture, '.zone-grid button')[0].click();
    await flush(fixture);
    expect(text(q(fixture, '.error'))).toContain('voll (5 Spieler)');
  });

  it('3:3 hat kein Tor und keinen Torwart, Hinweis zur Einsatzzeit', async () => {
    const fixture = await renderWith('3:3');
    expect(qa(fixture, '.formation strong').map(text)).toEqual(['1-2', '2-1']);
    expect(qa(fixture, '.pitch .slot').map(text)).not.toContain('TW');
    expect(q(fixture, '[data-testid="rotation-hint"]')).not.toBeNull();
  });

  it('7:7 und 9:9 zeigen ihre Formationen ohne Rotationshinweis', async () => {
    const fixture = await renderWith('7:7');
    expect(qa(fixture, '.formation strong').map(text)).toEqual(['2-3-1', '3-2-1']);
    expect(q(fixture, '[data-testid="rotation-hint"]')).toBeNull();
    TestBed.resetTestingModule();
    const nine = await renderWith('9:9');
    expect(qa(nine, '.formation strong').map(text)).toEqual(['3-3-2', '3-2-3']);
  });

  it('die Spielform lässt sich bei einem einzelnen Spiel ändern, bleibt am Spiel und beim Bearbeiten erhalten', async () => {
    const fixture = await renderWith(null, null, [['bald', 3]]);
    expect(formatSelect(fixture).value).toBe('11:11');
    formatSelect(fixture).value = '7:7';
    formatSelect(fixture).dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(byEvent()?.['bald']?.gameFormat).toBe('7:7'));
    await flush(fixture);
    expect(text(q(fixture, '.meta'))).toContain('0/7 auf dem Feld (7:7)');
    expect(qa(fixture, '.formation strong').map(text)).toEqual(['2-3-1', '3-2-1']);
    q<HTMLButtonElement>(fixture, 'button.suggest')!.click();
    await vi.waitFor(() => expect(Object.values(byEvent()!['bald'].assignments).flat()).toHaveLength(7));
    expect(byEvent()!['bald'].gameFormat).toBe('7:7'); // Bearbeiten behält die Spielform des Spiels
    expect((firebase.settings.settings ?? {})['gameFormat']).toBeUndefined(); // Teameinstellung unberührt
  });

  it('beim Wechsel auf eine kleinere Spielform gehen Überzählige und der Torwart (3:3) auf die Bank', async () => {
    const fixture = await renderWith(null, { byEvent: { bald: { assignments: full.assignments, savedAt: '2026-10-01T10:00:00.000Z' } } }, [['bald', 3]]);
    formatSelect(fixture).value = '3:3';
    formatSelect(fixture).dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(byEvent()?.['bald']?.gameFormat).toBe('3:3'));
    const placed = Object.values(byEvent()!['bald'].assignments).flat();
    expect(placed).toHaveLength(3);
    expect(byEvent()!['bald'].assignments['TW']).toEqual([]);
  });

  it('das Spiel überschreibt die Teamform; ein anderes Spiel nutzt wieder die Teamform', async () => {
    const fixture = await renderWith('5:5', { byEvent: { bald: { assignments: {}, savedAt: '2026-10-01T10:00:00.000Z', gameFormat: '9:9' } } }, [['bald', 3], ['spaet', 14]]);
    expect(formatSelect(fixture).value).toBe('9:9');
    const target = q<HTMLSelectElement>(fixture, 'select[aria-label="Aufstellung für"]')!;
    target.value = 'spaet';
    target.dispatchEvent(new Event('change'));
    await flush(fixture);
    expect(formatSelect(fixture).value).toBe('5:5');
  });
});
