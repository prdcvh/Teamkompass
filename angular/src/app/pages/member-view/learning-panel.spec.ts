import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { playerFromDoc } from '../../core/player/player';
import { CurrentTeam } from '../../core/team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { LearningSummary } from '../profile/learning-summary';
import { LearningPanel } from './learning-panel';

describe('Lernpfad in der Ansicht von Spieler und Eltern (SCRUM-192)', () => {
  let firebase: FakeFirebase;
  const goalkeeper = playerFromDoc('p1', { name: 'Tom Tor', positions: ['TW'], number: 1, birthdate: '2012-05-05' });
  const striker = playerFromDoc('p2', { name: 'Sina Sturm', positions: ['ST'], number: 9, birthdate: '2012-05-05' });

  async function render<T>(component: Type<T>, role: Role, playerId: string | null, player = goalkeeper) {
    firebase = new FakeFirebase();
    firebase.learning.paths.set('lp1', {
      title: 'Torwart: Fangen',
      position: 'TW',
      ageGroup: 'U14',
      levels: [
        { id: 'a', title: 'Grundstellung', unit: 'Bälle in Brusthöhe', minutes: 3, url: null, homeTask: 'Wand' },
        { id: 'b', title: 'Hohe Bälle fangen', unit: 'Flanken fangen', minutes: 5, url: 'https://www.dfb.de/video', homeTask: 'Sprungkraft üben' },
        { id: 'c', title: 'Abwurf', unit: 'Flach abwerfen', minutes: 4, url: 'javascript:alert(1)', homeTask: '' },
      ],
    });
    firebase.learning.paths.set('lp2', { title: 'Für U15', position: '', ageGroup: 'U15', levels: [{ id: 'x', title: 'X', unit: 'x', minutes: 3, url: null, homeTask: '' }] });
    firebase.learning.progress.set('p1', { playerId: 'p1', paths: { lp1: { a: '2026-10-13' } } });
    firebase.learning.progress.set('p2', { playerId: 'p2', paths: { lp1: { a: '2026-10-20', b: '2026-10-27' } } });
    await TestBed.configureTestingModule({ imports: [component], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.playerId.set(playerId);
    TestBed.inject(CurrentTeam).label.set('U14');
    const fixture = TestBed.createComponent(component);
    fixture.componentRef.setInput('player', player);
    await fixture.whenStable();
    await vi.waitFor(() => fixture.detectChanges());
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('Spieler sieht seinen Pfad und den nächsten Schritt mit Einheit, Link und Aufgabe für zu Hause', async () => {
    const root = await render(LearningPanel, 'player', 'p1');
    await vi.waitFor(() => expect(root.querySelector('[data-testid="next-step"]')).not.toBeNull());
    expect(root.textContent).toContain('Dein Lernpfad');
    expect(root.querySelectorAll('[data-testid="learning-path"]')).toHaveLength(1); // der U15-Pfad passt nicht zum Team
    const next = root.querySelector('[data-testid="next-step"]')!.textContent!;
    expect(next).toContain('Stufe 2: Hohe Bälle fangen');
    expect(next).toContain('Kurze Einheit (5 Min.): Flanken fangen');
    expect(next).toContain('Aufgabe für zu Hause: Sprungkraft üben');
    const link = root.querySelector<HTMLAnchorElement>('[data-testid="next-step"] a')!;
    expect(link.getAttribute('href')).toBe('https://www.dfb.de/video');
    expect(link.rel).toBe('noopener noreferrer');
    expect(root.textContent).toContain('1 von 3 Stufen bestätigt');
    expect(root.textContent).toContain('bestätigt am 13.10.2026');
    expect(firebase.calls).toContain('watchLearningProgress:p1');
    expect(firebase.calls).not.toContain('watchAllLearningProgress');
  });

  it('Eltern sehen denselben Fortschritt – ohne Noten', async () => {
    const root = await render(LearningPanel, 'parent', 'p1');
    await vi.waitFor(() => expect(root.textContent).toContain('Lernpfad von Tom Tor'));
    expect(root.textContent).toContain('Nächster Schritt');
    expect(root.textContent).not.toMatch(/Note|Ø/);
  });

  it('kein unsicherer Link: javascript: wird nie angezeigt', async () => {
    const root = await render(LearningPanel, 'player', 'p2', striker);
    // Stürmer: der Torwart-Pfad erscheint trotzdem, weil darin schon Stufen bestätigt sind.
    await vi.waitFor(() => expect(root.textContent).toContain('Stufe 3: Abwurf'));
    expect(root.innerHTML).not.toContain('javascript:');
  });

  it('Medizin und Scout sehen keinen Lernpfad und laden nichts', async () => {
    for (const role of ['physio', 'scout'] as const) {
      TestBed.resetTestingModule();
      const root = await render(LearningPanel, role, null);
      expect(root.textContent?.trim()).toBe('');
      expect(firebase.calls.filter((call) => call.includes('Learning'))).toEqual([]);
    }
  });

  it('Kompetenzprofil: bestätigte Stufen mit Datum und nächster Schritt', async () => {
    const root = await render(LearningSummary, 'player', 'p1');
    await vi.waitFor(() => expect(root.querySelector('[data-testid="learning-summary"]')).not.toBeNull());
    expect(root.textContent).toContain('Lernpfade');
    expect(root.textContent).toContain('Torwart: Fangen');
    expect(root.textContent).toContain('1/3');
    expect(root.textContent).toContain('Stufe 1 Grundstellung (13.10.2026)');
    expect(root.textContent).toContain('Nächster Schritt: Stufe 2 – Hohe Bälle fangen');
  });

  it('Kompetenzprofil beim Scout: nichts', async () => {
    const root = await render(LearningSummary, 'scout', null);
    expect(root.textContent?.trim()).toBe('');
  });
});
