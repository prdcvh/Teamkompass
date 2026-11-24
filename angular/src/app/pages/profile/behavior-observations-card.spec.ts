import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import type { FakeFirebase } from '../../core/testing/fake-firebase';
import { q, qa, renderProfile, settle, text, typeInto } from './testing/profile-fixture';

/** Beobachtungen mit Verhaltensankern im Trainerprofil (SCRUM-268). */
describe('Profil: Beobachtungen mit Verhaltensankern', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-24T12:00:00') }));
  afterEach(() => vi.useRealTimers());

  const doc = (change: Record<string, unknown> = {}) => ({
    playerId: 'p1', framework: 'anker-1', criterionId: 'afterMistake', value: 4, date: '2026-11-20', periodFrom: '2026-10-24', periodTo: '2026-11-20',
    opportunities: 4, eventId: null, evidence: '', source: 'trainer', by: 'Trainer A', byUid: 'a', createdAt: '2026-11-20T19:00:00.000Z', ...change,
  });
  const seed = (entries: Record<string, Record<string, unknown>>) => (firebase: FakeFirebase) => {
    firebase.records.playerRecords.set('p1/behaviorObservations', new Map(Object.entries(entries)));
  };
  const card = async (fixture: Awaited<ReturnType<typeof renderProfile>>['fixture']) => {
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '[data-testid="criterion-afterMistake"]')).not.toBeNull();
    });
    return q(fixture, '[data-testid="behavior-observations"]')!;
  };

  it('zeigt alle Kriterien; ohne Beobachtung „noch nicht beobachtet“; Eventnoten als historisch/unkalibriert gekennzeichnet', async () => {
    const { fixture } = await renderProfile();
    const panel = await card(fixture);
    expect(qa(fixture, '[data-testid^="criterion-"]')).toHaveLength(4);
    expect(text(panel)).toContain('Noch nicht beobachtet');
    expect(text(panel)).toContain('keine feste Eigenschaft, keine Diagnose');
    expect(text(q(fixture, '[data-testid="grades-uncalibrated"]'))).toContain('historisch/unkalibriert');
  });

  it('zwei widersprüchliche Trainerurteile bleiben nebeneinander sichtbar, ohne eindeutige Zahl', async () => {
    const { fixture } = await renderProfile({ setup: seed({ a: doc({ value: 1 }), b: doc({ value: 4, by: 'Trainer B', byUid: 'b' }) }) });
    await card(fixture);
    const row = q(fixture, '[data-testid="criterion-afterMistake"]')!;
    expect(row.getAttribute('data-quality')).toBe('conflicting');
    expect(text(row)).toContain('Widersprüchliche Einschätzung');
    expect(text(row)).toContain('Trainer A: Stufe 1');
    expect(text(row)).toContain('Trainer B: Stufe 4');
    expect(text(row)).toContain('keinen Mittelwert');
    expect(row.querySelector('.level')).toBeNull();
    expect(text(row)).not.toMatch(/2,5|Stufe 1–4/);
  });

  it('wenige Gelegenheiten erscheinen ausdrücklich als unsicher, mit Zeitraum, Quelle und Beleg', async () => {
    const { fixture } = await renderProfile({ setup: seed({ a: doc({ opportunities: 2, eventId: 'e2', evidence: 'Nach dem 0:1 sofort angetrieben', periodFrom: '2026-09-01' }) }) });
    await card(fixture);
    const row = text(q(fixture, '[data-testid="criterion-afterMistake"]'));
    expect(row).toContain('Begrenzte Daten – unsicher');
    expect(row).toContain('Erst 2 Beobachtungsgelegenheiten');
    expect(row).toContain('01.09.2026–20.11.2026');
    expect(row).toContain('Trainereinschätzung vom 20.11.2026');
    expect(row).toContain('Beleg: „Nach dem 0:1 sofort angetrieben“');
    expect(row).toContain('Termin: <img src=x onerror=alert(1)> (08.09.2026)');
    expect(q(fixture, '[data-testid="criterion-afterMistake"] img')).toBeNull();
  });

  it('Altdaten ohne Beleg bleiben lesbar und sind als historisch/unkalibriert gekennzeichnet', async () => {
    const { fixture } = await renderProfile({ setup: seed({ alt: { criterionId: 'learning', value: 2, date: '2025-04-01', by: 'Früherer Trainer' } }) });
    await card(fixture);
    const legacy = q(fixture, '[data-testid="behavior-legacy"]')!;
    expect(text(legacy)).toContain('Historisch / unkalibriert · 1');
    expect(text(legacy)).toContain('Lernverhalten · Wert 2 · Früherer Trainer · 01.04.2025');
    expect(text(legacy)).toContain('ohne Ankerversion');
    expect(q(fixture, '[data-testid="criterion-learning"]')!.getAttribute('data-quality')).toBe('none');
  });

  it('Beobachtung eintragen: Anker wählen, Zeitraum und Gelegenheiten; gespeichert mit Datum, Quelle und eigenem Konto', async () => {
    const { fixture, firebase } = await renderProfile();
    TestBed.inject(SessionService).displayName.set('Pascal Trainer');
    await card(fixture);
    const add = qa<HTMLButtonElement>(fixture, '[data-testid="criterion-communication"] button').find((button) => text(button).startsWith('+ Einschätzung'))!;
    add.click();
    await settle(fixture);
    const dialog = q(fixture, 'tk-behavior-observation-dialog')!;
    expect(dialog.querySelector<HTMLSelectElement>('select[name="criterionId"]')!.value).toBe('communication');
    const anchors = dialog.querySelectorAll<HTMLInputElement>('input[name="value"]');
    expect(anchors).toHaveLength(5);
    expect(text(dialog)).toContain('Beispiel:');
    // Ohne Stufe und Gelegenheiten wird nichts gespeichert.
    dialog.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(text(dialog)).toContain('Bitte die Beschreibung wählen');
    expect(firebase.records.playerRecords.get('p1/behaviorObservations')).toBeUndefined();
    anchors[3].dispatchEvent(new Event('change'));
    typeInto(dialog.querySelector<HTMLInputElement>('input[name="opportunities"]')!, '7');
    typeInto(dialog.querySelector<HTMLTextAreaElement>('textarea[name="evidence"]')!, 'Spricht Standards ab');
    dialog.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect([...(firebase.records.playerRecords.get('p1/behaviorObservations')?.values() ?? [])]).toHaveLength(1);
    });
    const saved = [...firebase.records.playerRecords.get('p1/behaviorObservations')!.values()][0];
    expect(saved).toMatchObject({
      playerId: 'p1', framework: 'anker-1', criterionId: 'communication', value: 4, date: '2026-11-24', periodFrom: '2026-10-28', periodTo: '2026-11-24',
      opportunities: 7, eventId: null, evidence: 'Spricht Standards ab', source: 'trainer', by: 'Pascal Trainer', byUid: 'uid-trainer',
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '[data-testid="criterion-communication"]')!.getAttribute('data-quality')).toBe('sufficient');
    });
  });

  it('Einträge lassen sich nach Rückfrage löschen', async () => {
    const { fixture, firebase } = await renderProfile({ setup: seed({ a: doc() }) });
    await card(fixture);
    const fold = q(fixture, '[data-testid="behavior-observations"] details.fold')!;
    const ask = [...fold.querySelectorAll<HTMLButtonElement>('button')].find((button) => text(button) === 'Löschen')!;
    ask.click();
    await settle(fixture);
    [...fold.querySelectorAll<HTMLButtonElement>('button')].find((button) => text(button) === 'Wirklich löschen')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(firebase.records.playerRecords.get('p1/behaviorObservations')?.size).toBe(0);
    });
  });

  it('bei widerrufener Einwilligung keine neuen Beobachtungen', async () => {
    const { fixture } = await renderProfile({ id: 'p2', consent: 'revoked' });
    await card(fixture);
    const panel = text(q(fixture, '[data-testid="behavior-observations"]'));
    expect(panel).toContain('keine neuen Beobachtungen');
    expect(qa<HTMLButtonElement>(fixture, '[data-testid="behavior-observations"] button').some((button) => text(button).startsWith('+'))).toBe(false);
  });

  it('ohne Trainerrolle wird nichts geladen und nichts gezeigt', async () => {
    const { fixture, firebase } = await renderProfile();
    TestBed.inject(SessionService).role.set('physio');
    await settle(fixture);
    expect(q(fixture, '[data-testid="behavior-observations"]')).toBeNull();
    firebase.calls.length = 0;
    await settle(fixture);
    expect(firebase.calls.some((call) => call.includes('behaviorObservations'))).toBe(false);
  });
});
