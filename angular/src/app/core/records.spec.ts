import { type Player } from './player';
import { BLANK_RATING, type Rating } from './rating';
import {
  type Absence,
  absenceCoversDate,
  absenceFromDoc,
  absenceFromDraft,
  absencePeriodText,
  absenceTitle,
  activeAbsenceOn,
  autoAbsenceRating,
  calculateBmi,
  docFromMeasurement,
  draftFromAbsence,
  effectiveStatus,
  emptyAbsenceDraft,
  emptyMeasurementDraft,
  emptyPlanDraft,
  isInjuryAbsence,
  measurementChart,
  measurementFromDoc,
  measurementFromDraft,
  measurementText,
  planFromDoc,
  planFromDraft,
  unavailabilityReason,
  validateAbsence,
  validateMeasurement,
  validatePlan,
} from './records';

describe('records (Förderpläne, Abwesenheiten, Messwerte)', () => {
  const player = (overrides: Partial<Player> = {}): Player => ({
    id: 'p1', name: 'Test', positions: ['ST'], number: 9, birthdate: '2012-01-01', status: 'Fit', injuryUntil: '', consentStatus: 'granted', consentDate: '', ...overrides,
  });
  const absence = (overrides: Partial<Absence> = {}): Absence => ({ id: 'a1', kind: 'absence', label: 'Urlaub', detail: '', from: '2026-10-05', to: '2026-10-12', ...overrides });

  describe('Förderplan', () => {
    it('verlangt Schwerpunkt und Ziel und begrenzt die Längen', () => {
      expect(Object.keys(validatePlan(emptyPlanDraft())).sort()).toEqual(['focus', 'goal']);
      const ok = { ...emptyPlanDraft(), focus: 'Orientierung', goal: 'Blick vor dem Ball' };
      expect(validatePlan(ok)).toEqual({});
      expect(validatePlan({ ...ok, focus: 'x'.repeat(51) }).focus).toContain('50');
      expect(validatePlan({ ...ok, goal: 'x'.repeat(91) }).goal).toContain('90');
      expect(validatePlan({ ...ok, coachReview: 'x'.repeat(401) }).coachReview).toContain('400');
      expect(validatePlan({ ...ok, dueDate: '2026-13-01' }).dueDate).toBeTruthy();
    });

    it('behält beim Bearbeiten Selbstreflexion und Anlegedatum', () => {
      const existing = planFromDoc('dp1', { focus: 'a', goal: 'b', selfReflection: 'Lief gut', selfReflectionAt: '2026-10-01T10:00:00Z', createdAt: '2026-09-01', status: 'In Arbeit' }, '2026-10-10');
      const next = planFromDraft({ ...emptyPlanDraft(), id: 'dp1', focus: ' Neu ', goal: 'Ziel', status: 'Erreicht' }, 'dp1', existing, '2026-10-10');
      expect(next).toMatchObject({ focus: 'Neu', selfReflection: 'Lief gut', selfReflectionAt: '2026-10-01T10:00:00Z', createdAt: '2026-09-01', status: 'Erreicht' });
      expect(planFromDraft({ ...emptyPlanDraft(), focus: 'a', goal: 'b' }, 'dp2', undefined, '2026-10-10').createdAt).toBe('2026-10-10');
    });

    it('liest unvollständige Dokumente mit Standardwerten', () => {
      expect(planFromDoc('x', { status: 'unbekannt' }, '2026-10-10')).toMatchObject({ status: 'Offen', createdAt: '2026-10-10', focus: '', selfReflection: '' });
    });
  });

  describe('Abwesenheit', () => {
    it('erkennt Verletzungen auch an alten Einträgen ohne kind', () => {
      expect(isInjuryAbsence({ kind: 'injury' })).toBe(true);
      expect(isInjuryAbsence({ kind: 'absence', label: 'Verletzung' })).toBe(false);
      expect(isInjuryAbsence({ label: 'Verletzung Knie' })).toBe(true);
      expect(isInjuryAbsence({ label: 'Urlaub' })).toBe(false);
      expect(isInjuryAbsence(null)).toBe(false);
      expect(absenceFromDoc('x', { label: 'Verletzung: Knie', from: '2026-10-01' }).kind).toBe('injury');
    });

    it('prüft Eingaben: Grund, Datum, Ende nicht vor Beginn, offenes Ende nur bei Verletzung', () => {
      expect(Object.keys(validateAbsence(emptyAbsenceDraft())).sort()).toEqual(['from', 'reason', 'to']);
      const urlaub = { ...emptyAbsenceDraft(), reason: 'Urlaub', from: '2026-10-05', to: '2026-10-12' };
      expect(validateAbsence(urlaub)).toEqual({});
      expect(validateAbsence({ ...urlaub, to: '' }).to).toContain('Enddatum');
      expect(validateAbsence({ ...urlaub, reason: 'Verletzung', to: '' })).toEqual({});
      expect(validateAbsence({ ...urlaub, to: '2026-10-01' }).to).toContain('nicht vor dem Beginn');
      expect(validateAbsence({ ...urlaub, reason: 'Sonstiges', custom: 'x'.repeat(51) }).custom).toContain('50');
      expect(validateAbsence({ ...urlaub, reason: 'Verletzung', detail: 'x'.repeat(61) }).detail).toContain('60');
    });

    it('baut den Eintrag aus dem Entwurf (Sonstiges, Verletzung mit Art)', () => {
      expect(absenceFromDraft({ ...emptyAbsenceDraft(), reason: 'Sonstiges', custom: ' Krankenhaus ', from: '2026-10-01', to: '2026-10-03' }, 'a')).toEqual({ id: 'a', kind: 'absence', label: 'Krankenhaus', detail: '', from: '2026-10-01', to: '2026-10-03' });
      expect(absenceFromDraft({ ...emptyAbsenceDraft(), reason: 'Sonstiges', from: '2026-10-01', to: '2026-10-03' }, 'a').label).toBe('Sonstiges');
      expect(absenceFromDraft({ ...emptyAbsenceDraft(), reason: 'Verletzung', detail: ' Zerrung ', from: '2026-10-01', to: '' }, 'a')).toEqual({ id: 'a', kind: 'injury', label: 'Verletzung', detail: 'Zerrung', from: '2026-10-01', to: '' });
    });

    it('Bearbeiten-Entwurf: feste Gründe, freier Grund, alte Verletzung wandert in die Detailzeile', () => {
      expect(draftFromAbsence(absence({ label: 'Schule' }))).toMatchObject({ reason: 'Schule', custom: '' });
      expect(draftFromAbsence(absence({ label: 'Krankenhaus' }))).toMatchObject({ reason: 'Sonstiges', custom: 'Krankenhaus' });
      expect(draftFromAbsence({ id: 'x', kind: 'injury', label: 'Verletzung: Knie', detail: '', from: '2026-10-01', to: '' })).toMatchObject({ reason: 'Verletzung', detail: 'Knie' });
    });

    it('Titel und Zeitraum', () => {
      expect(absenceTitle(absence({ label: 'Verletzung', detail: 'Zerrung' }))).toBe('Verletzung · Zerrung');
      expect(absenceTitle(absence())).toBe('Urlaub');
      expect(absencePeriodText(absence())).toBe('05.10.2026 – 12.10.2026');
      expect(absencePeriodText(absence({ to: '' }))).toBe('seit 05.10.2026 · Ende offen');
    });

    it('deckt Tage ab: Ende offen nur bei Verletzung; Verletzung hat Vorrang', () => {
      expect(absenceCoversDate(absence(), '2026-10-05')).toBe(true);
      expect(absenceCoversDate(absence(), '2026-10-12')).toBe(true);
      expect(absenceCoversDate(absence(), '2026-10-13')).toBe(false);
      expect(absenceCoversDate(absence(), '2026-10-04')).toBe(false);
      expect(absenceCoversDate(absence({ to: '' }), '2026-12-01')).toBe(false);
      expect(absenceCoversDate(absence({ kind: 'injury', label: 'Verletzung', to: '' }), '2026-12-01')).toBe(true);
      const injury = absence({ id: 'i', kind: 'injury', label: 'Verletzung', from: '2026-10-01' });
      expect(activeAbsenceOn([absence(), injury], '2026-10-06')?.id).toBe('i');
      expect(activeAbsenceOn([absence()], '2026-11-06')).toBeNull();
    });

    it('Nicht-Verfügbarkeit: Status „Verletzt“ mit Datum oder eingetragene Abwesenheit', () => {
      expect(unavailabilityReason(player({ status: 'Verletzt', injuryUntil: '2026-10-20' }), [], '2026-10-10')).toBe('Verletzt (ca. bis 20.10.2026)');
      expect(unavailabilityReason(player({ status: 'Verletzt', injuryUntil: '2026-10-20' }), [], '2026-10-21')).toBeNull();
      expect(unavailabilityReason(player(), [absence()], '2026-10-06')).toBe('Urlaub (bis 12.10.2026)');
      expect(unavailabilityReason(player(), [absence({ kind: 'injury', label: 'Verletzung', to: '' })], '2026-10-06')).toBe('Verletzung (Ende offen)');
      expect(unavailabilityReason(player(), [], '2026-10-06')).toBeNull();
    });

    it('Anzeige-Status: laufende Abwesenheit überlagert den Status', () => {
      expect(effectiveStatus(player(), [], '2026-10-06')).toBe('Fit');
      expect(effectiveStatus(player(), [absence()], '2026-10-06')).toBe('Abwesend');
      expect(effectiveStatus(player(), [absence({ label: 'Sperre (3 Spiele)' })], '2026-10-06')).toBe('Gesperrt');
      expect(effectiveStatus(player(), [absence({ kind: 'injury', label: 'Verletzung' })], '2026-10-06')).toBe('Verletzt');
      expect(effectiveStatus(player({ status: 'Pause' }), [absence()], '2026-11-01')).toBe('Pause');
    });
  });

  describe('Abwesenheits-Automatik (SCRUM-18)', () => {
    const REASON = 'Urlaub (bis 12.10.2026)';
    const manual = (overrides: Partial<Rating> = {}): Rating => ({ ...BLANK_RATING, ...overrides });

    it('vorwärts: setzt nur komplett unbearbeitete Bewertungen auf „Fehlt“ und markiert sie', () => {
      expect(autoAbsenceRating(null, REASON)).toEqual({ ...BLANK_RATING, attendance: 'absent', note: REASON, autoAbsence: true });
      expect(autoAbsenceRating(manual(), REASON)).toMatchObject({ attendance: 'absent', autoAbsence: true });
    });

    it('lässt manuell gesetzte Anwesenheit sowie Teilnoten und Notizen unangetastet', () => {
      expect(autoAbsenceRating(manual({ attendance: 'present' }), REASON)).toBeNull();
      expect(autoAbsenceRating(manual({ effort: 2 }), REASON)).toBeNull();
      expect(autoAbsenceRating(manual({ note: 'Hat sich gemeldet' }), REASON)).toBeNull();
      expect(autoAbsenceRating(manual({ goals: 1 }), REASON)).toBeNull();
    });

    it('ohne Grund passiert bei nicht markierten Bewertungen nichts', () => {
      expect(autoAbsenceRating(null, null)).toBeNull();
      expect(autoAbsenceRating(manual(), null)).toBeNull();
      expect(autoAbsenceRating(manual({ attendance: 'absent', note: REASON }), null)).toBeNull();
    });

    it('rückwärts: gelöschte Abwesenheit setzt den markierten Eintrag zurück auf leer', () => {
      const auto = manual({ attendance: 'absent', note: REASON, autoAbsence: true });
      expect(autoAbsenceRating(auto, null)).toEqual({ ...BLANK_RATING });
    });

    it('verkürzt/geändert: gleicher Grund = keine Änderung, anderer Grund = neue Notiz', () => {
      const auto = manual({ attendance: 'absent', note: REASON, autoAbsence: true });
      expect(autoAbsenceRating(auto, REASON)).toBeNull();
      expect(autoAbsenceRating(auto, 'Urlaub (bis 10.10.2026)')).toMatchObject({ attendance: 'absent', note: 'Urlaub (bis 10.10.2026)', autoAbsence: true });
    });

    it('eine von Hand geänderte Bewertung (Markierung weg) wird nie wieder zurückgesetzt', () => {
      const edited = manual({ attendance: 'absent', note: REASON, autoAbsence: false });
      expect(autoAbsenceRating(edited, null)).toBeNull();
    });
  });

  describe('Messwerte', () => {
    it('prüft Datum, Größe und Gewicht; mindestens ein Wert', () => {
      const ok = { ...emptyMeasurementDraft('2026-10-10'), height: '150,5', weight: '42' };
      expect(validateMeasurement(ok)).toEqual({});
      expect(validateMeasurement({ ...ok, date: '' }).date).toBeTruthy();
      expect(validateMeasurement({ ...ok, height: 'abc' }).height).toContain('Größe');
      expect(validateMeasurement({ ...ok, height: '300' }).height).toBeTruthy();
      expect(validateMeasurement({ ...ok, weight: '-3' }).weight).toBeTruthy();
      expect(validateMeasurement(emptyMeasurementDraft('2026-10-10')).height).toContain('Größe oder Gewicht');
      expect(validateMeasurement({ ...ok, weight: '' })).toEqual({});
    });

    it('speichert Zahlen mit Punkt und schreibt Werte als Text wie die bisherige App', () => {
      const measurement = measurementFromDraft({ ...emptyMeasurementDraft('2026-10-10'), height: '150,5', weight: '' }, 'm1');
      expect(measurement).toEqual({ id: 'm1', date: '2026-10-10', height: 150.5, weight: null });
      expect(docFromMeasurement(measurement)).toEqual({ id: 'm1', date: '2026-10-10', height: '150.5', weight: '' });
      expect(measurementFromDoc('m1', { date: '2026-10-10', height: '150.5', weight: '' }, '2026-10-11')).toEqual(measurement);
      expect(measurementFromDoc('m2', {}, '2026-10-11')).toEqual({ id: 'm2', date: '2026-10-11', height: null, weight: null });
    });

    it('BMI und Anzeige', () => {
      expect(calculateBmi(150, 40)).toBeCloseTo(17.78, 2);
      expect(calculateBmi(null, 40)).toBeNull();
      expect(calculateBmi(150, null)).toBeNull();
      expect(measurementText({ id: 'm', date: '2026-10-10', height: 150, weight: 40 })).toBe('150 cm · 40 kg · BMI 17,8');
      expect(measurementText({ id: 'm', date: '2026-10-10', height: 150, weight: null })).toBe('150 cm · – kg');
    });
  });
});

