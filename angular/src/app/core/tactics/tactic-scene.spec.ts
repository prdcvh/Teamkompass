import {
  type TacticScene,
  MIN_CASES,
  docFromScene,
  emptySceneDraft,
  executionFor,
  isAllowedVideoUrl,
  metricsByEventType,
  metricsByMonth,
  metricsBySituation,
  ratio,
  ratioShort,
  ratioText,
  sceneFromDoc,
  sceneMetrics,
  sortScenes,
  validateScene,
} from './tactic-scene';

let counter = 0;
function scene(change: Partial<TacticScene> = {}): TacticScene {
  counter += 1;
  return {
    id: `s${counter}`,
    playerId: 'p1',
    eventId: 'e1',
    eventDate: '2026-10-04',
    eventType: 'Spiel',
    eventTitle: 'Spiel gegen Musterstadt',
    minute: 12,
    context: 'Aufbau gegen hohes Pressing',
    decision: 'good',
    execution: 'success',
    situations: [],
    videoUrl: '',
    by: 'Trainer Test',
    byUid: 'coach',
    createdAt: `2026-10-05T10:00:${String(counter % 60).padStart(2, '0')}.000Z`,
    ...change,
  };
}

/** Taktikdiagnostik: Entscheidung und Ausführung getrennt (SCRUM-267). */
describe('tactic-scene', () => {
  it('richtige Entscheidung + erfolglose Ausführung ergibt getrennte Ergebnisse', () => {
    const metrics = sceneMetrics([scene({ decision: 'good', execution: 'fail' })]);
    expect(metrics.decisionQuality).toEqual({ count: 1, of: 1, value: 1, reliable: false });
    expect(metrics.executionRate).toEqual({ count: 0, of: 1, value: 0, reliable: false });
  });

  it('0 Szenen = kein Score, kein Zeitfenster', () => {
    const metrics = sceneMetrics([]);
    expect(metrics.scenes).toBe(0);
    expect(metrics.decisionQuality.value).toBeNull();
    expect(metrics.executionRate.value).toBeNull();
    expect(metrics.from).toBeNull();
    expect(ratioText(metrics.decisionQuality)).toContain('kein Wert');
    expect(ratioShort(metrics.executionRate)).toBe('–');
  });

  it('nur unklare Szenen: zählen in der Stichprobe, aber in keinem Nenner – kein Score', () => {
    const metrics = sceneMetrics([scene({ decision: 'unclear', execution: null }), scene({ decision: 'unclear', execution: null })]);
    expect(metrics.scenes).toBe(2);
    expect(metrics.unclearDecisions).toBe(2);
    expect(metrics.decisionQuality).toEqual({ count: 0, of: 0, value: null, reliable: false });
    expect(metrics.executionRate.value).toBeNull();
  });

  it('nicht beurteilbare Ausführung zählt nicht im Nenner der Ausführungsquote, die Entscheidung aber schon', () => {
    const metrics = sceneMetrics([
      scene({ decision: 'good', execution: 'unclear' }),
      scene({ decision: 'good', execution: 'success' }),
      scene({ decision: 'poor', execution: null }),
    ]);
    expect(metrics.decisionQuality).toMatchObject({ count: 2, of: 3 });
    expect(metrics.executionRate).toMatchObject({ count: 1, of: 1 });
    expect(metrics.unclearExecutions).toBe(1);
  });

  it('nicht sinnvolle Entscheidung geht nie in die Ausführungsquote ein (auch mit altem Ausführungswert)', () => {
    const parsed = sceneFromDoc('x', { ...docFromScene(scene({ decision: 'poor', execution: null })), execution: 'success' });
    expect(parsed?.execution).toBeNull();
    expect(sceneMetrics([parsed!]).executionRate.of).toBe(0);
    expect(executionFor('poor', 'success')).toBeNull();
    expect(executionFor('unclear', 'fail')).toBeNull();
    expect(executionFor('good', 'fail')).toBe('fail');
    expect(executionFor('good', '')).toBeNull();
  });

  it('Mindestfallzahl: Prozentwert erst ab MIN_CASES beurteilbaren Szenen', () => {
    expect(MIN_CASES).toBe(5);
    const four = Array.from({ length: 4 }, () => scene({ decision: 'good', execution: 'success' }));
    const fourMetrics = sceneMetrics(four);
    expect(fourMetrics.decisionQuality.reliable).toBe(false);
    expect(ratioText(fourMetrics.decisionQuality)).toBe('4 von 4 – noch keine Aussage (ab 5 beurteilbaren Szenen)');
    expect(ratioShort(fourMetrics.decisionQuality)).toBe('4/4');
    // Fünf Szenen, eine davon unklar: weiter unter der Mindestfallzahl.
    expect(sceneMetrics([...four, scene({ decision: 'unclear', execution: null })]).decisionQuality.reliable).toBe(false);
    const five = sceneMetrics([...four, scene({ decision: 'poor', execution: null })]);
    expect(five.decisionQuality.reliable).toBe(true);
    expect(ratioText(five.decisionQuality)).toBe('4 von 5 (80 %)');
    expect(ratioShort(five.decisionQuality)).toBe('80 %');
    // Ausführung: nur 4 sinnvolle mit Ausführung -> noch keine Aussage.
    expect(five.executionRate.reliable).toBe(false);
    expect(ratio(0, 0).reliable).toBe(false);
  });

  it('Stichprobe, Zeitfenster, Spiele/Trainings und Termine', () => {
    const metrics = sceneMetrics([
      scene({ eventDate: '2026-11-02', eventId: 'e2', eventType: 'Training' }),
      scene({ eventDate: '2026-09-10', eventId: 'e1' }),
      scene({ eventDate: '2026-09-10', eventId: 'e1' }),
    ]);
    expect(metrics).toMatchObject({ scenes: 3, from: '2026-09-10', to: '2026-11-02', games: 2, trainings: 1, events: 2 });
  });

  it('Vergleich je Ereignistyp, je Terminart und im Verlauf je Monat', () => {
    const scenes = [
      scene({ situations: ['pass', 'scanning'], eventDate: '2026-09-03' }),
      scene({ situations: ['pass'], decision: 'poor', execution: null, eventDate: '2026-10-03', eventType: 'Training' }),
      scene({ situations: [], eventDate: '2026-10-20' }),
    ];
    const bySituation = metricsBySituation(scenes);
    expect(bySituation.map((group) => group.label)).toEqual(['Scanning', 'Passentscheidung', 'Ohne Ereignistyp']);
    expect(bySituation.find((group) => group.key === 'pass')?.metrics.decisionQuality).toMatchObject({ count: 1, of: 2 });
    expect(metricsByEventType(scenes).map((group) => [group.key, group.metrics.scenes])).toEqual([['Spiel', 2], ['Training', 1]]);
    const byMonth = metricsByMonth(scenes);
    expect(byMonth.map((group) => [group.label, group.metrics.scenes])).toEqual([['Sep 2026', 1], ['Okt 2026', 2]]);
  });

  it('Formular: Pflichtfelder, Ausführung nur bei sinnvoller Entscheidung, Minute, Videolink nur https', () => {
    const ok = { ...emptySceneDraft('p1'), context: 'Konter über links', decision: 'good' as const, execution: 'fail' as const };
    expect(validateScene(ok, ['p1'])).toEqual({});
    expect(Object.keys(validateScene(emptySceneDraft(), ['p1'])).sort()).toEqual(['context', 'decision', 'playerId']);
    expect(validateScene({ ...ok, execution: '' }, ['p1']).execution).toBeDefined();
    expect(validateScene({ ...ok, decision: 'poor', execution: '' }, ['p1'])).toEqual({});
    expect(validateScene({ ...ok, minute: '151' }, ['p1']).minute).toBeDefined();
    expect(validateScene({ ...ok, minute: '-3' }, ['p1']).minute).toBeDefined();
    expect(validateScene({ ...ok, minute: '45' }, ['p1'])).toEqual({});
    expect(validateScene({ ...ok, context: 'x'.repeat(301) }, ['p1']).context).toContain('300');
    expect(validateScene({ ...ok, videoUrl: 'http://intern.example/v1' }, ['p1']).videoUrl).toBeDefined();
    expect(validateScene({ ...ok, videoUrl: 'javascript:alert(1)' }, ['p1']).videoUrl).toBeDefined();
    expect(isAllowedVideoUrl('https://video.example/clip?id=3')).toBe(true);
    expect(isAllowedVideoUrl('')).toBe(true);
    expect(isAllowedVideoUrl('https://a b')).toBe(false);
  });

  it('Dokument hin und zurück; ungültige Dokumente und Werte werden verworfen', () => {
    const original = scene({ situations: ['pressing', 'transition'], videoUrl: 'https://video.example/1' });
    expect(sceneFromDoc(original.id, docFromScene(original))).toEqual(original);
    expect(sceneFromDoc('x', { ...docFromScene(original), decision: 'super' })).toBeNull();
    expect(sceneFromDoc('x', { ...docFromScene(original), eventDate: '04.10.2026' })).toBeNull();
    expect(sceneFromDoc('x', { ...docFromScene(original), playerId: '' })).toBeNull();
    const cleaned = sceneFromDoc('x', { ...docFromScene(original), minute: 'zwölf', situations: ['pressing', 'quatsch'], videoUrl: 'javascript:1' });
    expect(cleaned).toMatchObject({ minute: null, situations: ['pressing'], videoUrl: '' });
  });

  it('sortiert neueste Szenen zuerst', () => {
    const a = scene({ eventDate: '2026-09-01', minute: 80 });
    const b = scene({ eventDate: '2026-10-01', minute: 10 });
    const c = scene({ eventDate: '2026-10-01', minute: 70 });
    expect(sortScenes([a, b, c]).map((entry) => entry.id)).toEqual([c.id, b.id, a.id]);
  });
});
