import {
  type FieldTestResult,
  type FieldTestSessionDraft,
  aggregateResult,
  compareResults,
  docFromFieldTest,
  evaluateSession,
  fieldTestFromDoc,
  fieldTestHistory,
  isFieldTestDoc,
  resultsFromSession,
} from './field-test';
import { FIELD_TEST_PROTOCOLS, aggregationText, currentProtocol, currentProtocols, findProtocol } from './field-test-protocols';
import { growthMeasurementsFromDocs } from './measurement';

const result = (over: Partial<FieldTestResult> = {}): FieldTestResult => ({
  id: 'ft1',
  date: '2026-11-01',
  sessionId: 's1',
  protocolId: 'sprint-10',
  protocolVersion: '1.0',
  unit: 's',
  method: 'light-gate',
  tester: 'Trainer A',
  surface: 'artificial',
  conditions: 'trocken',
  attempts: [
    { n: 1, value: 1.92, valid: true },
    { n: 2, value: 1.85, valid: true },
    { n: 3, value: 1.8, valid: false },
  ],
  recordedAt: '2026-11-01T17:00:00.000Z',
  ...over,
});

const session = (over: Partial<FieldTestSessionDraft> = {}): FieldTestSessionDraft => ({
  protocolId: 'sprint-10',
  date: '2026-11-20',
  method: 'light-gate',
  tester: 'Trainer A',
  surface: '',
  conditions: '',
  ...over,
});
const context = { today: '2026-11-23', birthdates: new Map([['p1', '2012-05-05'], ['p2', '2027-01-01']]) };

