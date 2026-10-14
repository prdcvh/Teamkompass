import { TestBed } from '@angular/core/testing';
import { FileOutput } from '../../core/export/file-output';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { WorkspaceService } from '../../core/device/workspace.service';
import { Export } from './export';

describe('Export (Daten exportieren)', () => {
  let firebase: FakeFirebase;
  let saved: { name: string; text: string }[];
  let printed: string[];

  async function render(role: 'trainer' | 'player' = 'trainer', consent2 = 'granted') {
    firebase = new FakeFirebase();
    saved = [];
    printed = [];
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-02-05', status: 'Fit', consentStatus: 'granted' });
    firebase.players.players.set('p2', { name: '<b>Ben</b>', positions: ['IV'], number: 4, birthdate: '2012-11-06', status: 'Fit', consentStatus: consent2 });
    firebase.events.events.set('e1', { type: 'Spiel', title: 'Spiel gegen Eppstein', date: '2026-09-01', goalsFor: 3, goalsAgainst: 1, intensity: 3 });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, playerId: 'p1' }]]));
    firebase.opponents.opponents.set('o1', { name: 'SG Eppstein', formation: '4-4-2', style: 'Pressing', updatedAt: '2026-10-01' });
    firebase.records.playerRecords.set('p1/developmentPlans', new Map([['f1', { focus: 'Kopfball', goal: 'Mehr Kopfballtore', status: 'Offen' }]]));
    TestBed.configureTestingModule({
      providers: [
        ...provideFakeFirebase(firebase),
        { provide: FileOutput, useValue: { saveText: (name: string, text: string) => saved.push({ name, text }), print: (html: string) => printed.push(html) } },
      ],
    });
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Export);
    await fixture.whenStable();
    if (role === 'trainer') {
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(buttons(fixture).length).toBeGreaterThan(0);
      });
    } else {
      fixture.detectChanges();
    }
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const buttons = (fixture: { nativeElement: unknown }) => [...root(fixture).querySelectorAll<HTMLButtonElement>('tk-card button')];
  const byText = (fixture: { nativeElement: unknown }, label: string) =>
    [...root(fixture).querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes(label));
  const settle = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('lädt die Sicherung als JSON mit allen Daten und vermerkt den Export', async () => {
    const fixture = await render();
    byText(fixture, 'Sicherung herunterladen')!.click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toMatch(/^teamkompass-export-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(saved[0].text);
    expect(data.app).toBe('TeamKompass');
    expect(data.players.map((p: { name: string }) => p.name)).toEqual(['Ali Adler', '<b>Ben</b>']);
    expect(data.events[0].ratings.p1.attendance).toBe('present');
    expect(data.developmentPlans.p1[0].focus).toBe('Kopfball');
    expect(data.opponents[0].name).toBe('SG Eppstein');
    expect(TestBed.inject(WorkspaceService).activity()[0].action).toBe('Teamdaten als JSON exportiert');
    await settle(fixture);
    expect(root(fixture).textContent).toContain('Die Sicherung wurde heruntergeladen.');
  });

  it('warnt vor dem Export, wenn eine Einwilligung widerrufen ist, und exportiert erst nach Bestätigung', async () => {
    const fixture = await render('trainer', 'revoked');
    byText(fixture, 'Sicherung herunterladen')!.click();
    await settle(fixture);
    expect(saved).toHaveLength(0);
    const dialog = root(fixture).querySelector('tk-dialog')!;
    expect(dialog.textContent).toContain('<b>Ben</b>');
    expect(dialog.textContent).toContain('widerrufen');
    byText(fixture, 'Trotzdem exportieren')!.click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
  });

  it('bricht ab, wenn die Warnung abgelehnt wird', async () => {
    const fixture = await render('trainer', 'revoked');
    byText(fixture, 'Sicherung herunterladen')!.click();
    await settle(fixture);
    byText(fixture, 'Abbrechen')!.click();
    await settle(fixture);
    expect(saved).toHaveLength(0);
  });

  it('öffnet den Druckdialog mit dem maskierten Bericht des gewählten Spielers', async () => {
    const fixture = await render();
    const select = root(fixture).querySelector('select') as HTMLSelectElement;
    select.value = 'p2';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    byText(fixture, 'Bericht erstellen')!.click();
    await settle(fixture);
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain('&lt;b&gt;Ben&lt;/b&gt;');
    expect(printed[0]).not.toContain('<b>Ben</b>');
  });

  it('warnt auch beim PDF nur für den gewählten Spieler', async () => {
    const fixture = await render('trainer', 'revoked');
    byText(fixture, 'Bericht erstellen')!.click(); // erster Spieler: Einwilligung ok
    await settle(fixture);
    expect(printed).toHaveLength(1);
    const select = root(fixture).querySelector('select') as HTMLSelectElement;
    select.value = 'p2';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    byText(fixture, 'Bericht erstellen')!.click();
    await settle(fixture);
    expect(printed).toHaveLength(1);
    expect(root(fixture).querySelector('tk-dialog')!.textContent).toContain('widerrufen');
  });

  it('meldet einen Fehler beim Export und lädt nichts herunter', async () => {
    const fixture = await render();
    firebase.records.readPlayerRecordsError = new Error('offline');
    byText(fixture, 'Sicherung herunterladen')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('Export hat nicht geklappt');
    });
    expect(saved).toHaveLength(0);
  });

  it('ist für Nicht-Trainer nicht verfügbar', async () => {
    const fixture = await render('player');
    expect(root(fixture).textContent).toContain('nur für Trainer');
    expect(buttons(fixture)).toHaveLength(0);
  });
});
