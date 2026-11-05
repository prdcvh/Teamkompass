import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { maturityAt, percentText } from '../../core/records/maturity';
import { MaturityService } from '../../core/records/maturity.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import type { FakeFirebase as FakeFirebaseType } from '../../core/testing/fake-firebase';
import { q, qa, renderProfile, renderProfileExtras, settle, text, typeInto } from './testing/profile-fixture';

/** Reife-Kompass im Spielerprofil (SCRUM-190). Jonas (p1) ist am 05.05.2012 geboren, heute = 03.11.2026 (14,5 Jahre). */
describe('Profil: Reife-Kompass', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-03T12:00:00') }));
  afterEach(() => vi.useRealTimers());

  const measurements = (firebase: FakeFirebaseType) =>
    firebase.records.playerRecords.set(
      'p1/measurements',
      new Map([
        ['me1', { date: '2026-04-01', height: '160', weight: '47' }],
        ['me2', { date: '2026-10-01', height: '165', weight: '51' }],
      ]),
    );
  const parents = { playerId: 'p1', sex: 'm', parentsConsent: true, motherHeight: 168, fatherHeight: 182, updatedAt: '2026-11-01T10:00:00.000Z' };
  const card = (fixture: { nativeElement: unknown }) => q<HTMLElement>(fixture, 'tk-maturity-card');
  const expected = (date: string, height: number, weight: number) =>
    maturityAt({ id: date, date, height, weight }, '2012-05-05', { sex: 'm', parentsConsent: true, motherHeight: 168, fatherHeight: 182 })!;

  it('zeigt dem Trainer Reifestand, Einordnung, Hinweis zu den Noten und den Verlauf', async () => {
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
    const latest = expected('2026-10-01', 165, 51);
    const earlier = expected('2026-04-01', 160, 47);
    const content = text(card(fixture));
    expect(text(q(fixture, '.maturity-percent'))).toBe(percentText(latest.percent));
    expect(content).toContain('der erwarteten Erwachsenengröße');
    expect(content).toContain(`erwartete Erwachsenengröße ca. ${Math.round(latest.predictedAdultCm)} cm`);
    expect(content).toContain('Noten und Tests im Licht des Reifestands lesen');
    expect(content).toContain('nicht umgerechnet');
    expect(content).toContain('nur für Trainer und Medizin sichtbar');
    expect(q(fixture, '.maturity-band')?.getAttribute('data-band')).toBe(latest.band);
    const rows = qa(fixture, 'tk-maturity-card .items li').map(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('01.10.2026');
    expect(rows[1]).toContain(percentText(earlier.percent));
  });

  it('ohne Angaben: kein Wert, sondern was fehlt; Größenfelder gesperrt bis zum Häkchen; Speichern berechnet den Wert', async () => {
    const { fixture, firebase } = await renderProfile({ setup: measurements });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '[data-test="maturity-missing"]')).not.toBeNull();
    });
    expect(q(fixture, '.maturity-percent')).toBeNull();
    expect(text(q(fixture, '[data-test="maturity-missing"]'))).toContain('Geschlecht für die Berechnung, Einverständnis der Eltern zur Speicherung ihrer Größe');
    const mother = q<HTMLInputElement>(fixture, 'input[name="motherHeight"]')!;
    const father = q<HTMLInputElement>(fixture, 'input[name="fatherHeight"]')!;
    expect(mother.disabled).toBe(true);
    expect(father.disabled).toBe(true);

    typeInto(q<HTMLSelectElement>(fixture, 'select[name="sex"]')!, 'm', 'change');
    const consent = q<HTMLInputElement>(fixture, 'input[name="parentsConsent"]')!;
    consent.checked = true;
    consent.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(mother.disabled).toBe(false);
    typeInto(mother, '168');
    typeInto(father, '182');
    q<HTMLFormElement>(fixture, 'tk-maturity-card form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(firebase.maturity.docs.get('p1')).toBeDefined());
    expect(firebase.maturity.docs.get('p1')).toMatchObject({ playerId: 'p1', sex: 'm', parentsConsent: true, motherHeight: 168, fatherHeight: 182 });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, '.maturity-percent'))).toBe(percentText(expected('2026-10-01', 165, 51).percent));
    });
  });

  it('Häkchen entfernen löscht beim Speichern die Größen der Eltern', async () => {
    const { fixture, firebase } = await renderProfile({
      setup: (fb) => {
        measurements(fb);
        fb.maturity.docs.set('p1', parents);
      },
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, 'input[name="parentsConsent"]')).not.toBeNull();
    });
    const consent = q<HTMLInputElement>(fixture, 'input[name="parentsConsent"]')!;
    consent.checked = false;
    consent.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(text(card(fixture))).toContain('werden die gespeicherten Größen der Eltern beim Speichern gelöscht');
    q<HTMLFormElement>(fixture, 'tk-maturity-card form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(firebase.maturity.docs.get('p1')?.['parentsConsent']).toBe(false));
    expect(firebase.maturity.docs.get('p1')).toMatchObject({ motherHeight: null, fatherHeight: null, sex: 'm' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.maturity-percent')).toBeNull();
    });
  });

  it('prüft die Größe der Eltern', async () => {
    const { fixture, firebase } = await renderProfile({ setup: (fb) => fb.maturity.docs.set('p1', { ...parents, motherHeight: null, fatherHeight: null }) });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, 'input[name="motherHeight"]')).not.toBeNull();
    });
    typeInto(q<HTMLInputElement>(fixture, 'input[name="motherHeight"]')!, '17');
    q<HTMLFormElement>(fixture, 'tk-maturity-card form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(text(q(fixture, 'tk-maturity-card .error'))).toContain('100 bis 250');
    expect(firebase.maturity.docs.get('p1')?.['motherHeight']).toBeNull();
  });

  it('außerhalb von 12 bis 15 Jahren erscheint kein Wert', async () => {
    const { fixture } = await renderProfile({
      setup: (firebase) => {
        measurements(firebase);
        firebase.maturity.docs.set('p1', parents);
        firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2010-05-05', status: 'Fit', consentStatus: 'granted' });
      },
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '[data-test="maturity-age"]')).not.toBeNull();
    });
    expect(q(fixture, '.maturity-percent')).toBeNull();
  });

  it('Medizin sieht den Reifestand, aber kein Formular', async () => {
    const { fixture, firebase } = await renderProfileExtras('physio');
    firebase.maturity.set('p1', parents);
    // Fixture-Messungen: 01.10.2026 155 cm / 43 kg.
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.maturity-percent')).not.toBeNull();
    });
    expect(q(fixture, 'tk-maturity-card form')).toBeNull();
  });
});

describe('MaturityService: Rollen', () => {
  it.each(['player', 'parent', 'scout'] as const)('%s lädt die Angaben gar nicht erst', (role) => {
    const firebase = new FakeFirebase();
    firebase.maturity.docs.set('p1', { playerId: 'p1', sex: 'm', parentsConsent: true, motherHeight: 168, fatherHeight: 182 });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    const service = TestBed.inject(MaturityService);
    service.start('p1');
    expect(firebase.maturity.calls).toEqual([]);
    expect(service.state()).toBe('idle');
    expect(service.inputs().motherHeight).toBeNull();
  });

  it('Medizin darf nicht speichern', async () => {
    const firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set('physio');
    const service = TestBed.inject(MaturityService);
    service.start('p1');
    await vi.waitFor(() => expect(service.state()).toBe('ready'));
    expect(await service.save({ sex: 'm', parentsConsent: true, motherHeight: 168, fatherHeight: 182 }, '2026-11-03')).toBe(false);
    expect(firebase.maturity.calls).not.toContain('saveMaturity:p1');
  });
});
