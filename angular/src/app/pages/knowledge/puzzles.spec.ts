import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { CurrentTeam } from '../../core/team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Knowledge } from './knowledge';

describe('Situationsrätsel im Tab „Wissen“ (SCRUM-193)', () => {
  let firebase: FakeFirebase;

  async function render(options: { denied?: boolean } = {}) {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Tom Tor', positions: ['TW'], number: 1, birthdate: '2012-05-05' });
    firebase.players.players.set('p2', { name: 'Sina Sturm', positions: ['ST'], number: 9, birthdate: '2012-05-05' });
    firebase.players.players.set('p3', { name: 'Mia Mitte', positions: ['ZM'], number: 6, birthdate: '2012-05-05' });
    firebase.knowledge.doc = { knowledge: {} };
    firebase.puzzles.puzzles.set('r1', { title: 'Konter', question: 'Wohin passt du?', media: 'image', mediaUrl: 'https://example.org/konter.jpg', videoStart: null, answers: ['Kurz', 'Lang', 'Halten'], level: 2 });
    firebase.puzzles.solutions.set('r1', { correct: 1, explanation: 'Offene Seite.' });
    firebase.puzzles.puzzles.set('r2', { title: 'Einwurf', question: 'Wer ist frei?', media: 'image', mediaUrl: 'https://example.org/einwurf.jpg', videoStart: null, answers: ['Links', 'Rechts'], level: 1 });
    firebase.puzzles.solutions.set('r2', { correct: 0, explanation: 'Links.' });
    // Konter: zwei von drei falsch („Kurz“) → noch nicht verstanden. Einwurf: alle richtig.
    const set = (puzzleId: string, playerId: string, choice: number, at: number) => firebase.puzzles.answers.set(`${puzzleId}_${playerId}`, { puzzleId, playerId, choice, by: 'player', answeredAt: at });
    set('r1', 'p1', 0, 1);
    set('r1', 'p2', 0, 2);
    set('r1', 'p3', 1, 3);
    set('r2', 'p1', 0, 4);
    set('r2', 'p2', 0, 5);
    set('r2', 'p3', 0, 6);
    if (options.denied) firebase.puzzles.watchError = { code: 'permission-denied' };
    await TestBed.configureTestingModule({ imports: [Knowledge], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    TestBed.inject(SessionService).role.set('trainer');
    TestBed.inject(CurrentTeam).label.set('U14');
    const fixture = TestBed.createComponent(Knowledge);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const button = (fixture: { nativeElement: unknown }, text: string) =>
    [...root(fixture).querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text);
  function type(element: Element | null, value: string, event = 'input') {
    const input = element as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event(event, { bubbles: true }));
  }

  it('zeigt, welche Situation das Team noch nicht versteht, mit Quote und häufigstem Fehler', async () => {
    const fixture = await render();
    const open = root(fixture).querySelector('[data-testid="puzzle-not-understood"]')!.textContent!;
    expect(open).toContain('Konter');
    expect(open).toContain('33 % richtig (1 von 3)');
    expect(open).toContain('häufigste falsche Antwort: „Kurz“');
    expect(open).not.toContain('Einwurf');
    const list = root(fixture).querySelector('[data-testid="puzzle-list"]')!.textContent!;
    expect(list).toContain('3 Antworten · 100 % richtig');
    expect(firebase.calls).toContain('watchAllPuzzleAnswers');
    expect(firebase.calls).toContain('watchPuzzleSolutions');
  });

  it('Wertung je Spieler nur für den Trainer, nach Rückennummer statt nach Höhe', async () => {
    const fixture = await render();
    button(fixture, 'Rätsel-Wertung je Spieler')!.click();
    fixture.detectChanges();
    const rows = [...root(fixture).querySelectorAll('[data-testid="puzzle-ratings"] li')].map((li) => [...li.children].map((cell) => cell.textContent!.trim()).join(' | '));
    // p1: Konter (mittel) falsch −16 → 984, Einwurf (leicht) richtig +8 → 992. p3: beide richtig +16, +7 → 1023. p2 wie p1.
    expect(rows).toEqual([
      '1 · Tom Tor | 2 beantwortet, 1 richtig | 992',
      '6 · Mia Mitte | 2 beantwortet, 2 richtig | 1023',
      '9 · Sina Sturm | 2 beantwortet, 1 richtig | 992',
    ]);
  });

  it('Trainer legt ein Video-Rätsel mit Zeitmarke an; die Lösung wird getrennt gespeichert', async () => {
    const fixture = await render();
    button(fixture, '+ Rätsel anlegen')!.click();
    fixture.detectChanges();
    const form = root(fixture).querySelector('tk-puzzle-dialog form')!;
    type(form.querySelector('[name="puzzleTitle"]'), 'Pressing nach Ballverlust');
    (form.querySelector('input[name="puzzleMedia"][value="video"]') as HTMLInputElement).click();
    fixture.detectChanges();
    type(form.querySelector('[name="puzzleUrl"]'), 'https://www.youtube.com/watch?v=xyz');
    type(form.querySelector('[name="puzzleStart"]'), '1:23');
    type(form.querySelector('[name="puzzleAnswer0"]'), 'Sofort draufgehen');
    type(form.querySelector('[name="puzzleAnswer1"]'), 'Zurückfallen');
    // Die dritte Antwort entfernen: zwei reichen.
    button(fixture, 'Antwort 3 entfernen')!.click();
    fixture.detectChanges();
    (form.querySelectorAll('input[name="puzzleCorrect"]')[0] as HTMLInputElement).click();
    type(form.querySelector('[name="puzzleExplanation"]'), 'Direkt nach Ballverlust ist der Gegner ungeordnet.');
    type(form.querySelector('[name="puzzleLevel"]'), '3', 'change');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    const saved = [...firebase.puzzles.puzzles].find(([, data]) => data['title'] === 'Pressing nach Ballverlust');
    expect(saved).toBeTruthy();
    const [id, data] = saved!;
    expect(data).toEqual({ title: 'Pressing nach Ballverlust', question: 'Wohin passt du?', media: 'video', mediaUrl: 'https://www.youtube.com/watch?v=xyz', videoStart: 83, answers: ['Sofort draufgehen', 'Zurückfallen'], level: 3 });
    expect(firebase.puzzles.solutions.get(id)).toEqual({ correct: 0, explanation: 'Direkt nach Ballverlust ist der Gegner ungeordnet.' });
  });

  it('meldet fehlende Angaben und speichert dann nichts', async () => {
    const fixture = await render();
    button(fixture, '+ Rätsel anlegen')!.click();
    fixture.detectChanges();
    const form = root(fixture).querySelector('tk-puzzle-dialog form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(form.textContent).toContain('Bitte einen kurzen Namen für die Szene angeben.');
    expect(form.textContent).toContain('Bitte die Adresse des Bildes angeben.');
    expect(form.textContent).toContain('Bitte kurz erklären, warum die Antwort richtig ist.');
    expect(firebase.calls.some((call) => call.startsWith('savePuzzle:'))).toBe(false);
  });

  it('Bearbeiten warnt bei vorhandenen Antworten; Löschen entfernt Rätsel, Lösung und Antworten', async () => {
    const fixture = await render();
    button(fixture, 'Rätsel bearbeiten: Konter')!.click();
    fixture.detectChanges();
    const form = root(fixture).querySelector('tk-puzzle-dialog form')!;
    expect(form.textContent).toContain('Schon 3 Antworten auf dieses Rätsel');
    expect((form.querySelector('[name="puzzleExplanation"]') as HTMLTextAreaElement).value).toBe('Offene Seite.');
    expect((form.querySelectorAll('input[name="puzzleCorrect"]')[1] as HTMLInputElement).checked).toBe(true);
    button(fixture, 'Rätsel löschen')!.click();
    fixture.detectChanges();
    [...root(fixture).querySelectorAll<HTMLButtonElement>('tk-puzzles button')].find((b) => b.textContent?.trim() === 'Endgültig löschen')!.click();
    await fixture.whenStable();
    expect(firebase.calls).toContain('deletePuzzle:r1:r1_p1,r1_p2,r1_p3');
    expect(firebase.puzzles.puzzles.has('r1')).toBe(false);
    expect(firebase.puzzles.solutions.has('r1')).toBe(false);
    expect([...firebase.puzzles.answers.keys()].sort()).toEqual(['r2_p1', 'r2_p2', 'r2_p3']);
  });

  it('ohne veröffentlichte Regeln: Hinweis statt Fehler', async () => {
    const fixture = await render({ denied: true });
    expect(root(fixture).textContent).toContain('Situationsrätsel sind in diesem Team noch nicht freigeschaltet.');
  });
});
