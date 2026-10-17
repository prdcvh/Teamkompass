import { TestBed } from '@angular/core/testing';
import type { FakeFirebase } from '../testing/fake-firebase';
import { setupRecords } from '../testing/records-setup';
import { emptyAbsenceDraft } from './absence';

describe('AbsencesService (SCRUM-18)', () => {
  let firebase: FakeFirebase;

  async function setup(role?: 'trainer' | 'player' | 'medical') {
    const context = await setupRecords(role);
    firebase = context.firebase;
    return context;
  }

  const absenceDraft = (overrides = {}) => ({ ...emptyAbsenceDraft(), reason: 'Urlaub', from: '2026-10-04', to: '2026-10-10', ...overrides });

  it('belegt Events im Zeitraum vor, die noch unbearbeitet sind, und lässt bewertete in Ruhe', async () => {
    const { absences } = await setup();
    expect(absences.saveAbsence(absenceDraft())).toEqual({});
    await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'absent', autoAbsence: true, note: 'Urlaub (bis 10.10.2026)' }));
    expect(firebase.ratings.ratings.get('e2')?.get('p1')).toMatchObject({ attendance: 'present', effort: 2 }); // schon bewertet
    expect(firebase.ratings.ratings.get('e3')?.get('p1')).toBeUndefined(); // außerhalb des Zeitraums
    expect(firebase.records.playerRecords.get('p1/absences')?.size).toBe(2);
  });

  it('verkürzt: setzt automatisch gesetzte Einträge zurück, die nicht mehr abgedeckt sind', async () => {
    const { absences, profile } = await setup();
    absences.saveAbsence(absenceDraft());
    await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p1')?.['autoAbsence']).toBe(true));
    await vi.waitFor(() => {
      TestBed.tick();
      expect(profile.items().find((item) => item.event.id === 'e1')?.rating?.autoAbsence).toBe(true);
    });
    const id = absences.absences().find((absence) => absence.label === 'Urlaub')!.id;
    absences.saveAbsence({ ...absenceDraft(), id, from: '2026-10-06', to: '2026-10-10' }); // e1 (05.10.) liegt jetzt davor
    await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'open', autoAbsence: false, note: '' }));
  });

  it('gelöscht: setzt automatisch gesetzte Einträge zurück, handgesetzte bleiben', async () => {
    const { absences, profile } = await setup();
    absences.saveAbsence(absenceDraft({ from: '2026-10-01', to: '2026-10-10' }));
    await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p1')?.['autoAbsence']).toBe(true));
    await vi.waitFor(() => {
      TestBed.tick();
      expect(profile.items().find((item) => item.event.id === 'e1')?.rating?.autoAbsence).toBe(true);
    });
    const id = absences.absences().find((absence) => absence.label === 'Urlaub')!.id;
    expect(await absences.deleteAbsence(id)).toBe(true);
    await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'open', autoAbsence: false }));
    expect(firebase.ratings.ratings.get('e2')?.get('p1')).toMatchObject({ attendance: 'present', effort: 2 });
  });

  it('prüft Eingaben (offenes Ende nur bei Verletzung)', async () => {
    const { absences } = await setup();
    expect(absences.saveAbsence(absenceDraft({ to: '' })).to).toBeTruthy();
    expect(absences.saveAbsence(absenceDraft({ reason: 'Verletzung', to: '', detail: 'Zerrung' }))).toEqual({});
    await vi.waitFor(() => expect(firebase.ratings.ratings.get('e3')?.get('p1')).toMatchObject({ attendance: 'absent', note: 'Verletzung · Zerrung (Ende offen)' }));
  });

  it('gleicht auch ab, solange die Bewertungen des Profils noch laden (SCRUM-164), ohne Bewertetes zu überschreiben', async () => {
    const { absences, profile } = await setup();
    profile.stop(); // Profil lädt (noch) nicht: früher brach der Abgleich hier stillschweigend ab
    expect(profile.loading() || profile.playerId() !== 'p1').toBe(true);
    expect(absences.saveAbsence(absenceDraft({ reason: 'Verletzung', detail: 'Bänderriss', from: '2026-10-01', to: '' }))).toEqual({});
    await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'absent', autoAbsence: true, note: 'Verletzung · Bänderriss (Ende offen)' }));
    await vi.waitFor(() => expect(firebase.ratings.ratings.get('e3')?.get('p1')).toMatchObject({ attendance: 'absent', autoAbsence: true }));
    expect(firebase.ratings.ratings.get('e2')?.get('p1')).toMatchObject({ attendance: 'present', effort: 2 }); // von Hand bewertet (SCRUM-18)
    expect(firebase.calls).toContain('readRatingDoc:e2:p1'); // liest die Bewertung vorher, statt blind zu schreiben
  });

  it('gelöscht, während das Profil noch lädt: setzt automatisch gesetzte Einträge trotzdem zurück', async () => {
    const { absences, profile } = await setup();
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'absent', autoAbsence: true, note: 'Urlaub (bis 10.10.2026)', playerId: 'p1' }]]));
    profile.stop();
    expect(await absences.reconcileAbsences('p1', [])).toBe(1);
    expect(firebase.ratings.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'open', autoAbsence: false, note: '' });
  });
});
