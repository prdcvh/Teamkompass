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
      status: ['Fit', 'Angeschlagen', 'Verletzt', 'Pause'][i % 4], consentStatus: i === 4 ? 'revoked' : 'pending',
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
  // Zu-/Absagen (SCRUM-205) zum Training morgen: eine Absage der Eltern mit langem Grund, eine Zusage.
  fake.rsvp.set('e4', 'p2', { playerId: 'p2', status: 'no', reason: 'Familienfeier bei den Großeltern in Norddeutschland, wir sind erst Sonntag zurück', by: 'parent' });
  fake.rsvp.set('e4', 'p3', { playerId: 'p3', status: 'yes', reason: '', by: 'player' });
  // Anstrengung und Befinden (SCRUM-138): Spieler p1 (Einwilligung dokumentiert) war gestern beim Training – die Frage ist
  // offen; zu drei früheren Terminen gibt es schon Angaben (eine deutlich härter als der Trainerwert).
  fake.players.players.set('p1', { ...fake.players.players.get('p1'), consentStatus: 'granted' });
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  const yesterdayIso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  fake.events.events.set('gestern', { type: 'Training', title: 'Training gestern', date: yesterdayIso, exertion: 4, location: 'Kunstrasen - heim', startTime: '17:30', durationMinutes: 90 });
  fake.ratings.ratings.set('gestern', new Map([['p1', { attendance: 'present', playerId: 'p1' }]]));
  for (const [eventId, date, exertion, wellness] of [['e1', '2026-10-13', 7, [4, 3, 3, 4]], ['e2', '2026-10-10', 9, [5, 5, 3, 4]], ['serie-s1-2026-10-27', '2026-10-27', 6, [6, 5, 6, 5]]] as const) {
    fake.selfReports.set('p1', 'selfReports', eventId, { playerId: 'p1', eventId, date, exertion, by: 'player', updatedAt: null });
    fake.selfReports.set('p1', 'wellness', eventId, { playerId: 'p1', eventId, date, fatigue: wellness[0], sleep: wellness[1], soreness: wellness[2], stress: wellness[3], by: 'player', updatedAt: null });
  }
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
  // Wissen (SCRUM-106): Links und Glossar im Trainer-Dokument; mit langen Titeln/Adressen für den Breitentest.
  fake.knowledge.doc = {
    knowledge: {
      k1: { type: 'link', title: 'Pressing im Mittelfeld: Auslöser, Staffelung und Absicherung bei Ballverlust', url: 'https://www.youtube.com/watch?v=abcdefghijk&list=PLabcdefghijklmnopqrstuvwxyz0123456789', description: 'Zwölf Minuten, die zeigen, wie wir gemeinsam anlaufen. Bitte bis zum Training am Dienstag ansehen.', category: 'Taktik' },
      k2: { type: 'link', title: 'Spielsystem 4-2-3-1 (PDF)', url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing', description: '', category: 'Taktik' },
      k3: { type: 'glossary', title: 'Abseitsfalle', url: null, description: 'Die Abwehrkette rückt gemeinsam nach vorn, sobald der Gegner den Pass spielt. Der Stürmer steht dadurch im Abseits.', category: 'Regeln' },
      k4: { type: 'glossary', title: 'Gegenpressing', url: 'https://de.wikipedia.org/wiki/Gegenpressing', description: 'Sofort nach dem Ballverlust den Ball zurückerobern, statt sich zurückfallen zu lassen.', category: 'Taktik' },
      k5: { type: 'link', title: 'Dehnübungen nach dem Spiel', url: 'https://www.dfb.de/trainer/', description: 'Kurzes Programm für zu Hause.', category: 'Fitness' },
    },
  };
  // Lernpfade (SCRUM-192): ein Torwart-Pfad (p1 ist Torwart, zwei Stufen bestätigt) und ein Pfad für alle Positionen.
  fake.learning.paths.set('lp1', {
    title: 'Torwart: sicher fangen und abwerfen', position: 'TW', ageGroup: 'U14',
    levels: [
      { id: 'l1', title: 'Grundstellung und Fangen in Brusthöhe', unit: 'Partner wirft 20 Bälle in Brusthöhe, Hände bilden ein W.', minutes: 3, url: null, homeTask: 'Ball 50-mal gegen die Wand werfen und fangen.' },
      { id: 'l2', title: 'Flache Bälle aufnehmen', unit: 'Flache Bälle seitlich, Knie ab, Ball an den Körper ziehen.', minutes: 4, url: 'https://www.dfb.de/trainer/', homeTask: '' },
      { id: 'l3', title: 'Hohe Bälle fangen mit einer sehr langen Beschreibung, damit die Ansicht auch am Handy umbricht', unit: 'Flanken von beiden Seiten, im höchsten Punkt fangen, Knie hoch.', minutes: 5, url: 'https://www.youtube.com/watch?v=abcdefghijk&list=PLabcdefghijklmnopqrstuvwxyz0123456789', homeTask: 'Zehn Minuten Sprungkraft: Hocksprünge und Seilspringen.' },
      { id: 'l4', title: 'Abwurf und Abschlag', unit: 'Abwurf flach auf den Außenverteidiger, dann Abschlag auf Zonen.', minutes: 5, url: null, homeTask: 'Video zum Abschlag ansehen.' },
    ],
  });
  fake.learning.paths.set('lp2', {
    title: 'Erster Kontakt', position: '', ageGroup: '',
    levels: [
      { id: 'm1', title: 'Ball mit der Innenseite annehmen', unit: 'Zu zweit passen, Ball mit dem ersten Kontakt in den Lauf mitnehmen.', minutes: 3, url: null, homeTask: 'Jeden Tag 5 Minuten gegen die Wand passen.' },
      { id: 'm2', title: 'Schulterblick vor der Annahme', unit: 'Vor jedem Pass über die Schulter schauen und ansagen, was frei ist.', minutes: 4, url: null, homeTask: '' },
    ],
  });
  fake.learning.progress.set('p1', { playerId: 'p1', paths: { lp1: { l1: '2026-10-13', l2: '2026-10-20' }, lp2: { m1: '2026-10-27' } } });
  fake.learning.progress.set('p2', { playerId: 'p2', paths: { lp2: { m1: '2026-10-27', m2: '2026-11-03' } } });
  // Scout-Sicht (SCRUM-170) so, wie sie der Trainer-Client aus diesen Daten schreiben würde.
  const players = [...fake.players.players].map(([id, data]) => playerFromDoc(id, data));
  const events = [...fake.events.events].map(([id, data]) => eventFromDoc(id, data));
  const ratingsByEvent = new Map([...fake.ratings.ratings].map(([eventId, byPlayer]) => [eventId, new Map([...byPlayer].map(([playerId, data]) => [playerId, ratingFromDoc(data)]))]));
  for (const [id, doc] of buildScoutProfiles(players, events, ratingsByEvent)) fake.scout.profiles.set(id, JSON.parse(JSON.stringify(doc)) as Record<string, unknown>);
  return fake;
}

