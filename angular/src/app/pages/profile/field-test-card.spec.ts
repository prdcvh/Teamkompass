import { qa, q, renderProfileExtras, settle, text } from './testing/profile-fixture';

const sprint = (id: string, date: string, method: string, attempts: { n: number; value: number | null; valid: boolean }[]) => ({
  kind: 'fieldTest',
  date,
  sessionId: `s-${id}`,
  protocolId: 'sprint-10',
  protocolVersion: '1.0',
  unit: 's',
  method,
  tester: 'Trainer Tom',
  surface: 'artificial',
  conditions: 'trocken, 10 °C',
  attempts,
  recordedAt: `${date}T18:00:00.000Z`,
  playerId: 'p1',
});

describe('Profil: Feldtests (SCRUM-263)', () => {
  const setup = (firebase: Parameters<NonNullable<Parameters<typeof renderProfileExtras>[1]>>[0]) => {
    const measurements = firebase.records.playerRecords.get('p1/measurements')!;
    measurements.set('ft1', sprint('ft1', '2026-09-01', 'stopwatch', [{ n: 1, value: 1.95, valid: true }]));
    measurements.set('ft2', sprint('ft2', '2026-11-20', 'light-gate', [
      { n: 1, value: 1.92, valid: true },
      { n: 2, value: 1.85, valid: true },
      { n: 3, value: null, valid: false },
    ]));
    measurements.set('ft3', { kind: 'fieldTest', date: '2025-05-01', protocolId: 'beep-test', protocolVersion: '0.1', unit: 'Stufe', method: 'pfeife', attempts: [{ n: 1, value: 7.5, valid: true }], playerId: 'p1' });
  };

  it('zeigt Ergebnis, Regel, Rohwerte, Methode und warnt bei anderer Messmethode', async () => {
    const { fixture } = await renderProfileExtras('trainer', setup);
    await settle(fixture);
    const card = text(q(fixture, 'tk-field-test-card'));
    expect(card).toContain('10-m-Sprint');
    expect(card).toContain('kleiner ist besser');
    expect(card).toContain('20.11.2026: 1,85 s');
    expect(card).toContain('bester gültiger Versuch (kleinster Wert) – 2. Versuch');
    expect(card).toContain('Versuche: 1.: 1,92 · 2.: 1,85 · 3.: kein Wert (ungültig)');
    expect(card).toContain('Methode: Lichtschranke · Kunstrasen · Protokoll 1.0');
    expect(card).toContain('Gemessen von Trainer Tom · trocken, 10 °C');
    expect(card).toContain('0,1 s weniger seit 01.09.2026 (besser, kleiner ist besser).');
    expect(card).toContain('Achtung: Andere Messmethode (vorher Handstoppung (Stoppuhr), jetzt Lichtschranke) – nur eingeschränkt vergleichbar.');
    expect(card).toContain('keine Gesamtnote');
    // Alte Daten eines Tests, den der Katalog nicht kennt, bleiben lesbar.
    expect(card).toContain('Unbekannter Test „beep-test“');
    expect(card).toContain('1.: 7,5');
    expect(card).toContain('Methode: pfeife');
    // Feldtests erscheinen nicht als Größe/Gewicht-Messung.
    expect(qa(fixture, 'tk-profile-extras button').filter((entry) => entry.getAttribute('aria-label')?.startsWith('Messung löschen'))).toHaveLength(2);
  });

  it('Trainer löscht ein Ergebnis erst nach Bestätigung', async () => {
    const { fixture, firebase } = await renderProfileExtras('trainer', setup);
    await settle(fixture);
    qa<HTMLButtonElement>(fixture, 'tk-field-test-card button').find((entry) => entry.getAttribute('aria-label') === 'Feldtest löschen: 10-m-Sprint vom 01.09.2026')!.click();
    await settle(fixture);
    expect(firebase.records.playerRecords.get('p1/measurements')!.has('ft1')).toBe(true);
    qa<HTMLButtonElement>(fixture, 'tk-field-test-card .confirm-actions button').find((entry) => text(entry) === 'Endgültig löschen')!.click();
    await vi.waitFor(() => expect(firebase.records.playerRecords.get('p1/measurements')!.has('ft1')).toBe(false));
    expect(firebase.records.playerRecords.get('p1/measurements')!.has('me1')).toBe(true);
  });

  it('Medizin liest mit (wie Messwerte), kann aber nichts löschen', async () => {
    const { fixture } = await renderProfileExtras('physio', setup);
    await settle(fixture);
    expect(text(q(fixture, 'tk-field-test-card'))).toContain('20.11.2026: 1,85 s');
    expect(qa(fixture, 'tk-field-test-card button')).toHaveLength(0);
    expect(q(fixture, 'tk-field-test-card a')).toBeNull();
  });
});
