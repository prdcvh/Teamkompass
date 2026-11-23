import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { RatingsService } from '../../core/ratings/ratings.service';
import { LayoutService } from '../../core/shell/layout.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { EventRating } from './event-rating';

describe('EventRating: Stimmigkeit Minuten, Tore, Vorlagen (SCRUM-395)', () => {
  const isMobile = signal(false);
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** Spieldauer 70 (Soll 770 Minuten); `players` Spieler, Spieler 1 hat 70 Minuten und 1 Tor ohne Vorlage. */
  async function render(options: { game?: boolean; mobile?: boolean; players?: number; empty?: boolean } = {}) {
    const { game = true, mobile = false, players = 3, empty = false } = options;
    isMobile.set(mobile);
    const firebase = new FakeFirebase();
    firebase.events.events.set('e1', game
      ? { type: 'Spiel', title: 'Heimspiel', date: '2026-10-10', opponent: 'SV Nord', goalsFor: 3, goalsAgainst: 1, intensity: 3, location: 'Platz 1', matchDuration: 70 }
      : { type: 'Training', title: 'Training Montag', date: '2026-10-05', intensity: 2 });
    for (let i = 1; i <= players; i++) {
      firebase.players.players.set(`p${i}`, { name: `Spieler ${i}`, positions: ['ZM'], number: i, birthdate: '2012-05-05', status: 'Fit' });
    }
    if (!empty) firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', minutes: 70, goals: 1, assists: '', note: '', playerId: 'p1' }]]));
    TestBed.configureTestingModule({
      providers: [
        ...provideFakeFirebase(firebase),
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: 'e1' })) } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(EventRating);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.toolbar, .notice, .empty')).not.toBeNull();
    });
    const root = fixture.nativeElement as HTMLElement;
    const check = () => root.querySelector('tk-match-check');
    const input = (label: string) => root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    const pick = (field: HTMLInputElement, value: string) => {
      field.value = value;
      field.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    return { fixture, root, check, input, pick };
  }

  it('zeigt bei Abweichung eine Warnung mit Text, Symbol und Differenz', async () => {
    const { check } = await render();
    expect(text(check())).toContain('⚠');
    expect(text(check())).toContain('Bitte prüfen (Speichern ist trotzdem möglich)');
    expect(text(check())).toContain('Es fehlen 700 Minuten'); // 70 eingetragen, Soll 70 × 11 = 770
    expect(text(check())).toContain('1 Tor, 0 Vorlagen: 1 Vorlage fehlt');
    expect(check()?.querySelector('[role="status"]')).not.toBeNull();
  });

  it('rechnet bei jeder Änderung neu und zeigt bei Übereinstimmung nur einen ruhigen Hinweis', async () => {
    const { check, input, pick } = await render({ players: 11 });
    for (let i = 2; i <= 10; i++) pick(input(`Minuten: Spieler ${i}`), '70');
    expect(text(check())).toContain('Es fehlen 70 Minuten'); // 10 × 70 von 770
    pick(input('Minuten: Spieler 11'), '70');
    pick(input('Vorlagen: Spieler 2'), '1');
    expect(text(check())).toBe('✓ Minuten, Tore und Vorlagen passen');
    pick(input('Vorlagen: Spieler 2'), '3');
    expect(text(check())).toContain('1 Tor, 3 Vorlagen: 2 Tore fehlen');
  });

  it('meldet zu viele Minuten mit der Differenz (Kader mit 12 Spielern)', async () => {
    const { check, input, pick } = await render({ players: 12 });
    for (let i = 2; i <= 12; i++) pick(input(`Minuten: Spieler ${i}`), '70');
    expect(text(check())).toContain('70 Minuten zu viel'); // 12 × 70 = 840 statt 770
  });

  it('blockiert das Speichern nie: Eingaben bleiben möglich und werden trotz Warnung übernommen', async () => {
    const { check, input, pick } = await render();
    expect(text(check())).toContain('Bitte prüfen');
    expect(input('Minuten: Spieler 2').disabled).toBe(false);
    pick(input('Minuten: Spieler 2'), '10');
    expect(TestBed.inject(RatingsService).ratingFor('p2').minutes).toBe(10);
    expect(text(check())).toContain('Es fehlen 690 Minuten');
  });

  it('bleibt weg, solange nichts eingetragen ist (kein „0“-Fehler)', async () => {
    const { check } = await render({ empty: true });
    expect(text(check())).toBe('');
  });

  it('erscheint bei Trainings nicht', async () => {
    const { check } = await render({ game: false });
    expect(check()).toBeNull();
  });

  it('erscheint auch in der Handy-Ansicht', async () => {
    const { check } = await render({ mobile: true });
    expect(text(check())).toContain('Es fehlen 700 Minuten');
  });
});
