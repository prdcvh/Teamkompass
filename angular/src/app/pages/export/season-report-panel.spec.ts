import { TestBed } from '@angular/core/testing';
import { FileOutput } from '../../core/export/file-output';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { WorkspaceService } from '../../core/device/workspace.service';
import { Export } from './export';

describe('Saisonbericht (SCRUM-196)', () => {
  let firebase: FakeFirebase;
  let printed: string[];

  async function render(consent2 = 'granted') {
    firebase = new FakeFirebase();
    printed = [];
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-02-05', status: 'Fit', consentStatus: 'granted' });
    firebase.players.players.set('p2', { name: '<b>Ben</b>', positions: ['IV'], number: 4, birthdate: '2012-11-06', status: 'Fit', consentStatus: consent2 });
    firebase.events.events.set('e1', { type: 'Spiel', title: 'Spiel gegen Eppstein', date: '2026-09-01', goalsFor: 3, goalsAgainst: 1, intensity: 3 });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, playerId: 'p1' }]]));
    TestBed.configureTestingModule({
      providers: [...provideFakeFirebase(firebase), { provide: FileOutput, useValue: { saveText: () => undefined, print: (html: string) => printed.push(html) } }],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Export);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(byText(fixture, 'Saisonbericht zusammenstellen')).toBeDefined();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const byText = (fixture: { nativeElement: unknown }, label: string) =>
    [...root(fixture).querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes(label));
  const settle = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function openSeason(fixture: Awaited<ReturnType<typeof render>>) {
    byText(fixture, 'Saisonbericht zusammenstellen')!.click();
    await settle(fixture);
  }
  const field = <T extends HTMLElement>(fixture: { nativeElement: unknown }, name: string) => root(fixture).querySelector(`[name="${name}"]`) as T;
  const submit = async (fixture: Awaited<ReturnType<typeof render>>) => {
    const button = [...root(fixture).querySelectorAll<HTMLButtonElement>('tk-season-report-panel button[type="submit"]')][0];
    button.click();
    await settle(fixture);
  };

  it('erstellt den Bericht eines Spielers mit Kommentar, ohne Gesundheitsdaten (Standard)', async () => {
    const fixture = await render();
    firebase.records.playerRecords.set('p1/absences', new Map([['a1', { kind: 'injury', label: 'Verletzung', detail: 'Zerrung', from: '2026-08-01', to: '2026-08-05', playerId: 'p1' }]]));
    await openSeason(fixture);
    expect(field<HTMLInputElement>(fixture, 'health').checked).toBe(false);
    const comment = field<HTMLTextAreaElement>(fixture, 'comment');
    comment.value = 'Starke <Saison>';
    comment.dispatchEvent(new Event('input'));
    field<HTMLSelectElement>(fixture, 'period').value = 'custom';
    field<HTMLSelectElement>(fixture, 'period').dispatchEvent(new Event('change'));
    await settle(fixture);
    field<HTMLInputElement>(fixture, 'from').value = '2026-08-01';
    field<HTMLInputElement>(fixture, 'from').dispatchEvent(new Event('input'));
    await submit(fixture);
    await vi.waitFor(() => expect(printed).toHaveLength(1));
    expect(printed[0]).toContain('Ali Adler');
    expect(printed[0]).not.toContain('Ben');
    expect(printed[0]).toContain('Starke &lt;Saison&gt;');
    expect(printed[0]).not.toContain('Zerrung');
    expect(TestBed.inject(WorkspaceService).activity()[0].action).toContain('Saisonbericht');
  });

  it('nimmt Gesundheitsdaten nur mit Häkchen auf', async () => {
    const fixture = await render();
    firebase.records.playerRecords.set('p1/absences', new Map([['a1', { kind: 'injury', label: 'Verletzung', detail: 'Zerrung', from: '2026-08-01', to: '2026-08-05', playerId: 'p1' }]]));
    await openSeason(fixture);
    field<HTMLSelectElement>(fixture, 'period').value = 'custom';
    field<HTMLSelectElement>(fixture, 'period').dispatchEvent(new Event('change'));
    await settle(fixture);
    field<HTMLInputElement>(fixture, 'from').value = '2026-08-01';
    field<HTMLInputElement>(fixture, 'from').dispatchEvent(new Event('input'));
    field<HTMLInputElement>(fixture, 'health').click();
    await submit(fixture);
    await vi.waitFor(() => expect(printed).toHaveLength(1));
    expect(printed[0]).toContain('Zerrung');
  });

  it('erstellt einen Bericht für alle Spieler des Teams in einem Dokument', async () => {
    const fixture = await render();
    await openSeason(fixture);
    field<HTMLSelectElement>(fixture, 'scope').value = 'all';
    field<HTMLSelectElement>(fixture, 'scope').dispatchEvent(new Event('change'));
    await settle(fixture);
    await submit(fixture);
    await vi.waitFor(() => expect(printed).toHaveLength(1));
    expect(printed[0].match(/<section class="player">/g)).toHaveLength(2);
    expect(printed[0]).toContain('Ali Adler');
    expect(printed[0]).toContain('&lt;b&gt;Ben&lt;/b&gt;');
  });

  it('warnt bei widerrufener Einwilligung und erstellt erst nach Bestätigung', async () => {
    const fixture = await render('revoked');
    await openSeason(fixture);
    field<HTMLSelectElement>(fixture, 'scope').value = 'all';
    field<HTMLSelectElement>(fixture, 'scope').dispatchEvent(new Event('change'));
    await settle(fixture);
    await submit(fixture);
    expect(printed).toHaveLength(0);
    expect(root(fixture).querySelector('tk-season-report-panel [role="alert"]')!.textContent).toContain('widerrufen');
    await submit(fixture);
    await vi.waitFor(() => expect(printed).toHaveLength(1));
  });

  it('meldet einen ungültigen Zeitraum', async () => {
    const fixture = await render();
    await openSeason(fixture);
    field<HTMLSelectElement>(fixture, 'period').value = 'custom';
    field<HTMLSelectElement>(fixture, 'period').dispatchEvent(new Event('change'));
    await settle(fixture);
    await submit(fixture);
    expect(printed).toHaveLength(0);
    expect(root(fixture).querySelector('tk-season-report-panel [role="alert"]')!.textContent).toContain('Zeitraum');
  });
});