describe('Feldtests: Katalog (SCRUM-263)', () => {
  it('enthält den Testkern aus dem Ticket mit eindeutiger Kennung je Version', () => {
    const ids = currentProtocols().map((protocol) => protocol.id);
    expect(ids).toEqual(['sprint-10', 'sprint-20', 'cod-505-left', 'cod-505-right', 'cmj', 'yoyo-ir1', 'passing', 'dribbling']);
    const keys = FIELD_TEST_PROTOCOLS.map((protocol) => `${protocol.id}@${protocol.version}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('jedes Protokoll hat Richtung, Einheit, Methode, Grenzen und eine Anleitung', () => {
    for (const protocol of FIELD_TEST_PROTOCOLS) {
      expect(protocol.methods.length).toBeGreaterThan(0);
      expect(protocol.setup.length).toBeGreaterThan(0);
      expect(protocol.min).toBeLessThan(protocol.max);
      expect(protocol.attempts).toBeGreaterThanOrEqual(protocol.minValid);
      if (protocol.aggregation === 'mean') expect(protocol.minValid).toBeGreaterThanOrEqual(2);
    }
    expect(currentProtocol('sprint-10')?.direction).toBe('lower');
    expect(currentProtocol('cmj')?.direction).toBe('higher');
    expect(currentProtocol('yoyo-ir1')?.step).toBe(40);
    expect(findProtocol('sprint-10', '9.9')).toBeNull();
  });

  it('beschreibt die Regel in Worten', () => {
    expect(aggregationText(currentProtocol('sprint-10')!)).toBe('bester gültiger Versuch (kleinster Wert)');
    expect(aggregationText(currentProtocol('passing')!)).toBe('bester gültiger Versuch (größter Wert)');
    expect(aggregationText(currentProtocol('cmj')!)).toBe('Mittelwert der gültigen Versuche (mindestens 2)');
  });
});

describe('Feldtests: Aggregation', () => {
  it('kleiner ist besser: bester gültiger Versuch, ungültige zählen nicht', () => {
    expect(aggregateResult(result())).toEqual({ value: 1.85, rule: 'bester gültiger Versuch (kleinster Wert)', used: [2], missing: '' });
  });

  it('größer ist besser: höchster gültiger Wert', () => {
    const passing = result({ protocolId: 'passing', unit: 'Treffer', method: 'observer', attempts: [{ n: 1, value: 6, valid: true }, { n: 2, value: 8, valid: true }] });
    expect(aggregateResult(passing).value).toBe(8);
    expect(aggregateResult(passing).used).toEqual([2]);
  });

  it('CMJ: Mittelwert der gültigen Versuche, mit zu wenigen gültigen kein Ergebnis (nie 0)', () => {
    const cmj = result({ protocolId: 'cmj', unit: 'cm', method: 'contact-mat', attempts: [{ n: 1, value: 30, valid: true }, { n: 2, value: 31, valid: true }, { n: 3, value: 40, valid: false }] });
    expect(aggregateResult(cmj)).toMatchObject({ value: 30.5, used: [1, 2] });
    const few = { ...cmj, attempts: [{ n: 1, value: 30, valid: true }, { n: 2, value: null, valid: false }] };
    expect(aggregateResult(few)).toMatchObject({ value: null, used: [] });
    expect(aggregateResult(few).missing).toContain('Zu wenige gültige Versuche (1 von mindestens 2)');
  });

  it('nur ungültige oder leere Versuche: kein Ergebnis', () => {
    expect(aggregateResult(result({ attempts: [{ n: 1, value: null, valid: false }] })).value).toBeNull();
    expect(aggregateResult(result({ attempts: [] })).value).toBeNull();
  });

  it('unbekanntes Protokoll oder falsche Einheit: Rohwerte bleiben, kein Ergebnis', () => {
    expect(aggregateResult(result({ protocolId: 'beep-test' }))).toMatchObject({ value: null, missing: 'Testprotokoll in dieser Version unbekannt – nur Rohwerte.' });
    expect(aggregateResult(result({ protocolVersion: '0.9' })).value).toBeNull();
    expect(aggregateResult(result({ unit: 'ms' })).missing).toContain('Einheit „ms“ passt nicht');
  });
});

describe('Feldtests: Vergleich', () => {
  const before = result({ id: 'old', date: '2026-09-01', attempts: [{ n: 1, value: 1.95, valid: true }] });

  it('gleiche Bedingungen: Unterschied in Richtung des Tests, keine Warnung', () => {
    const comparison = compareResults(result(), before);
    expect(comparison.delta).toBe(-0.1);
    expect(comparison.improved).toBe(true);
    expect(comparison.warnings).toEqual([]);
  });

  it('größer ist besser: mehr ist eine Verbesserung', () => {
    const now = result({ protocolId: 'yoyo-ir1', unit: 'm', method: 'audio', attempts: [{ n: 1, value: 1200, valid: true }] });
    const then = { ...now, id: 'old', date: '2026-01-01', attempts: [{ n: 1, value: 1400, valid: true }] };
    expect(compareResults(now, then)).toMatchObject({ delta: -200, improved: false });
  });

  it('warnt bei anderer Messmethode, anderem Protokoll und anderem Untergrund', () => {
    const comparison = compareResults(result({ method: 'stopwatch', protocolVersion: '1.1', surface: 'grass' }), before);
    expect(comparison.warnings).toEqual([
      'Anderes Testprotokoll (vorher Version 1.0, jetzt 1.1) – nur eingeschränkt vergleichbar.',
      'Andere Messmethode (vorher Lichtschranke, jetzt Handstoppung (Stoppuhr)) – nur eingeschränkt vergleichbar.',
      'Anderer Untergrund (vorher Kunstrasen, jetzt Naturrasen).',
    ]);
  });

  it('andere Einheit: kein Unterschied, nur Warnung', () => {
    const comparison = compareResults(result(), { ...before, unit: 'ms' });
    expect(comparison.delta).toBeNull();
    expect(comparison.warnings[0]).toContain('Andere Einheit');
  });

  it('Verlauf je Test, neueste zuerst, mit Vergleich zum vorigen Ergebnis', () => {
    const cmj = result({ id: 'c1', protocolId: 'cmj', unit: 'cm', method: 'contact-mat', attempts: [{ n: 1, value: 30, valid: true }, { n: 2, value: 32, valid: true }] });
    const groups = fieldTestHistory([before, cmj, result(), result({ id: 'x', protocolId: 'unknown-test' })]);
    expect(groups.map((group) => group.protocolId)).toEqual(['sprint-10', 'cmj', 'unknown-test']);
    expect(groups[0].entries.map((entry) => entry.result.id)).toEqual(['ft1', 'old']);
    expect(groups[0].entries[0].comparison?.delta).toBe(-0.1);
    expect(groups[0].entries[1].comparison).toBeNull();
    expect(groups[2].name).toBe('Unbekannter Test „unknown-test“');
  });
});

describe('Feldtests: Dokumente', () => {
  it('hin und zurück ohne Verlust; Rohwerte bleiben in Reihenfolge', () => {
    const doc = docFromFieldTest(result());
    expect(doc['kind']).toBe('fieldTest');
    expect(isFieldTestDoc(doc)).toBe(true);
    expect(fieldTestFromDoc('ft1', doc)).toEqual(result());
  });

  it('kaputte oder alte Felder werden nicht erfunden', () => {
    const parsed = fieldTestFromDoc('x', { kind: 'fieldTest', date: '2026-01-01', attempts: [{ value: 'abc' }, null, { n: 2, value: 1.9, valid: false }], surface: 'Mond' });
    expect(parsed.attempts).toEqual([
      { n: 1, value: null, valid: true },
      { n: 2, value: 1.9, valid: false },
    ]);
    expect(parsed.surface).toBe('');
    expect(parsed.method).toBe('');
  });

  it('Größe/Gewicht-Auswertungen überspringen Feldtests in derselben Sammlung', () => {
    const docs = [
      { id: 'me1', data: { date: '2026-08-01', height: '150', weight: '40' } },
      { id: 'ft1', data: docFromFieldTest(result()) },
    ];
    expect(growthMeasurementsFromDocs(docs, '2026-11-23').map((entry) => entry.id)).toEqual(['me1']);
  });
});

describe('Feldtests: Testtermin prüfen', () => {
  it('speichert nur Spieler mit Eingabe; leere Versuche bleiben leer, ungültige ohne Wert bleiben Rohdatum', () => {
    const evaluation = evaluateSession(
      session(),
      [
        { playerId: 'p1', values: ['1,92', '', '1.85'], invalid: [false, true, false] },
        { playerId: 'p3', values: ['', '', ''], invalid: [] },
      ],
      context,
    );
    expect(evaluation.ok).toBe(true);
    expect(evaluation.entries).toEqual([
      {
        playerId: 'p1',
        attempts: [
          { n: 1, value: 1.92, valid: true },
          { n: 2, value: null, valid: false },
          { n: 3, value: 1.85, valid: true },
        ],
      },
    ]);
    const [saved] = resultsFromSession(session(), evaluation, { sessionId: 's', newId: () => 'id1', recordedAt: '2026-11-20T18:00:00.000Z' });
    expect(saved.result).toMatchObject({ protocolId: 'sprint-10', protocolVersion: '1.0', unit: 's', method: 'light-gate', tester: 'Trainer A', date: '2026-11-20' });
  });

  it('Wertebereich, Einheit, Nachkommastellen und Schrittweite', () => {
    const sprint = evaluateSession(session(), [{ playerId: 'p1', values: ['185', '1,853', 'schnell'], invalid: [] }], context);
    expect(sprint.ok).toBe(false);
    expect(sprint.playerErrors.get('p1')?.attempts).toEqual(['Außerhalb von 1–4 s – Einheit s richtig?', 'Höchstens 2 Nachkommastellen.', 'Bitte eine Zahl in s eingeben (1–4 s).']);
    const yoyo = evaluateSession(session({ protocolId: 'yoyo-ir1', method: 'audio' }), [{ playerId: 'p1', values: ['1250'], invalid: [] }], context);
    expect(yoyo.playerErrors.get('p1')?.attempts).toEqual(['Muss ein Vielfaches von 40 m sein.']);
    const passing = evaluateSession(session({ protocolId: 'passing', method: 'observer' }), [{ playerId: 'p1', values: ['7,5', '0'], invalid: [] }], context);
    expect(passing.playerErrors.get('p1')?.attempts).toEqual(['Bitte eine ganze Zahl eingeben.', '']);
  });

  it('0 Treffer ist ein echter Wert und kein fehlender', () => {
    const passing = evaluateSession(session({ protocolId: 'passing', method: 'observer' }), [{ playerId: 'p1', values: ['0', ''], invalid: [] }], context);
    expect(passing.ok).toBe(true);
    expect(passing.entries[0].attempts).toEqual([{ n: 1, value: 0, valid: true }]);
  });

  it('Datumsgrenzen: Zukunft, vor 2000, vor dem Geburtsdatum', () => {
    const values = [{ playerId: 'p1', values: ['1,9'], invalid: [] }];
    expect(evaluateSession(session({ date: '2026-11-24' }), values, context).errors.date).toBe('Das Testdatum liegt in der Zukunft.');
    expect(evaluateSession(session({ date: '1999-12-31' }), values, context).errors.date).toBe('Das Testdatum liegt vor 2000 – bitte prüfen.');
    expect(evaluateSession(session({ date: '2026-02-30' }), values, context).errors.date).toBe('Bitte ein gültiges Datum eingeben.');
    const born = evaluateSession(session(), [{ playerId: 'p2', values: ['1,9'], invalid: [] }], context);
    expect(born.playerErrors.get('p2')?.general).toBe('Das Testdatum liegt vor dem Geburtsdatum.');
  });

  it('Test, Methode und Tester sind Pflicht; die Methode muss zum Test passen', () => {
    const values = [{ playerId: 'p1', values: ['1,9'], invalid: [] }];
    expect(evaluateSession(session({ protocolId: '' }), values, context).errors.protocol).toBe('Bitte einen Test auswählen.');
    expect(evaluateSession(session({ method: 'audio' }), values, context).errors.method).toBe('Bitte die Messmethode auswählen.');
    expect(evaluateSession(session({ tester: '  ' }), values, context).errors.tester).toBe('Bitte angeben, wer gemessen hat.');
  });

  it('ohne jede Eingabe wird nichts gespeichert', () => {
    const evaluation = evaluateSession(session(), [{ playerId: 'p1', values: [], invalid: [] }], context);
    expect(evaluation.ok).toBe(false);
    expect(evaluation.errors.entries).toBe('Noch keine Werte eingetragen.');
    expect(resultsFromSession(session(), evaluation, { sessionId: 's', newId: () => 'x', recordedAt: '' })).toEqual([]);
  });
});
