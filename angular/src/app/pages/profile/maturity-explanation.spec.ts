import type { FakeFirebase } from '../../core/testing/fake-firebase';
import { q, qa, renderProfile, text } from './testing/profile-fixture';

/** Reife-Kompass: Datengrundlage und Unsicherheit (SCRUM-256). Jonas (p1) ist am 05.05.2012 geboren. */
describe('Profil: Reife-Kompass – Datengrundlage und Unsicherheit (SCRUM-256)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-03T12:00:00') }));
  afterEach(() => vi.useRealTimers());

  const measurements = (firebase: FakeFirebase) =>
    firebase.records.playerRecords.set(
      'p1/measurements',
      new Map([
        ['me1', { date: '2026-04-01', height: '160', weight: '47' }],
        ['me2', { date: '2026-10-01', height: '165', weight: '51' }],
      ]),
    );
  const parents = { playerId: 'p1', sex: 'm', parentsConsent: true, motherHeight: 168, fatherHeight: 182, updatedAt: '2026-11-01T10:00:00.000Z' };

  it('keine Elternhöhen: Wachstumskurve bleibt, kein Wert, „nicht eingeordnet“ mit konkretem Grund', async () => {
    const { fixture } = await renderProfile({
      setup: (firebase) => {
        measurements(firebase);
        firebase.maturity.docs.set('p1', { ...parents, motherHeight: null, fatherHeight: null });
      },
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '[data-test="maturity-missing"]')).not.toBeNull();
    });
    expect(q(fixture, '.maturity-percent')).toBeNull();
    expect(q(fixture, '.maturity-band')).toBeNull();
    expect(text(q(fixture, '[data-test="maturity-status"]'))).toBe('nicht eingeordnet');
    expect(text(q(fixture, '[data-test="maturity-missing"]'))).toContain('Größe beider Eltern');
    expect(text(q(fixture, '[data-test="maturity-missing"]'))).toContain('Wachstumskurve oben ist davon unabhängig nutzbar');
    expect(qa(fixture, 'tk-growth-velocity-card tbody tr').length).toBeGreaterThan(0);
  });

  it('veraltete Messung: Wert mit Datum, aber keine Einordnung', async () => {
    vi.setSystemTime(new Date('2027-02-01T12:00:00'));
    const { fixture } = await renderProfile({
      setup: (firebase) => {
        measurements(firebase);
        firebase.maturity.docs.set('p1', parents);
      },
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.maturity-percent')).not.toBeNull();
    });
    expect(q(fixture, '.maturity-band')).toBeNull();
    expect(text(q(fixture, '[data-test="maturity-status"]'))).toBe('nicht eingeordnet – Messung veraltet');
    expect(text(q(fixture, '[data-test="maturity-causes"]'))).toContain('123 Tage alt');
  });

  it('zur Prüfung markierte Messung: „Einordnung unsicher – prüfen“ mit Ursache, keine Einordnung', async () => {
    const { fixture } = await renderProfile({
      setup: (firebase) => {
        firebase.records.playerRecords.set(
          'p1/measurements',
          new Map([
            ['me1', { date: '2026-04-01', height: '160', weight: '47' }],
            ['me2', { date: '2026-10-01', height: '165', weight: '51', quality: 'flagged', flags: ['height-range'] }],
          ]),
        );
        firebase.maturity.docs.set('p1', parents);
      },
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '[data-test="maturity-causes"]')).not.toBeNull();
    });
    expect(q(fixture, '.maturity-band')).toBeNull();
    expect(text(q(fixture, '[data-test="maturity-status"]'))).toBe('Einordnung unsicher – prüfen');
    expect(text(q(fixture, '[data-test="maturity-causes"]'))).toContain('zur Prüfung markiert');
    expect(text(q(fixture, '[data-test="maturity-causes"]'))).toContain('keine Mehrheit');
    expect(text(qa(fixture, 'tk-maturity-card .items li')[0])).toContain('Messung prüfen');
  });

  it('widerrufene Einwilligung: keine Erklärung, keine Datengrundlage (SCRUM-252 bleibt respektiert)', async () => {
    const { fixture } = await renderProfile({
      setup: (firebase) => {
        measurements(firebase);
        firebase.maturity.docs.set('p1', parents);
        firebase.players.players.set('p1', { ...firebase.players.players.get('p1'), consentStatus: 'revoked' });
      },
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '[data-test="maturity-stopped"]')).not.toBeNull();
    });
    expect(q(fixture, 'tk-maturity-explanation')).toBeNull();
    expect(q(fixture, '[data-test="maturity-basis"]')).toBeNull();
  });
});
