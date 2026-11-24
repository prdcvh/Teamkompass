import {
  ANCHOR_VERSION,
  BEHAVIOR_CRITERIA,
  type BehaviorObservation,
  type ObservationDraft,
  anchorFor,
  criterionById,
  criterionSummary,
  docFromObservation,
  observationFromDoc,
  observationFromDraft,
  observationSummaries,
  rangeLabel,
  uncalibrated,
  uncalibratedReason,
  validateObservationDraft,
} from './behavior-observation';

const TODAY = '2026-11-24';
const criterion = criterionById('afterMistake')!;

const entry = (change: Partial<BehaviorObservation> = {}): BehaviorObservation => ({
  id: 'o1',
  framework: ANCHOR_VERSION,
  criterionId: 'afterMistake',
  value: 3,
  date: '2026-11-20',
  periodFrom: '2026-10-24',
  periodTo: '2026-11-20',
  opportunities: 4,
  eventId: null,
  evidence: '',
  source: 'trainer',
  by: 'Trainer A',
  byUid: 'a',
  createdAt: '2026-11-20T19:00:00.000Z',
  calibrated: true,
  ...change,
});

const draft = (change: Partial<ObservationDraft> = {}): ObservationDraft => ({
  criterionId: 'communication',
  value: 4,
  periodFrom: '2026-10-28',
  periodTo: '2026-11-24',
  opportunities: '5',
  eventId: '',
  evidence: '',
  ...change,
});

