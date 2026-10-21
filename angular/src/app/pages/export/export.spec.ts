import { TestBed } from '@angular/core/testing';
import { BackupApi, type WriteOperation } from '../../core/firebase/backup.api';
import { FileOutput } from '../../core/export/file-output';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { WorkspaceService } from '../../core/device/workspace.service';
import { Export } from './export';

describe('Export (Daten exportieren)', () => {
  let firebase: FakeFirebase;
  let saved: { name: string; text: string }[];
  let printed: string[];
  let writes: WriteOperation[][];
  let writeError: unknown;

  async function render(role: 'trainer' | 'player' = 'trainer', consent2 = 'granted') {
    firebase = new FakeFirebase();
    saved = [];
    printed = [];
    writes = [];
    writeError = null;
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-02-05', status: 'Fit', consentStatus: 'granted' });
    firebase.players.players.set('p2', { name: '<b>Ben</b>', positions: ['IV'], number: 4, birthdate: '2012-11-06', status: 'Fit', consentStatus: consent2 });
    firebase.events.events.set('e1', { type: 'Spiel', title: 'Spiel gegen Eppstein', date: '2026-09-01', goalsFor: 3, goalsAgainst: 1, intensity: 3 });
    // SCRUM-199: Die Eventliste lädt sonst nur die laufende Saison; Export/Sicherung müssen trotzdem alle Saisons enthalten.
    firebase.events.filterByDate = true;
    firebase.events.events.set('alt', { type: 'Training', title: 'Training alte Saison', date: '2001-05-01', intensity: 1 });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, playerId: 'p1' }]]));
    firebase.opponents.opponents.set('o1', { name: 'SG Eppstein', formation: '4-4-2', style: 'Pressing', updatedAt: '2026-10-01' });
    firebase.records.playerRecords.set('p1/developmentPlans', new Map([['f1', { focus: 'Kopfball', goal: 'Mehr Kopfballtore', status: 'Offen' }]]));
    TestBed.configureTestingModule({
      providers: [
        ...provideFakeFirebase(firebase),
        {
          provide: BackupApi,
          useValue: {
            writeAll: async (ops: WriteOperation[]) => {
              if (writeError) throw writeError;
              writes.push(ops);
            },
          },
        },
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
    expect(data.events.find((e: { title: string }) => e.title === 'Spiel gegen Eppstein').ratings.p1.attendance).toBe('present');
    expect(data.developmentPlans.p1[0].focus).toBe('Kopfball');
    expect(data.opponents[0].name).toBe('SG Eppstein');
    expect(TestBed.inject(WorkspaceService).activity()[0].action).toBe('Teamdaten als JSON exportiert');
    await settle(fixture);
    expect(root(fixture).textContent).toContain('Die Sicherung wurde heruntergeladen.');
  });

  it('SCRUM-199: die Sicherung enthält auch Events aus älteren Saisons', async () => {
    const fixture = await render();
    expect(firebase.events.lastFromDate).toBeNull();
    byText(fixture, 'Sicherung herunterladen')!.click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    const titles = JSON.parse(saved[0].text).events.map((e: { title: string }) => e.title);
    expect(titles).toContain('Training alte Saison');
    expect(titles).toContain('Spiel gegen Eppstein');
    fixture.destroy();
    await vi.waitFor(() => expect(firebase.events.lastFromDate).toMatch(/^\d{4}-07-01$/));
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

  it('markiert den gewählten Spieler in der Auswahl und deaktiviert Bericht ohne Spieler nicht fälschlich', async () => {
    const fixture = await render();
    const select = root(fixture).querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('p1');
    select.value = 'p2';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(select.value).toBe('p2');
    expect(byText(fixture, 'Bericht erstellen')!.disabled).toBe(false);
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

  const choose = async (fixture: { nativeElement: unknown; detectChanges: () => void; whenStable: () => Promise<unknown> }, content: string, name = 'sicherung.json') => {
    const input = root(fixture).querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [{ name, size: content.length, text: async () => content }], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('[role="alert"]') ?? root(fixture).querySelector('.backup-dialog li')).toBeTruthy();
    });
  };
  const dialogButton = (fixture: { nativeElement: unknown }, label: string) =>
    [...root(fixture).querySelectorAll<HTMLButtonElement>('.backup-dialog button')].find((button) => button.textContent?.trim() === label)!;
  const backupFile = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      players: [{ id: 'p1', name: 'Ali Neu', positions: ['ST'], number: 9 }, { id: 'p9', name: 'Neuer Spieler', positions: ['TW'], number: 1 }],
      events: [{ id: 'e1', type: 'Training', title: 'Neu', date: '2026-09-01', ratings: { p1: { attendance: 'present', effort: 1 } }, privateNotes: { p1: 'intern' } }],
      developmentPlans: { p1: [{ id: 'f1', focus: 'Kopfball neu' }, { id: 'f2', focus: 'Neu' }] },
      ...extra,
    });

  it('Sicherung einspielen: zeigt erst die Zusammenfassung und schreibt nichts vor der Bestätigung', async () => {
    const fixture = await render();
    await choose(fixture, backupFile());
    const dialog = root(fixture).querySelector('.backup-dialog')!;
    expect(dialog.textContent).toContain('Spieler: 1 neu, 1 werden aktualisiert');
    expect(dialog.textContent).toContain('Events: 0 neu, 1 werden aktualisiert');
    expect(dialog.textContent).toContain('Förderpläne: 1 neu, 1 werden aktualisiert');
    expect(dialog.textContent).toContain('Nichts wird gelöscht');
    expect(dialog.textContent).toContain('überschrieben');
    expect(writes).toHaveLength(0);
  });

  it('Sicherung einspielen: schreibt nach der Bestätigung genau die Dokumente der Datei und vermerkt es', async () => {
    const fixture = await render();
    await choose(fixture, backupFile());
    dialogButton(fixture, 'Sicherung einspielen').click();
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    const paths = writes[0].map((op) => op.path.join('/'));
    expect(paths).toContain('players/p9');
    expect(paths).toContain('events/e1/privateNotes/p1');
    expect(paths).toContain('players/p1/developmentPlans/f2');
    expect(paths.every((path) => !path.startsWith('players/p2') && !path.startsWith('opponents'))).toBe(true);
    expect(TestBed.inject(WorkspaceService).activity()[0].action).toContain('Sicherung eingespielt');
    await settle(fixture);
    expect(root(fixture).textContent).toContain('Die Sicherung wurde eingespielt');
  });

  it('Sicherung einspielen: Abbrechen schreibt nichts', async () => {
    const fixture = await render();
    await choose(fixture, backupFile());
    dialogButton(fixture, 'Abbrechen').click();
    await settle(fixture);
    expect(writes).toHaveLength(0);
  });

  it('Sicherung einspielen: eine falsche Datei wird abgelehnt und ändert nichts', async () => {
    const fixture = await render();
    await choose(fixture, JSON.stringify({ players: [], events: [] }));
    expect(root(fixture).querySelector('[role="alert"]')!.textContent).toContain('keine Spieler');
    await choose(fixture, 'kein json');
    expect(root(fixture).querySelector('[role="alert"]')!.textContent).toContain('nicht gelesen');
    expect(writes).toHaveLength(0);
  });

  it('Sicherung einspielen: meldet einen Schreibfehler', async () => {
    const fixture = await render();
    writeError = new Error('offline');
    await choose(fixture, backupFile());
    dialogButton(fixture, 'Sicherung einspielen').click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('nicht vollständig eingespielt');
    });
  });

  it('Sicherung einspielen: für Nicht-Trainer gibt es keine Dateiauswahl', async () => {
    const fixture = await render('player');
    expect(root(fixture).querySelector('input[type="file"]')).toBeNull();
  });

  it('ist für Nicht-Trainer nicht verfügbar', async () => {
    const fixture = await render('player');
    expect(root(fixture).textContent).toContain('nur für Trainer');
    expect(buttons(fixture)).toHaveLength(0);
  });
});
