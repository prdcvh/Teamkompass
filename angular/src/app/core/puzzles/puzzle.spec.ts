import {
  type Puzzle,
  type PuzzleAnswer,
  type PuzzleSolution,
  START_RATING,
  answerFromDoc,
  deltaLabel,
  docFromPuzzle,
  emptyPuzzleDraft,
  expectedScore,
  formatSeconds,
  parseTimestamp,
  puzzleFromDoc,
  puzzleFromDraft,
  puzzleInsight,
  ratingDelta,
  ratingHistory,
  solutionFromDoc,
  teamInsights,
  timestampFromUrl,
  validatePuzzleDraft,
  videoLinkAt,
} from './puzzle';

const puzzle = (id: string, level: 1 | 2 | 3, answers = ['Kurz', 'Lang', 'Halten']): Puzzle => ({
  id,
  title: `Szene ${id}`,
  question: 'Wohin passt du?',
  media: 'image',
  mediaUrl: 'https://example.org/szene.jpg',
  videoStart: null,
  answers,
  level,
});
const answer = (puzzleId: string, choice: number, answeredAt: number, playerId = 'p1'): PuzzleAnswer => ({ puzzleId, playerId, choice, answeredAt });

describe('Situationsrätsel (SCRUM-193): Wertung ähnlich Elo', () => {
  it('Erwartung: gleich stark = 50 %, gegen ein schweres Rätsel weniger, gegen ein leichtes mehr', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedScore(1000, 1200)).toBeCloseTo(0.2403, 3);
    expect(expectedScore(1000, 800)).toBeCloseTo(0.7597, 3);
  });

  it('richtig bei einem schweren Rätsel bringt mehr als bei einem leichten; falsch bei einem leichten kostet mehr', () => {
    expect(ratingDelta(1000, 1200, true)).toBe(24); // schwer, richtig
    expect(ratingDelta(1000, 1000, true)).toBe(16); // mittel, richtig
    expect(ratingDelta(1000, 800, true)).toBe(8); // leicht, richtig
    expect(ratingDelta(1000, 800, false)).toBe(-24); // leicht, falsch
    expect(ratingDelta(1000, 1000, false)).toBe(-16);
    expect(ratingDelta(1000, 1200, false)).toBe(-8); // schwer, falsch kostet wenig
  });

  it('Wertung startet bei 1000 und steigt bzw. fällt Schritt für Schritt in zeitlicher Reihenfolge', () => {
    const puzzles = new Map([
      ['hard', puzzle('hard', 3)],
      ['easy', puzzle('easy', 1)],
      ['mid', puzzle('mid', 2)],
    ]);
    const solutions = new Map<string, PuzzleSolution>([
      ['hard', { correct: 1, explanation: '' }],
      ['easy', { correct: 0, explanation: '' }],
      ['mid', { correct: 2, explanation: '' }],
    ]);
    // Reihenfolge absichtlich durcheinander: gezählt wird nach Zeitpunkt.
    const history = ratingHistory([answer('easy', 2, 2000), answer('hard', 1, 1000), answer('mid', 2, 3000)], puzzles, solutions);
    expect(history.steps.map((step) => [step.puzzle.id, step.solved, step.before, step.delta, step.after])).toEqual([
      ['hard', true, 1000, 24, 1024],
      ['easy', false, 1024, -25, 999],
      ['mid', true, 999, 16, 1015],
    ]);
    expect(history.rating).toBe(1015);
    expect(history.solved).toBe(2);
  });

  it('ohne Antworten bleibt die Startwertung', () => {
    expect(ratingHistory([], new Map(), new Map())).toEqual({ rating: START_RATING, steps: [], solved: 0 });
  });

  it('gelöschte Rätsel, fehlende Lösung, doppelte Antworten und ungültige Wahl zählen nicht', () => {
    const puzzles = new Map([['a', puzzle('a', 2)], ['b', puzzle('b', 2, ['X', 'Y'])], ['c', puzzle('c', 2)]]);
    const solutions = new Map<string, PuzzleSolution>([['a', { correct: 0, explanation: '' }], ['b', { correct: 0, explanation: '' }]]);
    const history = ratingHistory(
      [answer('a', 0, 1), answer('a', 0, 2), answer('b', 3, 3), answer('c', 0, 4), answer('weg', 0, 5)],
      puzzles,
      solutions,
    );
    expect(history.steps.map((step) => step.puzzle.id)).toEqual(['a']);
    expect(history.rating).toBe(1016);
  });

  it('zeigt die Änderung mit Vorzeichen', () => {
    expect(deltaLabel(12)).toBe('+12');
    expect(deltaLabel(-8)).toBe('−8');
    expect(deltaLabel(0)).toBe('±0');
  });
});

