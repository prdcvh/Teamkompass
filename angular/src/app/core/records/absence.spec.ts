import { type Absence, absenceCoversDate, absenceFromDoc, absenceFromDraft, absencePeriodText, absenceTitle, activeAbsenceOn, draftFromAbsence, emptyAbsenceDraft, isInjuryAbsence, validateAbsence } from './absence';

describe('Abwesenheit', () => {
  const absence = (overrides: Partial<Absence> = {}): Absence => ({ id: 'a1', kind: 'absence', label: 'Urlaub', detail: '', from: '2026-10-05', to: '2026-10-12', ...overrides });

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
});