const fake = seed();
// Registrierung und Teamauswahl (SCRUM-181): ein gültiger Vereinscode, E-Mail gilt als bestätigt; ein Konto mit zwei Teams.
fake.registration.invites.set('ABCDEFGHJKLMNPQR', {
  code: 'ABCDEFGHJKLMNPQR', kind: 'club', clubId: 'Club0000000000000001', teamId: 'Team0000000000000001', expiresAt: new Date(Date.now() + 7 * 86_400_000), email: null,
});
fake.registration.verified = true;
fake.teams.memberships.set('new-coach', [{ teamId: 'Team0000000000000001', role: 'trainer', playerId: null, expiresAt: null }]);
fake.teams.metas.set('Team0000000000000001', { name: 'SV Musterstadt U11', label: 'U11', clubId: 'Club0000000000000001', clubName: 'SV Musterstadt', logoUrl: null });
fake.teams.memberships.set('e2e-multi', [
  { teamId: 'U14', role: 'trainer', playerId: null, expiresAt: null },
  { teamId: 'Team0000000000000001', role: 'trainer', playerId: null, expiresAt: null },
  { teamId: 'Team0000000000000002', role: 'parent', playerId: 'p1', expiresAt: null },
]);
fake.teams.metas.set('U14', { name: 'Test-Team U14 (Angular)', label: 'U14 Test', clubId: 'test-verein', clubName: 'Test-Verein (Angular-Test)', logoUrl: null });
// Vereinslogo aus der Datenbank (SCRUM-182): ein kleines Beispiel-PNG als data:-URL.
const SAMPLE_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAwklEQVR42u3a0Q2AIAwEUBZxJednG12AhJb2gF6uid/e06jQ2pqKqJ63f5ajZOjrMNHgxyDZwbdC0OFhiF3BIZBT4VMQKyec1VZEVugoBn710QA3who6C2DFpAFGAaIACyI1PAKQgigN8D6sCEAI4X3ToAAzBCdg5V1/CjBErHyokAD3XRBAAAEEEAAGKPEh01rodkCJ5bR2ZDcAym/qKdoq5RtbFK1FiuZu+fY6xYCDYsREM+SjGLPSDLppfjVQBesHTJGigAIPEM8AAAAASUVORK5CYII=';
fake.teams.metas.set('Team0000000000000002', { name: 'FC Beispiel U15', label: 'U15', clubId: 'c2', clubName: 'FC Beispiel', logoUrl: SAMPLE_LOGO });
// Vereinsadmin (SCRUM-181/182): Einstellungen zeigen „Name und Logo“ und die Trainer-Einladung.
fake.registration.adminClubs = [{ clubId: 'c2', name: 'FC Beispiel', logoUrl: SAMPLE_LOGO }];
// Spieler-Konto mit Einladungscode + E-Mail (SCRUM-114): ein offener Code für Spieler p1; ?as=player-email ist ein
// schon mit E-Mail verbundener Spieler-Zugang.
fake.access.invites.set('e2e-einladung', { role: 'player', playerId: 'p1', expiresAt: null, expiresAtRaw: null });
fake.access.members.set('e2e-player-email', { role: 'player', playerId: 'p1' });
// Funkloch (SCRUM-216): Browser „offline“ (DevTools bzw. Playwright `setOffline`) hält Live-Punkte wie Firestore ohne
// Netz zurück, bis der Browser wieder online ist.
window.addEventListener('offline', () => fake.ratings.goOffline());
window.addEventListener('online', () => fake.ratings.goOnline());
// Bewertungsskala (SCRUM-188): ?skala=stufen stellt das Team auf Kompetenzstufen; p1 hat dann zusätzlich eine mit Stufen
// vergebene Bewertung (gespeichert als 4,5 / 3 / 1,5 mit scale: 'levels'), die ältere Schulnote bleibt daneben stehen.
if (new URLSearchParams(location.search).get('skala') === 'stufen') {
  fake.settings.settings = { ratingScale: 'levels' };
  fake.ratings.ratings.set('serie-s1-2026-10-20', new Map([
    ['p1', { attendance: 'present', effort: 3, technique: 1.5, tactics: 3, comprehension: 1.5, grade: 2.4, scale: 'levels', note: 'Super mitgemacht', playerId: 'p1' }],
  ]));
}
if (new URLSearchParams(location.search).get('as') === 'fresh') {
  fake.players.players.clear();
  fake.events.events.clear();
}