describe('Beobachtungsanker (SCRUM-268)', () => {
  describe('Katalog', () => {
    it('hat die vier Kriterien aus dem Ticket mit je fünf Ankern samt Beispiel', () => {
      expect(BEHAVIOR_CRITERIA.map((c) => c.label)).toEqual(['Konzentration nach Fehlern', 'Kommunikation', 'Verantwortungsübernahme', 'Lernverhalten']);
      for (const c of BEHAVIOR_CRITERIA) {
        expect(c.anchors).toHaveLength(5);
        for (const anchor of c.anchors) {
          expect(anchor.text.length).toBeGreaterThan(10);
          expect(anchor.example.length).toBeGreaterThan(10);
        }
      }
    });

    it('enthält keine Persönlichkeits-, Diagnose- oder Talentetiketten', () => {
      const all = BEHAVIOR_CRITERIA.flatMap((c) => [c.label, c.question, ...c.anchors.flatMap((a) => [a.text, a.example])]).join(' ');
      expect(all).not.toMatch(/mental (stark|schwach)|Führungsspieler|\bschwierig\b|\bfaul|Talent|ADHS|Störung|Diagnose|depress|ängstlich|labil/i);
    });

    it('anchorFor liefert den Anker der Stufe, sonst null', () => {
      expect(anchorFor('learning', 1)?.text).toContain('Korrekturen selten');
      expect(anchorFor('learning', 0)).toBeNull();
      expect(anchorFor('learning', 6)).toBeNull();
      expect(anchorFor('learning', 2.5)).toBeNull();
      expect(anchorFor('unbekannt', 3)).toBeNull();
    });
  });

  describe('Eingabe', () => {
    it('gültige Beobachtung hat Kriterium, Stufe, Zeitraum, Gelegenheiten, Datum und Quelle', () => {
      expect(validateObservationDraft(draft(), TODAY, [])).toEqual({});
      const saved = observationFromDraft(draft({ evidence: '  Ruft „Zeit“  ' }), { id: 'x', date: TODAY, by: 'Trainer A', byUid: 'a', createdAt: 'now' });
      expect(docFromObservation(saved)).toEqual({
        framework: ANCHOR_VERSION,
        criterionId: 'communication',
        value: 4,
        date: TODAY,
        periodFrom: '2026-10-28',
        periodTo: '2026-11-24',
        opportunities: 5,
        eventId: null,
        evidence: 'Ruft „Zeit“',
        source: 'trainer',
        by: 'Trainer A',
        byUid: 'a',
        createdAt: 'now',
      });
    });

    it('verlangt Stufe, Zeitraum und Gelegenheiten', () => {
      const errors = validateObservationDraft(draft({ value: null, periodFrom: '', periodTo: '2026-11-25', opportunities: '' }), TODAY, []);
      expect(Object.keys(errors).sort()).toEqual(['opportunities', 'periodFrom', 'periodTo', 'value']);
      expect(validateObservationDraft(draft({ opportunities: '0' }), TODAY, []).opportunities).toBeDefined();
      expect(validateObservationDraft(draft({ opportunities: '2,5' }), TODAY, []).opportunities).toBeDefined();
      expect(validateObservationDraft(draft({ opportunities: '51' }), TODAY, []).opportunities).toBeDefined();
      expect(validateObservationDraft(draft({ periodFrom: '2026-11-25', periodTo: '2026-11-24' }), TODAY, []).periodFrom).toContain('vor dem Ende');
      expect(validateObservationDraft(draft({ periodFrom: '2025-01-01' }), TODAY, []).periodFrom).toContain('365');
      expect(validateObservationDraft(draft({ criterionId: 'x' }), TODAY, []).criterionId).toBeDefined();
      expect(validateObservationDraft(draft({ evidence: 'x'.repeat(301) }), TODAY, []).evidence).toBeDefined();
    });

    it('Termin als Beleg muss existieren und im Zeitraum liegen', () => {
      const events = [{ id: 'e1', date: '2026-11-15', title: 'Spiel' }, { id: 'e2', date: '2026-09-01', title: 'Alt' }];
      expect(validateObservationDraft(draft({ eventId: 'e1' }), TODAY, events)).toEqual({});
      expect(validateObservationDraft(draft({ eventId: 'e2' }), TODAY, events).eventId).toContain('außerhalb');
      expect(validateObservationDraft(draft({ eventId: 'weg' }), TODAY, events).eventId).toBeDefined();
    });
  });

  describe('Altdaten', () => {
    it('vollständige Dokumente sind kalibriert', () => {
      const read = observationFromDoc('o1', { ...docFromObservation(entry()), playerId: 'p1' });
      expect(read).toMatchObject({ calibrated: true, value: 3, opportunities: 4 });
    });

    it('Einträge ohne Beleg (Zeitraum, Gelegenheiten, Version) bleiben lesbar, gelten aber als historisch/unkalibriert', () => {
      const old = observationFromDoc('alt', { criterionId: 'afterMistake', value: 2, date: '2025-05-01', by: 'Früherer Trainer' });
      expect(old).toMatchObject({ calibrated: false, value: 2, by: 'Früherer Trainer', date: '2025-05-01' });
      expect(uncalibratedReason(old!)).toBe('ohne Ankerversion');
      const noCount = observationFromDoc('n', { ...docFromObservation(entry()), opportunities: null })!;
      expect(noCount.calibrated).toBe(false);
      expect(uncalibratedReason(noCount)).toContain('gelegenheiten');
      const other = observationFromDoc('r', { ...docFromObservation(entry()), framework: 'raster-1' })!;
      expect(uncalibratedReason(other)).toContain('raster-1');
      expect(uncalibrated([old!, entry(), noCount]).map((e) => e.id)).toEqual(['n', 'alt']);
      // Unkalibrierte Einträge zählen nicht zum aktuellen Stand.
      expect(criterionSummary([old!, noCount], criterion, TODAY).quality).toBe('none');
    });

    it('ohne lesbare Stufe oder Datum wird nichts erfunden', () => {
      expect(observationFromDoc('x', { criterionId: 'afterMistake', date: '2026-01-01' })).toBeNull();
      expect(observationFromDoc('x', { criterionId: 'afterMistake', value: 3 })).toBeNull();
    });
  });

  describe('Auswertung', () => {
    it('ohne Beobachtung: „noch nicht beobachtet“, kein Wert', () => {
      const summary = criterionSummary([], criterion, TODAY);
      expect(summary).toMatchObject({ quality: 'none', range: null, opportunities: 0 });
      expect(rangeLabel(summary.range)).toBe('–');
    });

    it('wenige Gelegenheiten erscheinen ausdrücklich als unsicher', () => {
      const summary = criterionSummary([entry({ opportunities: 2 })], criterion, TODAY);
      expect(summary.quality).toBe('limited');
      expect(summary.message).toContain('Erst 2 Beobachtungsgelegenheiten');
      expect(summary.message).toContain('unsicher');
    });

    it('genug Gelegenheiten eines Trainers: ausreichend, aber als eine Perspektive benannt', () => {
      const summary = criterionSummary([entry({ opportunities: 6 })], criterion, TODAY);
      expect(summary.quality).toBe('sufficient');
      expect(summary.message).toContain('eine Perspektive');
      expect(rangeLabel(summary.range)).toBe('Stufe 3');
    });

    it('zwei widersprüchliche Trainerurteile bleiben beide sichtbar, ohne Mittelwert', () => {
      const a = entry({ id: 'a', value: 1, opportunities: 5 });
      const b = entry({ id: 'b', value: 4, byUid: 'b', by: 'Trainer B', opportunities: 5 });
      const summary = criterionSummary([a, b], criterion, TODAY);
      expect(summary.quality).toBe('conflicting');
      expect(summary.perAssessor.map((e) => e.value).sort()).toEqual([1, 4]);
      expect(summary.range).toEqual({ min: 1, max: 4 });
      expect(summary.message).toContain('keinen Mittelwert');
      expect(summary.message).not.toMatch(/2,5|2\.5/);
      expect(JSON.stringify(summary)).not.toContain('2.5');
    });

    it('nah beieinander: Spanne statt Mittelwert; Gelegenheiten der Trainer zusammen', () => {
      const summary = criterionSummary([entry({ value: 3, opportunities: 3 }), entry({ id: 'b', byUid: 'b', value: 4, opportunities: 3 })], criterion, TODAY);
      expect(summary).toMatchObject({ quality: 'sufficient', opportunities: 6, assessors: 2 });
      expect(rangeLabel(summary.range)).toBe('Stufe 3–4');
    });

    it('je Trainer zählt die jüngste Einschätzung; ältere bleiben im Verlauf', () => {
      const older = entry({ id: 'alt', value: 1, periodFrom: '2026-08-01', periodTo: '2026-08-30', opportunities: 10 });
      const newer = entry({ id: 'neu', value: 4, opportunities: 2 });
      const summary = criterionSummary([older, newer], criterion, TODAY);
      expect(summary.perAssessor.map((e) => e.id)).toEqual(['neu']);
      expect(summary.quality).toBe('limited');
    });

    it('Einschätzungen, deren Zeitraum über ein Jahr zurückliegt, zählen nicht mehr', () => {
      const old = entry({ periodFrom: '2025-09-01', periodTo: '2025-10-01', date: '2025-10-01', opportunities: 10 });
      expect(criterionSummary([old], criterion, TODAY).quality).toBe('none');
    });

    it('liefert für jedes Kriterium eine Zusammenfassung, andere Kriterien mischen sich nicht ein', () => {
      const summaries = observationSummaries([entry({ criterionId: 'learning', opportunities: 8 })], TODAY);
      expect(summaries.map((s) => s.quality)).toEqual(['none', 'none', 'none', 'sufficient']);
    });
  });
});
