import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from '../app/app';
import { appConfig } from '../app/app.config';
import { AuthApi } from '../app/core/firebase/auth.api';
import { FakeFirebase, provideFakeFirebase } from '../app/core/testing/fake-firebase';

/**
 * Nur für den Build `-c e2e` (Playwright-Test der Bildschirmbreite, SCRUM-134): dieselbe App, aber mit
 * Firebase-Attrappen und Beispieldaten statt echter Verbindung. Wird nie veröffentlicht (nicht in build:teams).
 */
const names = [
  'Jonas Keller', 'Elias Wagner', 'Maximilian Alexander von Hohenzollern-Sigmaringen', 'Jan Braun', 'Noah Becker', 'Luca Schneider',
  'Finn Hoffmann', 'Ben Schäfer', 'Paul Koch', 'Leon Bauer', 'Felix Richter', 'Tim Klein', 'Moritz Wolf', 'David Neumann',
];

function seed(): FakeFirebase {
  const fake = new FakeFirebase();
  fake.access.members.set('e2e-uid', { role: 'trainer', playerId: null });
  names.forEach((name, i) => {
    fake.players.players.set(`p${i + 1}`, {
      name, positions: [['TW', 'IV', 'ZM', 'ST', 'LA'][i % 5]], number: i + 1, birthdate: '2012-05-05',
      status: ['Fit', 'Angeschlagen', 'Verletzt', 'Pause'][i % 4], ...(i === 4 ? { consentStatus: 'revoked' } : {}),
    });
  });
  fake.events.events.set('e1', { type: 'Training', title: 'Spiel in die Tiefe', date: '2026-10-13', intensity: 3, location: 'Sportplatz am Hang 1, Königstein im Taunus', startTime: '18:00', durationMinutes: 90 });
  fake.events.events.set('e2', { type: 'Spiel', title: 'Heimspiel gegen die SG Eintracht Oberursel-Steinbach', date: '2026-10-10', opponent: 'SG Oberursel', goalsFor: 3, goalsAgainst: 1, intensity: 3, location: 'Platz 1', matchDuration: 70 });
  fake.events.events.set('e3', { type: 'Training', title: 'Training', date: '2026-11-20', intensity: 2 });
  const ratings = new Map<string, Record<string, unknown>>();
  const attendances = ['present', 'absent', 'excused', 'late'];
  names.forEach((_, i) => ratings.set(`p${i + 1}`, { attendance: attendances[i % 4], effort: 2, technique: 3, tactics: 2, comprehension: 4, grade: 2.8, note: 'Gute Einstellung im Training, weiter so', playerId: `p${i + 1}` }));
  fake.ratings.ratings.set('e1', ratings);
  fake.ratings.ratings.set('e2', new Map(ratings));
  fake.ratings.privateNotes.set('e1', new Map([['p1', { playerId: 'p1', note: 'Vertraulich' }]]));
  fake.opponents.opponents.set('o1', {
    name: 'SG Eintracht Oberursel-Steinbach', formation: '4-2-3-1', style: 'Pressing', strengths: 'Sehr schnelle Außenspieler und viel Tempo über außen',
    weaknesses: 'Anfällig bei hohen Bällen hinter die Kette', keyPlayers: 'Nr. 10 Linksfuß', setPieces: 'Kurze Ecken', gamePlan: 'Tief stehen und umschalten', notes: 'Trainer wechselt oft', updatedAt: '2026-10-01',
  });
  fake.lineup.lineup = { assignments: { TW: ['p1'], IV: ['p2', 'p3'] }, byEvent: { e2: { assignments: { TW: ['p1'], IV: ['p2', 'p3'] }, savedAt: '2026-10-09T10:00:00.000Z' } } };
  fake.records.playerRecords.set('p1/developmentPlans', new Map([['dp1', { focus: 'Orientierung und Blickverhalten vor der Ballannahme', goal: 'Blick', status: 'In Arbeit', createdAt: '2026-09-01', selfReflection: '' }]]));
  fake.records.playerRecords.set('p1/absences', new Map([['ab1', { kind: 'absence', label: 'Schule', from: '2026-09-01', to: '2026-09-02' }]]));
  fake.records.playerRecords.set('p1/measurements', new Map([['me1', { date: '2026-07-01', height: '150', weight: '40' }], ['me2', { date: '2026-09-01', height: '152', weight: '41' }]]));
  return fake;
}

const fake = seed();

bootstrapApplication(App, {
  providers: [
    ...appConfig.providers,
    ...provideFakeFirebase(fake),
    // Meldet nach dem Start der Anmeldeprüfung einen angemeldeten Trainer.
    provideAppInitializer(() => {
      inject(AuthApi);
      setTimeout(() => fake.auth.emit({ uid: 'e2e-uid', isAnonymous: false, email: 'trainer@example.org' }), 0);
    }),
  ],
}).catch((err) => console.error(err));