describe('Situationsrätsel: Eingaben prüfen und speichern', () => {
  const valid = () => ({ ...emptyPuzzleDraft(), title: 'Konter nach Ballgewinn', mediaUrl: 'https://example.org/szene.jpg', answers: ['Kurz', 'Lang', 'Halten'], correct: 1, explanation: 'Der lange Ball trifft die offene Seite.' });

  it('ein vollständiges Rätsel ist gültig; Lösung und Szene werden getrennt', () => {
    expect(validatePuzzleDraft(valid())).toEqual({});
    const { puzzle: saved, solution } = puzzleFromDraft(valid(), 'r1');
    expect(solution).toEqual({ correct: 1, explanation: 'Der lange Ball trifft die offene Seite.' });
    const doc = docFromPuzzle(saved);
    expect(Object.keys(doc).sort()).toEqual(['answers', 'level', 'media', 'mediaUrl', 'question', 'title', 'videoStart']);
    expect(JSON.stringify(doc)).not.toContain('offene Seite');
  });

  it('meldet fehlende oder falsche Angaben', () => {
    const errors = validatePuzzleDraft({ ...valid(), title: ' ', mediaUrl: 'http://example.org/x.jpg', answers: ['A', ' ', 'a'], correct: 5, explanation: '' });
    expect(Object.keys(errors).sort()).toEqual(['answer', 'correct', 'explanation', 'mediaUrl', 'title']);
    expect(errors.answer).toEqual({ 1: 'Bitte die Antwort ausfüllen oder entfernen.', 2: 'Diese Antwort gibt es schon.' });
    expect(validatePuzzleDraft({ ...valid(), answers: ['Nur eine'], correct: 0 }).answers).toBeTruthy();
    expect(validatePuzzleDraft({ ...valid(), answers: ['A', 'B', 'C', 'D', 'E'] }).answers).toBeTruthy();
    expect(validatePuzzleDraft({ ...valid(), mediaUrl: 'javascript:alert(1)' }).mediaUrl).toBeTruthy();
  });

  it('Video: Zeitmarke als Minuten:Sekunden oder aus dem YouTube-Link', () => {
    expect(parseTimestamp('1:23')).toBe(83);
    expect(parseTimestamp('83')).toBe(83);
    expect(parseTimestamp('1:02:03')).toBe(3723);
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('1:75')).toBeNaN();
    expect(parseTimestamp('abc')).toBeNaN();
    expect(formatSeconds(83)).toBe('1:23');
    expect(formatSeconds(3723)).toBe('1:02:03');
    expect(timestampFromUrl('https://www.youtube.com/watch?v=abc&t=95')).toBe(95);
    expect(timestampFromUrl('https://youtu.be/abc?t=1m5s')).toBe(65);
    expect(timestampFromUrl('https://example.org/video.mp4')).toBeNull();
    const video = { ...valid(), media: 'video' as const, mediaUrl: 'https://youtu.be/abc?t=40' };
    expect(puzzleFromDraft(video, 'v').puzzle.videoStart).toBe(40);
    expect(puzzleFromDraft({ ...video, videoStart: '2:00' }, 'v').puzzle.videoStart).toBe(120);
    expect(validatePuzzleDraft({ ...video, videoStart: 'gleich' }).videoStart).toBeTruthy();
    // Bild: keine Zeitmarke.
    expect(puzzleFromDraft({ ...valid(), videoStart: '1:00' }, 'b').puzzle.videoStart).toBeNull();
  });

  it('Link an der Zeitmarke: YouTube, Vimeo und sonstige Videos', () => {
    expect(videoLinkAt('https://www.youtube.com/watch?v=abc&t=5', 83)).toBe('https://www.youtube.com/watch?v=abc&t=83s');
    expect(videoLinkAt('https://vimeo.com/123', 83)).toBe('https://vimeo.com/123#t=83s');
    expect(videoLinkAt('https://example.org/spiel.mp4', 83)).toBe('https://example.org/spiel.mp4#t=83');
    expect(videoLinkAt('https://example.org/spiel.mp4', null)).toBe('https://example.org/spiel.mp4');
  });

  it('liest nur brauchbare Dokumente', () => {
    expect(puzzleFromDoc('x', { ...docFromPuzzle(puzzle('x', 2)) })).toEqual(puzzle('x', 2));
    expect(puzzleFromDoc('x', { ...docFromPuzzle(puzzle('x', 2)), mediaUrl: 'javascript:alert(1)' })).toBeNull();
    expect(puzzleFromDoc('x', { ...docFromPuzzle(puzzle('x', 2)), answers: ['nur eine'] })).toBeNull();
    expect(puzzleFromDoc('x', { ...docFromPuzzle(puzzle('x', 2)), level: 7 })).toBeNull();
    expect(solutionFromDoc({ correct: 1, explanation: 'weil' })).toEqual({ correct: 1, explanation: 'weil' });
    expect(solutionFromDoc({ correct: 'a' })).toBeNull();
    expect(answerFromDoc({ puzzleId: 'a', playerId: 'p1', choice: 1, answeredAt: { toMillis: () => 42 } })).toEqual(answer('a', 1, 42));
    expect(answerFromDoc({ puzzleId: 'a', playerId: 'p1', choice: 1, answeredAt: null }, 7)?.answeredAt).toBe(7);
    expect(answerFromDoc({ puzzleId: 'a', playerId: 'p1', choice: 9 })).toBeNull();
  });
});

