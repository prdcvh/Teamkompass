import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FileOutput } from '../../core/export/file-output';
import { SessionService } from '../../core/auth/session.service';
import { LayoutService } from '../../core/shell/layout.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Events } from './events';
import { decodeCsv } from './schedule-import-dialog';

describe('Spielplan-Import (SCRUM-189)', () => {
  let firebase: FakeFirebase;
  const saved: { name: string; text: string }[] = [];

  async function render(role: 'trainer' | 'physio' = 'trainer', mobile = false) {
    firebase = new FakeFirebase();
    saved.length = 0;
    firebase.events.events.set('e2', { type: 'Spiel', title: 'Heimspiel', date: '2099-03-07', opponent: 'SV Nord', goalsFor: '', goalsAgainst: '' });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideFakeFirebase(firebase),
        { provide: LayoutService, useValue: { isMobile: signal(mobile) } },
        { provide: FileOutput, useValue: { saveText: (name: string, text: string) => saved.push({ name, text }), print: () => undefined } },
      ],
    });
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Events);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.filters')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const importButton = (fixture: { nativeElement: unknown }) => [...root(fixture).querySelectorAll<HTMLButtonElement>('button')].find((button) => text(button) === 'Spielplan importieren');

  async function chooseFile(fixture: Awaited<ReturnType<typeof render>>, content: string, name = 'plan.csv') {
    importButton(fixture)!.click();
    fixture.detectChanges();
    const input = root(fixture).querySelector<HTMLInputElement>('tk-schedule-import-dialog input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([content], name, { type: 'text/csv' })] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('[data-testid="import-summary"], [data-testid="import-file-error"]')).not.toBeNull();
    });
  }

  const header = 'Datum;Uhrzeit;Heim/Gast;Gegner;Ort';
  const rowsOf = (fixture: { nativeElement: unknown }) => [...root(fixture).querySelectorAll('tk-schedule-import-dialog .row')].map(text);
  const createButton = (fixture: { nativeElement: unknown }) => [...root(fixture).querySelectorAll<HTMLButtonElement>('tk-schedule-import-dialog button')].find((button) => /anlegen$/.test(text(button)))!;

  it('zeigt den Einstieg nur Trainern', async () => {
    expect(importButton(await render('trainer'))).toBeDefined();
    TestBed.resetTestingModule();
    const other = await render('physio');
    expect(importButton(other)).toBeUndefined();
    expect(root(other).querySelector('tk-schedule-import-dialog')).toBeNull();
  });

  it('bietet die Vorlage zum Herunterladen an', async () => {
    const fixture = await render();
    importButton(fixture)!.click();
    fixture.detectChanges();
    [...root(fixture).querySelectorAll<HTMLButtonElement>('tk-schedule-import-dialog button')].find((button) => text(button) === 'Vorlage herunterladen')!.click();
    expect(saved[0].name).toBe('spielplan-vorlage.csv');
    expect(saved[0].text).toContain('Datum;Uhrzeit;Heim/Gast;Gegner;Ort');
  });

  it('zeigt Vorschau mit Fehlern und Dubletten und legt bei Fehlern nichts an', async () => {
    const fixture = await render();
    await chooseFile(fixture, `${header}\n07.03.2099;11:00;Heim;SV Nord;Platz\n14.03.2099;11:00;Gast;FC Süd;\n14.03.2099;12:00;Gast;fc süd;\n21.03.2099;99:00;Heim;TSV Ost;\n`);
    expect(text(root(fixture).querySelector('[data-testid="import-summary"]'))).toContain('4 Zeilen – 1 neu, 2 Dubletten, 1 fehlerhaft');
    const rows = rowsOf(fixture);
    expect(rows[0]).toContain('Dublette');
    expect(rows[2]).toContain('Doppelt in der Datei');
    expect(rows[3]).toContain('Uhrzeit');
    expect(createButton(fixture).disabled).toBe(true);
    createButton(fixture).click();
    expect(firebase.calls.some((call) => call.startsWith('saveEventsBatch'))).toBe(false);
  });

  it('legt die neuen Spiele in einem Schritt an und überspringt Dubletten', async () => {
    const fixture = await render();
    await chooseFile(fixture, `﻿${header}\r\n07.03.2099;11:00;Heim;SV Nord;Platz\r\n14.03.2099;11:00;Gast;"FC ""Süd""";Sportplatz\r\n21.03.2099;;;<b>TSV</b>;\r\n`);
    expect(createButton(fixture).disabled).toBe(false);
    expect(text(createButton(fixture))).toBe('2 Spiele anlegen');
    createButton(fixture).click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('[data-testid="import-done"]')).not.toBeNull();
    });
    expect(firebase.calls.filter((call) => call.startsWith('saveEventsBatch'))).toEqual(['saveEventsBatch:2']);
    const created = [...firebase.events.events.values()].filter((data) => data['id'] !== undefined);
    expect(created.map((data) => [data['opponent'], data['startTime'], data['location'], data['type']])).toEqual([
      ['FC "Süd"', '11:00', 'Sportplatz', 'Spiel'],
      ['<b>TSV</b>', '', '', 'Spiel'],
    ]);
    // Gegnername bleibt Text und wird nicht als HTML ausgegeben.
    expect(root(fixture).querySelector('tk-schedule-import-dialog b')).toBeNull();
  });

  it('meldet unlesbare Dateien und lehnt zu große Pläne ab, ohne etwas anzulegen', async () => {
    const fixture = await render();
    await chooseFile(fixture, 'nur;irgendein;text\n1;2;3');
    expect(text(root(fixture).querySelector('[data-testid="import-file-error"]'))).toContain('Kopfzeile');
    const many = Array.from({ length: 451 }, (_, i) => `07.03.2099;11:00;Heim;Gegner ${i};`).join('\n');
    await chooseFile(fixture, `${header}\n${many}`);
    expect(text(root(fixture).querySelector('[data-testid="import-file-error"]'))).toContain('höchstens 450');
    expect(firebase.calls.some((call) => call.startsWith('saveEventsBatch'))).toBe(false);
  });

  it('liest Windows-1252-Dateien (Umlaute) ebenso wie UTF-8', () => {
    expect(decodeCsv(new Uint8Array([0x47, 0xe4, 0x73, 0x74]).buffer)).toBe('Gäst');
    expect(decodeCsv(new TextEncoder().encode('Gäst').buffer as ArrayBuffer)).toBe('Gäst');
  });
});