describe('measurementChart', () => {
  const m = (id: string, date: string, height: number | null, weight: number | null) => ({ id, date, height, weight });

  it('braucht mindestens zwei Messungen der letzten 12 Monate mit Größe und Gewicht', () => {
    expect(measurementChart([], '2026-10-10').enough).toBe(false);
    expect(measurementChart([m('a', '2026-10-01', 150, 40)], '2026-10-10').enough).toBe(false);
    expect(measurementChart([m('a', '2025-09-01', 150, 40), m('b', '2026-10-01', 155, 43)], '2026-10-10').enough).toBe(false); // erste älter als 12 Monate
    expect(measurementChart([m('a', '2026-07-01', 150, null), m('b', '2026-10-01', 155, 43)], '2026-10-10').enough).toBe(false); // ohne Gewicht
    expect(measurementChart([m('a', '2025-10-10', 150, 40), m('b', '2026-10-01', 155, 43)], '2026-10-10').enough).toBe(true); // genau 12 Monate zählt
  });

  it('streckt jede Reihe einzeln: kleinster Wert unten, größter oben; älteste links', () => {
    const chart = measurementChart([m('b', '2026-10-01', 155, 43), m('a', '2026-07-01', 150, 40)], '2026-10-10');
    expect(chart.series.map((series) => series.key)).toEqual(['height', 'weight', 'bmi']);
    for (const series of chart.series) {
      expect(series.points).toHaveLength(2);
      expect(series.points[0].x).toBeLessThan(series.points[1].x);
      expect(series.points[0].y).toBeGreaterThan(series.points[1].y); // der kleinere (frühere) Wert liegt unten
    }
    expect(chart.series[0].label).toBe('Größe 155 cm');
    expect(chart.series[1].label).toBe('Gewicht 43 kg');
    expect(chart.labels.map((label) => label.text)).toEqual(['2026-07', '2026-10']);
    expect(chart.series[0].path.startsWith('M ')).toBe(true);
  });

  it('gleichbleibende Werte ergeben eine waagerechte Linie ohne Division durch null', () => {
    const chart = measurementChart([m('a', '2026-07-01', 150, 40), m('b', '2026-10-01', 150, 40)], '2026-10-10');
    expect(chart.series[0].points[0].y).toBe(chart.series[0].points[1].y);
    expect(Number.isFinite(chart.series[0].points[0].y)).toBe(true);
  });
});