describe('Situationsrätsel: was das Team noch nicht versteht', () => {
  const solution: PuzzleSolution = { correct: 0, explanation: '' };

  it('zählt Antworten je Wahl, Quote und häufigsten Fehler', () => {
    const insight = puzzleInsight(puzzle('a', 2), solution, [answer('a', 1, 1, 'p1'), answer('a', 1, 2, 'p2'), answer('a', 0, 3, 'p3'), answer('a', 2, 4, 'p4'), answer('b', 0, 5, 'p5')]);
    expect(insight.counts).toEqual([1, 2, 1]);
    expect(insight.total).toBe(4);
    expect(insight.share).toBe(0.25);
    expect(insight.commonMistake).toBe(1);
    expect(insight.notUnderstood).toBe(true);
  });

  it('erst ab 3 Antworten und unter 50 % richtig gilt eine Situation als nicht verstanden', () => {
    expect(puzzleInsight(puzzle('a', 2), solution, [answer('a', 1, 1, 'p1'), answer('a', 1, 2, 'p2')]).notUnderstood).toBe(false);
    expect(puzzleInsight(puzzle('a', 2), solution, [answer('a', 0, 1, 'p1'), answer('a', 0, 2, 'p2'), answer('a', 1, 3, 'p3')]).notUnderstood).toBe(false);
    expect(puzzleInsight(puzzle('a', 2), null, [answer('a', 0, 1, 'p1')]).share).toBeNull();
  });

  it('sortiert nicht verstandene Situationen nach vorn, die schwächste zuerst', () => {
    const solutions = new Map([['a', solution], ['b', solution], ['c', solution]]);
    const wrong = (id: string, right: number, wrongCount: number) => [
      ...Array.from({ length: right }, (_, i) => answer(id, 0, i, `r${i}`)),
      ...Array.from({ length: wrongCount }, (_, i) => answer(id, 1, i, `w${i}`)),
    ];
    const list = teamInsights([puzzle('a', 1), puzzle('b', 2), puzzle('c', 3)], solutions, [...wrong('a', 3, 0), ...wrong('b', 1, 2), ...wrong('c', 0, 3)]);
    expect(list.map((entry) => [entry.puzzle.id, entry.notUnderstood])).toEqual([['c', true], ['b', true], ['a', false]]);
  });
});
