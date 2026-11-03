import { TestBed } from '@angular/core/testing';
import { FileOutput } from '../../core/export/file-output';
import { clickByText, q, qa, renderProfile, settle, text } from './testing/profile-fixture';

const FOREIGN = 'Xy7Fremd0000Verein01';

describe('Profil: Einwilligung (SCRUM-245)', () => {
  it('zeigt Stand, Text zum Lesen und Drucken', async () => {
    const { fixture } = await renderProfile({ id: 'p1' });
    const panel = q(fixture, '#einwilligung');
    expect(panel).not.toBeNull();
    expect(text(panel)).toContain('dokumentiert am 01.09.2026');
    expect(text(q(fixture, '.consent details'))).toContain('Einwilligung in die Verarbeitung von Gesundheitsdaten');
    const print = vi.spyOn(TestBed.inject(FileOutput), 'print').mockImplementation(() => undefined);
    clickByText(fixture, '.consent button', 'Einwilligung drucken');
    expect(print).toHaveBeenCalledOnce();
    expect(print.mock.calls[0][0]).toContain('Jonas Keller');
    // Schon dokumentiert: kein Knopf zum Dokumentieren.
    expect(qa(fixture, '.consent button').map(text)).not.toContain('Einwilligung liegt vor – als dokumentiert eintragen');
  });

  it('als dokumentiert eintragen: erst nach Rückfrage, mit Datum und Konto', async () => {
    const { fixture, firebase } = await renderProfile({ id: 'p2' });
    clickByText(fixture, '.consent button', 'Einwilligung liegt vor – als dokumentiert eintragen');
    await settle(fixture);
    expect(firebase.players.players.get('p2')?.['consentStatus']).toBe('pending');
    clickByText(fixture, 'tk-dialog button', 'Ja, liegt vor');
    await vi.waitFor(() => expect(firebase.players.players.get('p2')?.['consentStatus']).toBe('granted'));
    expect(firebase.players.players.get('p2')).toMatchObject({ consentByUid: 'uid-trainer', consentBy: 'trainer@example.test' });
    await settle(fixture);
    expect(text(q(fixture, '#einwilligung'))).toContain('von trainer@example.test');
  });

  it('widerrufen: Aufgabe „prüfen und löschen“, gelöscht wird erst nach Bestätigung', async () => {
    const { fixture, firebase } = await renderProfile({
      id: 'p2',
      consent: 'revoked',
      setup: (fb) => {
        fb.players.players.set('p2', { ...fb.players.players.get('p2'), status: 'Angeschlagen' });
        fb.records.playerRecords.set('p2/absences', new Map([['ab1', { kind: 'injury', label: 'Verletzung', detail: 'Zerrung', from: '2026-01-01', to: '2026-01-10' }]]));
        fb.records.playerRecords.set('p2/measurements', new Map([['me1', { date: '2026-08-01', height: '150', weight: '40' }]]));
      },
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, '.task'))).toContain('1 Abwesenheit');
    });
    const task = text(q(fixture, '.task'));
    expect(task).toContain('Aufgabe: Gesundheitsdaten prüfen und löschen');
    expect(task).toContain('Status „Angeschlagen“');
    expect(task).toContain('1 Messwert');

    clickByText(fixture, '.task button', 'Alle löschen');
    await settle(fixture);
    // Nichts gelöscht, solange nicht bestätigt.
    expect(firebase.records.playerRecords.get('p2/absences')?.size).toBe(1);
    clickByText(fixture, 'tk-dialog button', 'Abbrechen');
    await settle(fixture);
    expect(firebase.records.playerRecords.get('p2/absences')?.size).toBe(1);

    clickByText(fixture, '.task button', 'Alle löschen');
    await settle(fixture);
    clickByText(fixture, 'tk-dialog button', 'Endgültig löschen');
    await vi.waitFor(() => expect(firebase.records.playerRecords.get('p2/absences')?.size ?? 0).toBe(0));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, '.task'))).not.toContain('Abwesenheit');
      expect(qa(fixture, 'tk-dialog button').map(text)).not.toContain('Bitte warten …');
    });

    clickByText(fixture, '.task button', 'Auf „Fit“ zurücksetzen');
    await settle(fixture);
    clickByText(fixture, 'tk-dialog button', 'Zurücksetzen');
    await vi.waitFor(() => expect(firebase.players.players.get('p2')?.['status']).toBe('Fit'));
    expect(firebase.records.playerRecords.get('p2/measurements')?.size).toBe(1);
  });

  it('eigenes Team, offen: keine Sperre, Einträge wie bisher', async () => {
    const { fixture } = await renderProfile({ id: 'p2' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.block')).not.toBeNull();
    });
    expect(q(fixture, '.lock')).toBeNull();
    expect(q(fixture, '.health-lock')).toBeNull();
    expect(qa(fixture, '.block-head button').map(text)).toEqual(expect.arrayContaining(['+ Eintrag', '+ Messung']));
  });

  it('fremder Verein ohne dokumentierte Einwilligung: Hinweis mit Sprung zur Einwilligung, kein „+ Eintrag“', async () => {
    const { fixture } = await renderProfile({ id: 'p2', team: FOREIGN });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.block')).not.toBeNull();
    });
    expect(text(q(fixture, '.lock'))).toContain('fehlt die dokumentierte Einwilligung');
    expect(text(q(fixture, '#einwilligung'))).toContain('offen – Gesundheitsdaten gesperrt');
    expect(text(q(fixture, '.health-lock'))).toContain('fehlt die dokumentierte Einwilligung');
    const labels = qa(fixture, '.block-head button').map(text);
    expect(labels).not.toContain('+ Eintrag');
    expect(labels).not.toContain('+ Messung');
    expect(labels).toContain('+ Förderplan');
    const target = q<HTMLElement>(fixture, '#einwilligung')!;
    target.scrollIntoView = vi.fn();
    clickByText(fixture, '.health-lock button', 'Zur Einwilligung');
    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it('fremder Verein mit dokumentierter Einwilligung: Einträge möglich', async () => {
    const { fixture } = await renderProfile({ id: 'p1', team: FOREIGN });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.block')).not.toBeNull();
    });
    expect(q(fixture, '.lock')).toBeNull();
    expect(qa(fixture, '.block-head button').map(text)).toContain('+ Eintrag');
  });
});
