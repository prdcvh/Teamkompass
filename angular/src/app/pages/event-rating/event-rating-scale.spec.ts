import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { LayoutService } from '../../core/shell/layout.service';
import { CurrentTeam } from '../../core/team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { RatingScaleCard } from '../settings/rating-scale-card';
import { MemberView } from '../member-view/member-view';
import { EventRating } from './event-rating';

/** Bewertungsskala im Formular, in den Einstellungen und in der Spieleransicht (SCRUM-188). */
describe('Bewertungsskala (SCRUM-188)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);
  const levels = { attendance: 'present', effort: 4.5, technique: 3, tactics: 1.5, comprehension: 3, grade: 3.1, scale: 'levels' };

  function setup(options: { label?: string; stored?: string; mobile?: boolean; role?: 'trainer' | 'player' } = {}) {
    isMobile.set(options.mobile ?? false);
    firebase = new FakeFirebase();
    if (options.stored) firebase.settings.settings = { ratingScale: options.stored };
    firebase.events.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-10-05', intensity: 2 });
    firebase.events.events.set('e0', { type: 'Training', title: 'Altes Training', date: '2026-09-01', intensity: 2 });
    firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2017-05-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: 'Elias Wagner', positions: ['RV'], number: 2, birthdate: '2017-06-06', status: 'Fit' });
    // p2 hat noch eine alte Schulnoten-Bewertung im selben Event.
    firebase.ratings.ratings.set('e1', new Map([['p2', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, grade: 2, playerId: 'p2' }]]));
    firebase.ratings.ratings.set('e0', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, grade: 2, playerId: 'p1' }]]));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideFakeFirebase(firebase),
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: 'e1' })) } },
      ],
    });
    if (options.label) TestBed.inject(CurrentTeam).label.set(options.label);
    const session = TestBed.inject(SessionService);
    session.role.set(options.role ?? 'trainer');
    session.playerId.set(options.role === 'player' ? 'p1' : null);
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  async function renderRating() {
    const fixture = TestBed.createComponent(EventRating);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.toolbar, .notice, .empty')).not.toBeNull();
    });
    return fixture;
  }

  it('U9 ohne Wahl: drei Stufen im Formular, gespeichert als 4,5 mit Markierung; alte Schulnoten bleiben Schulnoten', async () => {
    setup({ label: 'U9' });
    const fixture = await renderRating();
    const select = root(fixture).querySelector<HTMLSelectElement>('select[aria-label="Einsatz: Jonas Keller"]')!;
    expect([...select.options].map((option) => option.text)).toEqual(['–', 'lernt', 'kann', 'sicher']);
    expect(root(fixture).querySelector('.scale-legend')?.textContent).toContain('sicher = kann es sicher');
    select.value = '4.5';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(firebase.calls).toContain('saveRating:e1:p1'));
    expect(firebase.ratings.ratings.get('e1')?.get('p1')).toMatchObject({ effort: 4.5, scale: 'levels' });
    const old = root(fixture).querySelector<HTMLSelectElement>('select[aria-label="Einsatz: Elias Wagner"]')!;
    expect([...old.options].map((option) => option.text)).toEqual(['–', '1', '2', '3', '4', '5', '6']);
    expect(firebase.ratings.ratings.get('e1')?.get('p2')).not.toHaveProperty('scale');
  });

  it('Handy: Stufen als Schaltflächen, Gesamt als Stufe', async () => {
    setup({ stored: 'levels', mobile: true });
    firebase.ratings.ratings.get('e1')!.set('p1', { ...levels, playerId: 'p1' });
    const fixture = await renderRating();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(root(fixture).querySelector('.grade'))).toBe('Gesamtnote kann es');
    });
    const chips = [...root(fixture).querySelectorAll<HTMLButtonElement>('[aria-label^="Einsatz"] .chip')].map((chip) => text(chip));
    expect(chips).toEqual(['–', 'lernt es noch', 'kann es', 'kann es sicher']);
  });

  it('U14 (bestehende Teams): Schulnoten wie bisher', async () => {
    setup({ label: 'U14' });
    const fixture = await renderRating();
    const select = root(fixture).querySelector<HTMLSelectElement>('select[aria-label="Einsatz: Jonas Keller"]')!;
    expect([...select.options].map((option) => option.text)).toEqual(['–', '1', '2', '3', '4', '5', '6']);
  });

  it('Einstellungen: Trainer wechselt die Skala, keine Bewertung wird geschrieben', async () => {
    setup({ label: 'U14' });
    const fixture = TestBed.createComponent(RatingScaleCard);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector<HTMLInputElement>('[data-testid="rating-scale-grades"]')?.checked).toBe(true);
    });
    expect(text(root(fixture))).toContain('Standard für U14 ohne eigene Wahl: Schulnoten 1–6');
    const radio = root(fixture).querySelector<HTMLInputElement>('[data-testid="rating-scale-levels"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(firebase.settings.settings).toEqual({ ratingScale: 'levels' }));
    expect(firebase.calls.filter((call) => call.startsWith('saveRating'))).toEqual([]);
    expect(firebase.ratings.ratings.get('e1')?.get('p2')).toMatchObject({ effort: 2, grade: 2 });
  });

  it('Einstellungen: für Spieler unsichtbar und nicht geladen', async () => {
    setup({ role: 'player' });
    const fixture = TestBed.createComponent(RatingScaleCard);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root(fixture).querySelector('input')).toBeNull();
    expect(firebase.calls).not.toContain('watchSettings');
  });

  it('Spieleransicht: Schnitt in der Skala der jüngsten Bewertung, ältere Schulnote bleibt lesbar', async () => {
    setup({ role: 'player' });
    firebase.ratings.ratings.get('e1')!.set('p1', { ...levels, playerId: 'p1' });
    const fixture = TestBed.createComponent(MemberView);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(root(fixture).querySelector('.header .grade'))).toBe('Ø Stufekann es');
    });
    const history = text(root(fixture).querySelector('.history'));
    expect(history).toContain('Stufe kann es');
    expect(history).toContain('Note 2,0');
    expect([...root(fixture).querySelectorAll('.chart text.axis')].slice(0, 3).map((node) => text(node))).toEqual(['lernt', 'kann', 'sicher']);
  });
});
