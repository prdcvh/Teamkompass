import { TestBed } from '@angular/core/testing';
import { ProfileService } from '../profile/profile.service';
import { AbsencesService } from '../records/absences.service';
import { MeasurementsService } from '../records/measurements.service';
import { PlansService } from '../records/plans.service';
import { RecordsStateService } from '../records/records-state.service';
import { SessionService } from '../auth/session.service';
import { SquadService } from '../player/squad.service';
import { FakeFirebase, provideFakeFirebase } from './fake-firebase';

/**
 * Test-Aufbau für die Zusatzdaten eines Spielers (Förderpläne, Abwesenheiten, Messwerte): ein Spieler p1 mit je einem
 * Eintrag, drei Events (e2 schon bewertet), Kader und Profil geladen, Zusatzdaten für p1 gestartet und bereit.
 */
export async function setupRecords(role: 'trainer' | 'player' | 'medical' = 'trainer') {
  const firebase = new FakeFirebase();
  firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
  firebase.events.events.set('e1', { type: 'Training', title: 'Training Mo', date: '2026-10-05' });
  firebase.events.events.set('e2', { type: 'Training', title: 'Training Mi', date: '2026-10-07' });
  firebase.events.events.set('e3', { type: 'Training', title: 'Training Fr', date: '2026-10-20' });
  firebase.ratings.ratings.set('e2', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, grade: 2, playerId: 'p1' }]]));
  firebase.records.playerRecords.set('p1/developmentPlans', new Map([['dp1', { focus: 'Orientierung', goal: 'Blick', status: 'In Arbeit', createdAt: '2026-09-01', selfReflection: '' }]]));
  firebase.records.playerRecords.set('p1/absences', new Map([['ab1', { kind: 'absence', label: 'Schule', from: '2026-09-01', to: '2026-09-02' }]]));
  firebase.records.playerRecords.set('p1/measurements', new Map([['me1', { date: '2026-07-01', height: '150', weight: '40' }]]));
  TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
  const session = TestBed.inject(SessionService);
  session.role.set(role);
  if (role === 'player') session.playerId.set('p1');
  const squad = TestBed.inject(SquadService);
  squad.start();
  await vi.waitFor(() => expect(squad.load()).toBe('ready'));
  const profile = TestBed.inject(ProfileService);
  profile.start('p1');
  const state = TestBed.inject(RecordsStateService);
  state.start('p1');
  await vi.waitFor(() => {
    TestBed.tick();
    expect(state.ready()).toBe(true);
    expect(profile.loading()).toBe(false);
  });
  return {
    firebase,
    profile,
    state,
    plans: TestBed.inject(PlansService),
    absences: TestBed.inject(AbsencesService),
    measurements: TestBed.inject(MeasurementsService),
  };
}
