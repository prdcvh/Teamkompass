import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { MORE_GROUPS, SIDEBAR_ITEMS } from '../../core/shell/navigation';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { MeasurementPlan } from './measurement-plan';

describe('Messplan (Seite, SCRUM-255)', () => {
  let firebase: FakeFirebase;

  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-17T12:00:00Z') }));
  afterEach(() => vi.useRealTimers());

  async function render(role: 'trainer' | 'physio' | 'player' = 'trainer') {
    firebase = new FakeFirebase();
    const base = { positions: ['ZM'], number: 8, birthdate: '2012-05-05', status: 'Fit' };
    firebase.players.players.set('p1', { ...base, name: 'Ali Adler', consentStatus: 'granted' });
    firebase.players.players.set('p2', { ...base, name: 'Ben Bauer', consentStatus: 'granted' });
    firebase.players.players.set('p3', { ...base, name: 'Cem Celik', consentStatus: 'pending' });
    firebase.records.playerRecords.set('p1/measurements', new Map([['m1', { date: '2026-08-01', height: '150', weight: '', playerId: 'p1' }]]));
    await TestBed.configureTestingModule({ imports: [MeasurementPlan], providers: [...provideFakeFirebase(firebase), provideRouter([])] }).compileComponents();
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(MeasurementPlan);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const row = (fixture: { nativeElement: unknown }, name: string) => [...root(fixture).querySelectorAll<HTMLElement>('li.row')].find((entry) => entry.textContent?.includes(name))!;
  const button = (scope: HTMLElement, text: string) => [...scope.querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent?.includes(text))!;

  it('zeigt je Spieler letzte Messung, Termin und Status; ohne Einwilligung neutral darunter', async () => {
    const fixture = await render();
    await vi.waitFor(() => expect(root(fixture).querySelectorAll('li.row')).toHaveLength(2));
    expect(row(fixture, 'Ali Adler').textContent).toContain('Überfällig');
    expect(row(fixture, 'Ali Adler').textContent).toContain('01.08.2026');
    expect(row(fixture, 'Ali Adler').textContent).toContain('01.11.2026');
    expect(row(fixture, 'Ben Bauer').textContent).toContain('Baseline fehlt');
    const outside = root(fixture).querySelector('.panel')!.textContent!;
    expect(outside).toContain('Cem Celik');
    expect(outside).toContain('Einwilligung offen');
    expect(root(fixture).textContent).toContain('Dreimonatsrhythmus');
    expect(root(fixture).textContent).toContain('keine medizinische Frist');
    expect(root(fixture).querySelector('.summary')!.textContent).toContain('1 überfällig');
  });

  it('Spieler und Medizin sehen nichts davon', async () => {
    for (const role of ['player', 'physio'] as const) {
      TestBed.resetTestingModule();
      const fixture = await render(role);
      expect(root(fixture).textContent).toContain('Den Messplan sehen nur Trainer.');
      expect(root(fixture).querySelector('li.row')).toBeNull();
      expect(firebase.calls).not.toContain('watchPlan');
    }
  });

  it('Pause speichern und wieder aufheben', async () => {
    const fixture = await render();
    await vi.waitFor(() => expect(root(fixture).querySelectorAll('li.row')).toHaveLength(2));
    button(row(fixture, 'Ali Adler'), 'pausieren').click();
    await vi.waitFor(() => expect(firebase.measurementPlan.plan['p1']).toEqual({ paused: true }));
    fixture.detectChanges();
    expect(row(fixture, 'Ali Adler').textContent).toContain('Pausiert');
    expect(root(fixture).querySelector('.summary')!.textContent).toContain('0 überfällig');
    button(row(fixture, 'Ali Adler'), 'fortsetzen').click();
    fixture.detectChanges();
    expect(row(fixture, 'Ali Adler').textContent).toContain('Fällig');
  });

  it('Messrunde: überspringen schreibt nichts, danach Abschluss', async () => {
    const fixture = await render();
    await vi.waitFor(() => expect(root(fixture).querySelectorAll('li.row')).toHaveLength(2));
    button(root(fixture), 'Messrunde starten (2)').click();
    fixture.detectChanges();
    const round = root(fixture).querySelector('[data-testid="round"]')!;
    expect(round.textContent).toContain('Spieler 1 von 2');
    expect(round.textContent).toContain('Ali Adler');
    button(round as HTMLElement, 'überspringen').click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('[data-testid="round"]')!.textContent).toContain('Ben Bauer');
    button(root(fixture).querySelector('[data-testid="round"]') as HTMLElement, 'überspringen').click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('[data-testid="round"]')!.textContent).toContain('0 gemessen, 2 übersprungen');
    expect(firebase.calls.filter((call) => call.startsWith('savePlayerRecord'))).toEqual([]);
    expect(firebase.records.playerRecords.get('p1/measurements')?.size).toBe(1);
    expect(firebase.records.playerRecords.get('p2/measurements')).toBeUndefined();
  });

  it('der Messplan steht in Sidebar und Mehr-Menü', () => {
    expect(SIDEBAR_ITEMS.map((item) => item.path)).toContain('/messplan');
    expect(MORE_GROUPS.flatMap((group) => group.items).map((item) => item.path)).toContain('/messplan');
  });
});
