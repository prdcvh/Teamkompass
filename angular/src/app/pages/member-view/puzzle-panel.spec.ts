import { TestBed } from '@angular/core/testing';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { playerFromDoc } from '../../core/player/player';
import { PuzzleService } from '../../core/puzzles/puzzle.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { PuzzlePanel } from './puzzle-panel';

describe('Situationsrätsel in der Ansicht von Spieler und Eltern (SCRUM-193)', () => {
  let firebase: FakeFirebase;
  const tom = playerFromDoc('p1', { name: 'Tom Tor', positions: ['ZM'], number: 8, birthdate: '2012-05-05' });

  async function render(role: Role, playerId: string | null, options: { answered?: boolean } = {}) {
    firebase = new FakeFirebase();
    firebase.puzzles.puzzles.set('hard', {
      title: 'Konter nach Ballgewinn',
      question: 'Wohin passt du?',
      media: 'video',
      mediaUrl: 'https://www.youtube.com/watch?v=abc',
      videoStart: 83,
      answers: ['Kurz zum Sechser', 'Lang auf die offene Seite', 'Ball halten'],
      level: 3,
    });
    firebase.puzzles.solutions.set('hard', { correct: 1, explanation: 'Auf der anderen Seite ist viel Platz.' });
    firebase.puzzles.puzzles.set('easy', { title: 'Einwurf', question: 'Wer ist frei?', media: 'image', mediaUrl: 'https://example.org/einwurf.jpg', videoStart: null, answers: ['Links', 'Rechts'], level: 1 });
    firebase.puzzles.solutions.set('easy', { correct: 0, explanation: 'Links steht keiner.' });
    if (options.answered) firebase.puzzles.answers.set('easy_p1', { puzzleId: 'easy', playerId: 'p1', choice: 1, by: 'player', answeredAt: 1000 });
    // Andere Spieler: dürfen nie auftauchen.
    firebase.puzzles.answers.set('hard_p2', { puzzleId: 'hard', playerId: 'p2', choice: 0, by: 'player', answeredAt: 500 });
    firebase.puzzles.solutionReader = 'p1';
    await TestBed.configureTestingModule({ imports: [PuzzlePanel], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.playerId.set(playerId);
    const fixture = TestBed.createComponent(PuzzlePanel);
    fixture.componentRef.setInput('player', tom);
    await fixture.whenStable();
    await vi.waitFor(() => fixture.detectChanges());
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const answerButtons = (fixture: { nativeElement: unknown }) => [...root(fixture).querySelectorAll<HTMLButtonElement>('[data-testid="puzzle-current"] button.answer')];

  it('Spieler sieht das nächste Rätsel ohne Lösung und mit Video-Link an der Zeitmarke', async () => {
    const fixture = await render('player', 'p1');
    await vi.waitFor(() => expect(root(fixture).querySelector('[data-testid="puzzle-current"]')).not.toBeNull());
    const current = root(fixture).querySelector('[data-testid="puzzle-current"]')!;
    // Leichte Rätsel zuerst.
    expect(current.textContent).toContain('Einwurf');
    // Bild nur als Link (neuer Tab), kein fremdes Bild in der App.
    expect(current.querySelector('img')).toBeNull();
    const link = current.querySelector<HTMLAnchorElement>('a.scene-link')!;
    expect(link.getAttribute('href')).toBe('https://example.org/einwurf.jpg');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.target).toBe('_blank');
    expect(root(fixture).textContent).toContain('1000');
    expect(root(fixture).textContent).toContain('es gibt keine Rangliste');
    // Vor der Antwort wird keine Lösung abgefragt und keine Erklärung gezeigt.
    expect(firebase.calls.some((call) => call.startsWith('getPuzzleSolution'))).toBe(false);
    expect(root(fixture).textContent).not.toContain('Links steht keiner');
    expect(firebase.calls).toContain('watchOwnPuzzleAnswers:p1');
    expect(firebase.calls).not.toContain('watchAllPuzzleAnswers');
    expect(firebase.calls).not.toContain('watchPuzzleSolutions');
  });

  it('nach der Antwort: sofort Erklärung und Änderung der Wertung, dann das nächste Rätsel', async () => {
    const fixture = await render('player', 'p1');
    await vi.waitFor(() => expect(answerButtons(fixture)).toHaveLength(2));
    answerButtons(fixture)[1].click(); // „Rechts“ – falsch bei einem leichten Rätsel
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('[data-testid="puzzle-result"]')?.textContent).toContain('Links steht keiner.');
    });
    const result = root(fixture).querySelector('[data-testid="puzzle-result"]')!.textContent!;
    expect(result).toContain('Nicht ganz. Richtig ist: Links');
    expect(result).toContain('Wertung −24 → 976');
    expect(firebase.calls).toContain('savePuzzleAnswer:easy_p1:1');
    expect(firebase.puzzles.answers.get('easy_p1')).toMatchObject({ puzzleId: 'easy', playerId: 'p1', choice: 1, by: 'player' });
    expect(answerButtons(fixture).every((button) => button.disabled)).toBe(true);
    expect(answerButtons(fixture)[0].dataset['state']).toBe('correct');
    expect(answerButtons(fixture)[1].dataset['state']).toBe('wrong');

    [...root(fixture).querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Nächstes Rätsel')!.click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('[data-testid="puzzle-current"]')!.textContent).toContain('Konter nach Ballgewinn');
    expect(root(fixture).querySelector('[data-testid="puzzle-current"] a')!.getAttribute('href')).toBe('https://www.youtube.com/watch?v=abc&t=83s');
    answerButtons(fixture)[1].click(); // richtig bei einem schweren Rätsel
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('[data-testid="puzzle-result"]')?.textContent).toContain('Richtig!');
    });
    // 976 gegen 1200: Erwartung ~21 %, also +25.
    expect(root(fixture).querySelector('[data-testid="puzzle-result"]')!.textContent).toContain('Wertung +25 → 1001');
    expect(root(fixture).querySelector('[data-testid="puzzle-rating"]')!.textContent).toContain('1001');
    expect(root(fixture).querySelector('[data-testid="puzzle-done"]')!.textContent).toContain('Einwurf');
  });

  it('ein beantwortetes Rätsel kommt nicht wieder, die Erklärung steht bei den erledigten', async () => {
    const fixture = await render('player', 'p1', { answered: true });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('[data-testid="puzzle-done"]')).not.toBeNull();
    });
    expect(root(fixture).querySelector('[data-testid="puzzle-current"]')!.textContent).toContain('Konter nach Ballgewinn');
    expect(firebase.calls).toContain('getPuzzleSolution:easy');
    expect(firebase.calls).not.toContain('getPuzzleSolution:hard');
    // Ein zweites Mal antworten geht nicht.
    expect(TestBed.inject(PuzzleService).answer('easy', 0)).toBe(false);
  });

  it('Eltern sehen Wertung und erledigte Rätsel, antworten aber nicht', async () => {
    const fixture = await render('parent', 'p1', { answered: true });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).textContent).toContain('Situationsrätsel von Tom Tor');
    });
    expect(root(fixture).querySelector('[data-testid="puzzle-current"]')).toBeNull();
    expect(root(fixture).querySelector('[data-testid="puzzle-parent-note"]')!.textContent).toContain('1 Rätsel ist noch offen');
    expect(root(fixture).querySelector('[data-testid="puzzle-rating"]')!.textContent).toContain('976');
    expect(TestBed.inject(PuzzleService).answer('hard', 1)).toBe(false);
    expect(firebase.calls.some((call) => call.startsWith('savePuzzleAnswer'))).toBe(false);
  });

  it('Medizin und Scout sehen keine Rätsel und laden nichts', async () => {
    for (const role of ['physio', 'scout'] as const) {
      TestBed.resetTestingModule();
      const fixture = await render(role, null);
      expect(root(fixture).textContent?.trim()).toBe('');
      expect(firebase.calls.filter((call) => call.toLowerCase().includes('puzzle'))).toEqual([]);
    }
  });

  it('ohne freigeschaltete Regeln bleibt der Bereich leer', async () => {
    const fake = new FakeFirebase();
    fake.puzzles.watchError = { code: 'permission-denied' };
    await TestBed.configureTestingModule({ imports: [PuzzlePanel], providers: [...provideFakeFirebase(fake)] }).compileComponents();
    TestBed.inject(SessionService).role.set('player');
    TestBed.inject(SessionService).playerId.set('p1');
    const fixture = TestBed.createComponent(PuzzlePanel);
    fixture.componentRef.setInput('player', tom);
    await fixture.whenStable();
    expect(TestBed.inject(PuzzleService).load()).toBe('denied');
    expect(root(fixture).textContent?.trim()).toBe('');
  });
});
