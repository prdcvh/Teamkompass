import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from '../app/app';
import { appConfig } from '../app/app.config';
import { eventFromDoc } from '../app/core/events/event';
import { AuthApi } from '../app/core/firebase/auth.api';
import { playerFromDoc } from '../app/core/player/player';
import { ratingFromDoc } from '../app/core/ratings/rating';
import { buildScoutProfiles } from '../app/core/scout/scout-profile';
import { FakeFirebase, provideFakeFirebase } from '../app/core/testing/fake-firebase';
import { WeatherProvider } from '../app/core/weather/weather-provider';

/** Festes Beispielwetter (kalt, Regen), damit Wetter und Kleidungsgrafik mitgemessen werden. */
class SampleWeatherProvider extends WeatherProvider {
  async fetchDay(_coords: unknown, date: string): Promise<unknown> {
    const time = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
    const all = (value: number) => time.map(() => value);
    return { hourly: { time, temperature_2m: all(3), apparent_temperature: all(-1), precipitation_probability: all(80), precipitation: all(1.2), wind_speed_10m: all(25), weather_code: all(63) } };
  }
}

/** Morgen (lokal) als `YYYY-MM-DD`: ein kommendes Training innerhalb des Vorhersagehorizonts. */
function tomorrow(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  fake.access.members.set('e2e-player', { role: 'player', playerId: 'p1' });
  // Medizin-Zugang und Scout-Zugang (SCRUM-170); „medical“ ist ein bisheriges Scout-Konto und wird zum Scout.
  fake.access.members.set('e2e-physio', { role: 'physio', playerId: null });
  fake.access.members.set('e2e-scout', { role: 'scout', playerId: null });
  names.forEach((name, i) => {
    fake.players.players.set(`p${i + 1}`, {
      name, positions: [['TW', 'IV', 'ZM', 'ST', 'LA'][i % 5]], number: i + 1, birthdate: '2012-05-05',
      status: ['Fit', 'Angeschlagen', 'Verletzt', 'Pause'][i % 4], ...(i === 4 ? { consentStatus: 'revoked' } : {}),
    });
  });
  fake.events.events.set('e1', { type: 'Training', title: 'Spiel in die Tiefe', date: '2026-10-13', intensity: 3, location: 'Sportplatz am Hang 1, Königstein im Taunus', startTime: '18:00', durationMinutes: 90 });
  fake.events.events.set('e2', { type: 'Spiel', title: 'Heimspiel gegen die SG Eintracht Oberursel-Steinbach', date: '2026-10-10', opponent: 'SG Oberursel', goalsFor: 3, goalsAgainst: 1, intensity: 3, location: 'Platz 1', matchDuration: 70 });
  fake.events.events.set('e3', { type: 'Training', title: 'Training', date: '2026-11-20', intensity: 2 });
  // Ohne gewählten Ort: Wetter für den Standardort Königstein (SCRUM-153).
  fake.events.events.set('e4', { type: 'Training', title: 'Abschlusstraining vor dem Derby', date: tomorrow(), intensity: 2, location: 'Kunstrasen - heim', startTime: '17:30', durationMinutes: 90 });
  // Künftige Termine der Serie s1 (SCRUM-147): einer bewertet, einer von Hand geändert.
  for (const date of ['2026-10-20', '2026-10-27', '2026-11-03']) {
    fake.events.events.set(`serie-s1-${date}`, { type: 'Training', title: 'Training', date, intensity: 2, location: 'Kunstrasen - heim', trainingFocus: 'Eigener Ballbesitz', startTime: '17:30', durationMinutes: 90, ...(date === '2026-11-03' ? { seriesEdited: true } : {}) });
  }
  // Pausen (SCRUM-148): ein unbewertetes Training der Serie s2 am 12.11. (fällt weg, wenn dort eine Pause angelegt wird).
  fake.events.events.set('serie-s2-2026-11-12', { type: 'Training', title: 'Torwart- und Athletiktraining im Wechsel', date: '2026-11-12', intensity: 3, location: 'Sporthalle am Hang mit sehr langem Namen', trainingFocus: 'Umschalten', startTime: '18:00', durationMinutes: 75 });
  fake.ratings.ratings.set('serie-s1-2026-10-27', new Map([['p1', { attendance: 'present', playerId: 'p1' }]]));
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
  // Laufende Abwesenheiten (SCRUM-164): der Kader zeigt dafür „Gesperrt“ / „Abwesend“ samt eigener Zähler.
  fake.records.playerRecords.set('p2/absences', new Map([['ab2', { kind: 'absence', label: 'Sperre', from: '2026-01-01', to: '2099-12-31' }]]));
  fake.records.playerRecords.set('p6/absences', new Map([['ab3', { kind: 'absence', label: 'Klassenfahrt', from: '2026-01-01', to: '2099-12-31' }]]));
  fake.records.playerRecords.set('p1/measurements', new Map([['me1', { date: '2026-07-01', height: '150', weight: '40' }], ['me2', { date: '2026-09-01', height: '152', weight: '41' }]]));
  fake.planning.doc = {
    series: {
      s1: { weekday: 2, startTime: '17:30', durationMinutes: 90, location: 'Kunstrasen - heim', locationCoords: null, title: '', trainingFocus: 'Eigener Ballbesitz', intensity: 2, startDate: '2026-10-20', endDate: '2027-03-30' },
      s2: { weekday: 4, startTime: '18:00', durationMinutes: 75, location: 'Sporthalle am Hang mit sehr langem Namen', locationCoords: null, title: 'Torwart- und Athletiktraining im Wechsel', trainingFocus: 'Umschalten', intensity: 3, startDate: '2026-10-22', endDate: '2027-03-25' },
    },
  };
  // Pausen liegen im eigenen, für alle Teammitglieder lesbaren Dokument meta/breaks (SCRUM-150).
  fake.planning.breaksDoc = {
    breaks: {
      b1: { name: 'Herbstferien', startDate: '2026-10-26', endDate: '2026-11-08' },
      b2: { name: 'Winterpause mit einem ziemlich langen Namen für die Listenansicht', startDate: '2026-12-21', endDate: '2027-01-09' },
    },
  };
  // Scout-Sicht (SCRUM-170) so, wie sie der Trainer-Client aus diesen Daten schreiben würde.
  const players = [...fake.players.players].map(([id, data]) => playerFromDoc(id, data));
  const events = [...fake.events.events].map(([id, data]) => eventFromDoc(id, data));
  const ratingsByEvent = new Map([...fake.ratings.ratings].map(([eventId, byPlayer]) => [eventId, new Map([...byPlayer].map(([playerId, data]) => [playerId, ratingFromDoc(data)]))]));
  for (const [id, doc] of buildScoutProfiles(players, events, ratingsByEvent)) fake.scout.profiles.set(id, JSON.parse(JSON.stringify(doc)) as Record<string, unknown>);
  return fake;
}

const fake = seed();

bootstrapApplication(App, {
  providers: [
    ...appConfig.providers,
    ...provideFakeFirebase(fake),
    { provide: WeatherProvider, useClass: SampleWeatherProvider },
    // Meldet nach dem Start der Anmeldeprüfung einen angemeldeten Trainer.
    provideAppInitializer(() => {
      inject(AuthApi);
      // ?as=player | physio | scout | medical | none wählt eine andere Rolle bzw. „nicht angemeldet“ (Anmeldeseite).
      const as = new URLSearchParams(location.search).get('as');
      const user =
        as === 'none' ? null
        : as === 'player' ? { uid: 'e2e-player', isAnonymous: true, email: null }
        : as === 'physio' ? { uid: 'e2e-physio', isAnonymous: false, email: 'physio@example.org' }
        : as === 'scout' || as === 'medical' ? { uid: 'e2e-scout', isAnonymous: false, email: 'scout@example.org' }
        : { uid: 'e2e-uid', isAnonymous: false, email: 'trainer@example.org' };
      setTimeout(() => fake.auth.emit(user), 0);
    }),
  ],
}).catch((err) => console.error(err));
