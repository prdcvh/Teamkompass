import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { MORE_GROUPS, SIDEBAR_ITEMS } from '../../core/shell/navigation';
import { CurrentTeam } from '../../core/team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { FieldTests } from './field-tests';

describe('Feldtests (Seite, SCRUM-263)', () => {
  let firebase: FakeFirebase;

  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-23T12:00:00Z') }));
  afterEach(() => vi.useRealTimers());

  async function render(role: 'trainer' | 'physio' | 'player' = 'trainer', team = '') {
    firebase = new FakeFirebase();
    const base = { positions: ['ZM'], number: 8, birthdate: '2012-05-05', status: 'Fit' };
    firebase.players.players.set('p1', { ...base, name: 'Ali Adler', consentStatus: 'granted' });
    firebase.players.players.set('p2', { ...base, name: 'Ben Bauer', consentStatus: 'pending' });
    firebase.players.players.set('p3', { ...base, name: 'Cem Celik', consentStatus: 'revoked' });
    firebase.players.players.set('p4', { ...base, name: 'Dan Dorn', consentStatus: 'granted' });
    await TestBed.configureTestingModule({ imports: [FieldTests], providers: [...provideFakeFirebase(firebase), provideRouter([])] }).compileComponents();
    if (team) TestBed.inject(CurrentTeam).id.set(team);
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.displayName.set('Trainer Tom');
    const fixture = TestBed.createComponent(FieldTests);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const settle = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const select = (fixture: { nativeElement: unknown }, name: string, value: string) => {
    const element = root(fixture).querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
    element.value = value;
    element.dispatchEvent(new Event('change'));
  };
  const type = (fixture: { nativeElement: unknown }, name: string, value: string) => {
    const element = root(fixture).querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    element.value = value;
    element.dispatchEvent(new Event('input'));
  };
  const submit = (fixture: { nativeElement: unknown }) => root(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
  const saved = () => [...firebase.records.playerRecords.entries()].filter(([key]) => key.endsWith('/measurements'));

  it('erfasst einen Testtermin mit mehreren Versuchen pro Spieler; ohne Eingabe kein Ergebnis', async () => {
    const fixture = await render();
    await vi.waitFor(() => expect(root(fixture).querySelector('select[name="protocol"]')).not.toBeNull());
    select(fixture, 'protocol', 'sprint-10');
    await settle(fixture);
    expect(root(fixture).querySelector('[data-testid="protocol"]')!.textContent).toContain('kleiner ist besser');
    expect(root(fixture).querySelector<HTMLSelectElement>('select[name="method"]')!.value).toBe('light-gate');
    expect(root(fixture).querySelector<HTMLInputElement>('input[name="tester"]')!.value).toBe('Trainer Tom');
    // Ali, Ben und Dan dürfen (Ben: eigenes Team, Einwilligung offen); Cem hat widerrufen.
    expect([...root(fixture).querySelectorAll('li.player')].map((entry) => entry.getAttribute('data-player'))).toEqual(['p1', 'p2', 'p4']);
    expect(root(fixture).querySelector('[data-testid="blocked"]')!.textContent).toContain('Cem Celik');
    type(fixture, 'a-p1-0', '1,92');
    type(fixture, 'a-p1-1', '1,85');
    const invalid = root(fixture).querySelector<HTMLInputElement>('input[name="i-p1-2"]')!;
    invalid.checked = true;
    invalid.dispatchEvent(new Event('change'));
    type(fixture, 'a-p2-0', '2,01');
    select(fixture, 'surface', 'artificial');
    type(fixture, 'conditions', 'trocken');
    await settle(fixture);
    expect(root(fixture).querySelector('button[type="submit"]')!.textContent).toContain('(2 Spieler)');
    submit(fixture);
    await vi.waitFor(() => expect(saved()).toHaveLength(2));
    const [doc] = [...firebase.records.playerRecords.get('p1/measurements')!.values()];
    expect(doc).toMatchObject({
      kind: 'fieldTest',
      date: '2026-11-23',
      protocolId: 'sprint-10',
      protocolVersion: '1.0',
      unit: 's',
      method: 'light-gate',
      tester: 'Trainer Tom',
      surface: 'artificial',
      conditions: 'trocken',
      playerId: 'p1',
      attempts: [
        { n: 1, value: 1.92, valid: true },
        { n: 2, value: 1.85, valid: true },
        { n: 3, value: null, valid: false },
      ],
    });
    expect(firebase.records.playerRecords.get('p4/measurements')).toBeUndefined();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.done')?.textContent).toContain('für 2 Spieler gespeichert');
    });
  });

  it('ein ungültiger Wert blockiert den ganzen Termin – nichts wird gespeichert', async () => {
    const fixture = await render();
    await vi.waitFor(() => expect(root(fixture).querySelector('select[name="protocol"]')).not.toBeNull());
    select(fixture, 'protocol', 'sprint-10');
    await settle(fixture);
    type(fixture, 'a-p1-0', '1,9');
    type(fixture, 'a-p2-0', '19');
    await settle(fixture);
    submit(fixture);
    await settle(fixture);
    expect(root(fixture).querySelector('li[data-player="p2"] .error')!.textContent).toContain('Außerhalb von 1–4 s');
    expect(root(fixture).textContent).toContain('gespeichert wurde noch nichts');
    expect(saved()).toHaveLength(0);
  });

  it('fremder Verein: ohne dokumentierte Einwilligung kein Feldtest (wie Messwerte)', async () => {
    const fixture = await render('trainer', 'fremdesTeam1234567890');
    await vi.waitFor(() => expect(root(fixture).querySelector('select[name="protocol"]')).not.toBeNull());
    select(fixture, 'protocol', 'cmj');
    await settle(fixture);
    expect([...root(fixture).querySelectorAll('li.player')].map((entry) => entry.getAttribute('data-player'))).toEqual(['p1', 'p4']);
    expect(root(fixture).querySelector('[data-testid="blocked"]')!.textContent).toContain('Ben Bauer');
  });

  it('Spieler und Medizin können keine Feldtests erfassen', async () => {
    for (const role of ['player', 'physio'] as const) {
      TestBed.resetTestingModule();
      const fixture = await render(role);
      expect(root(fixture).textContent).toContain('Feldtests erfassen nur Trainer.');
      expect(root(fixture).querySelector('form')).toBeNull();
    }
  });

  it('die Feldtests stehen in Sidebar und Mehr-Menü', () => {
    expect(SIDEBAR_ITEMS.map((item) => item.path)).toContain('/feldtests');
    expect(MORE_GROUPS.flatMap((group) => group.items).map((item) => item.path)).toContain('/feldtests');
  });
});