bootstrapApplication(App, {
  providers: [
    ...appConfig.providers,
    ...provideFakeFirebase(fake),
    { provide: WeatherProvider, useClass: SampleWeatherProvider },
    // Meldet nach dem Start der Anmeldeprüfung einen angemeldeten Trainer.
    provideAppInitializer(() => {
      inject(AuthApi);
      // ?as=player | player-email | physio | scout | medical | none wählt eine andere Rolle bzw. „nicht angemeldet“ (Anmeldeseite).
      const as = new URLSearchParams(location.search).get('as');
      const user =
        as === 'none' ? null
        : as === 'player' ? { uid: 'e2e-player', isAnonymous: true, email: null }
        : as === 'player-email' ? { uid: 'e2e-player-email', isAnonymous: false, email: 'kind@example.org' }
        : as === 'physio' ? { uid: 'e2e-physio', isAnonymous: false, email: 'physio@example.org' }
        : as === 'scout' || as === 'medical' ? { uid: 'e2e-scout', isAnonymous: false, email: 'scout@example.org' }
        : as === 'multi' ? { uid: 'e2e-multi', isAnonymous: false, email: 'multi@example.org' }
        : { uid: 'e2e-uid', isAnonymous: false, email: 'trainer@example.org' };
      setTimeout(() => fake.auth.emit(user), 0);
    }),
  ],
}).catch((err) => console.error(err));
