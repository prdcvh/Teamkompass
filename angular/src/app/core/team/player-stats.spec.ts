import { eventFromDoc, type TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import { teamStats, teamTrend } from '../analysis/analysis';
import { injuryRisk } from '../analysis/risk';
import { attendanceCount, availability, averageGrade, gameStats, gradedEvents, profileFigures } from '../profile/profile';
import { ATTENDANCES, BLANK_RATING, type Rating, applyChange, calculatedGrade, docFromRating, ratingFromDoc } from '../ratings/rating';
import { buildScoutProfiles } from '../scout/scout-profile';
import {
  PLAYER_STATS_VERSION,
  RATING_SOURCE_FIELDS,
  buildPlayerStats,
  compareStats,
  hasStatsSource,
  ratingFromStatsEntry,
  ratingsFromDocs,
  ratingsFromPlayerStats,
  statsEntry,
  statsUpdate,
} from './player-stats';
import { type PlayerData, type RatingsByEvent, dashboardFigures, itemsFor, leaders } from './team';

/**
 * SCRUM-201: Die Kennzahlen aus der Zusammenfassung müssen exakt denen aus allen Einzelbewertungen entsprechen.
 * Geprüft wird mit einem großen, zufälligen, aber festen Datensatz (wie echte Daten: Trainings und Spiele über eine
 * Saison, alte Dokumente nur mit Gesamtnote, leere Felder, „Fehlt“, „Nicht im Kader“, Rückmeldungen) – einmal über die
 * Neuberechnung und einmal über das laufende Mitschreiben samt gelöschter Bewertungen, Events und Spieler.
 */

const TODAY = '2026-10-21';
const NOW = new Date('2026-10-21T12:00:00');

/** Fester Zufall (mulberry32), damit der Datensatz in jedem Lauf gleich ist. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Raw = Record<string, unknown>;
/** Bewertungsdokumente wie in Firestore: eventId → (playerId → Felder). */
type Store = Map<string, Map<string, Raw>>;
/** Zusammenfassungen wie in Firestore: playerId → Dokument. */
type StatsStore = Map<string, Raw>;

const player = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  name: `Spieler ${id}`,
  positions: ['ZM'],
  number: Number(id.slice(1)) || 1,
  birthdate: '2012-03-04',
  status: 'Fit',
  injuryUntil: '',
  injuredSince: '',
  consentStatus: 'granted',
  consentDate: '',
  ...overrides,
});

function dataset(seed: number) {
  const rnd = random(seed);
  const pick = <T>(values: readonly T[]): T => values[Math.floor(rnd() * values.length)];
  const players = Array.from({ length: 22 }, (_, index) => player(`p${index + 1}`, index === 3 ? { consentStatus: 'revoked' } : {}));
  const events: TeamEvent[] = Array.from({ length: 60 }, (_, index) => {
    const day = new Date(Date.UTC(2026, 7, 1 + index * 2 + Math.floor(rnd() * 2)));
    const game = rnd() < 0.3;
    return eventFromDoc(`e${index + 1}`, {
      type: game ? 'Spiel' : 'Training',
      title: game ? 'Spiel' : 'Training',
      date: day.toISOString().slice(0, 10),
      intensity: 1 + Math.floor(rnd() * 3),
      exertion: 1 + Math.floor(rnd() * 10),
      matchDuration: game ? pick([60, 70, 80]) : '',
      durationMinutes: game ? '' : pick([60, 75, 90, '']),
      goalsFor: game ? Math.floor(rnd() * 4) : '',
      goalsAgainst: game ? Math.floor(rnd() * 4) : '',
    });
  });
  const grade = () => pick([1, 2, 3, 4, 5, 6, '', null, '3', 7, 0, 2.5]);
  const store: Store = new Map();
  for (const event of events) {
    if (rnd() < 0.1) continue; // Events ganz ohne Bewertungen
    const docs = new Map<string, Raw>();
    for (const p of players) {
      if (rnd() < 0.15) continue; // Spieler ohne Bewertungsdokument
      const kind = rnd();
      if (kind < 0.08) {
        // altes Dokument: nur Gesamtnote
        docs.set(p.id, { grade: pick([1, 2, 3, 4, '']), attendance: pick(['present', 'limited', undefined]), playerId: p.id });
      } else {
        docs.set(p.id, {
          attendance: pick([...ATTENDANCES, 'unbekannt']),
          grade: '',
          effort: grade(),
          technique: grade(),
          tactics: grade(),
          comprehension: grade(),
          minutes: pick([0, 15, 45, 60, 90, '', 1200, -5, '30']),
          goals: pick([0, 1, 2, '', 25]),
          assists: pick([0, 1, '', null]),
          note: pick(['', 'Gut gemacht', 'Krank']),
          ...(rnd() < 0.1 ? { autoAbsence: true } : {}),
          playerId: p.id,
        });
      }
    }
    // Bewertung eines Spielers, den es im Kader nicht (mehr) gibt.
    if (rnd() < 0.2) docs.set('geloescht', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, playerId: 'geloescht' });
    store.set(event.id, docs);
  }
  return { players, events, store };
}

function legacyRatings(store: Store, events: readonly TeamEvent[]): RatingsByEvent {
  // Wie die bisherigen Abos: je bestehendem Event alle Dokumente (auch ein leeres Event hat einen Eintrag).
  return ratingsFromDocs(new Map(events.map((event) => [event.id, [...(store.get(event.id) ?? new Map<string, Raw>())].map(([id, data]) => ({ id, data }))])));
}

function statsDocs(stats: StatsStore) {
  return [...stats].map(([id, data]) => ({ id, data }));
}

const DELETE = Symbol('deleteField');

/** Firestore `set(..., { merge: true })`: Maps werden feldweise zusammengeführt, `deleteField()` entfernt den Schlüssel. */
function merge(target: Raw | undefined, source: Raw): Raw {
  const result: Raw = { ...(target ?? {}) };
  for (const [key, value] of Object.entries(source)) {
    if (value === DELETE) delete result[key];
    else if (value && typeof value === 'object' && !Array.isArray(value)) result[key] = merge(result[key] as Raw | undefined, value as Raw);
    else result[key] = value;
  }
  return result;
}

/** Alle Kennzahlen, die Start, Aufstellung, Teamanalyse, Scout-Sicht (und zur Sicherheit das Profil) zeigen. */
function figures(players: readonly Player[], events: readonly TeamEvent[], ratings: RatingsByEvent) {
  const data: PlayerData[] = players.map((p) => ({ player: p, items: itemsFor(p.id, events, ratings), absences: [], measurements: [] }));
  return {
    dashboard: dashboardFigures(data, events, TODAY, NOW),
    leaders: leaders(data, 100),
    teamStats: teamStats(events, ratings, TODAY),
    teamTrend: teamTrend(events, ratings),
    perPlayer: data.map(({ player: p, items }) => ({
      id: p.id,
      lineupGrade: averageGrade(gradedEvents(items)),
      attendance: attendanceCount(items),
      risk: injuryRisk(p, items, [], [], NOW),
      profile: profileFigures(items, TODAY),
      availability: availability(items, TODAY),
      games: gameStats(items, TODAY),
    })),
    scout: [...buildScoutProfiles(players, events, ratings)],
  };
}

/**
 * Einige Ergebnisse (z. B. bestes/schwächstes Event im Profil) enthalten das Bewertungsobjekt selbst; dessen
 * Rückmeldungstext ist keine Kennzahl und wird für den Vergleich entfernt. Alle Zahlen bleiben unangetastet.
 */
function numbers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(numbers);
  if (value instanceof Map) return new Map([...value].map(([key, entry]) => [key, numbers(entry)]));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'note' && key !== 'autoAbsence').map(([key, entry]) => [key, numbers(entry)]));
  }
  return value;
}

/** Bewertungen ohne Rückmeldungstext und Auto-Markierung (die stehen bewusst nicht in der Zusammenfassung). */
function withoutText(ratings: RatingsByEvent): RatingsByEvent {
  return new Map([...ratings].map(([eventId, byPlayer]) => [eventId, new Map([...byPlayer].map(([id, r]) => [id, { ...r, note: '', autoAbsence: false }]))]));
}

describe('Zusammenfassung je Spieler (SCRUM-201)', () => {
  describe('Eintrag', () => {
    it('übernimmt genau Anwesenheit, Teilnoten, Minuten, Tore und Vorlagen – keine Rückmeldung', () => {
      const rating: Rating = { ...BLANK_RATING, attendance: 'limited', effort: 2, technique: 3, tactics: null, comprehension: 1, minutes: 30, goals: 1, assists: 0, note: 'Krank', autoAbsence: true };
      expect(statsEntry(rating)).toEqual({ attendance: 'limited', effort: 2, technique: 3, tactics: null, comprehension: 1, minutes: 30, goals: 1, assists: 0 });
      expect(ratingFromStatsEntry(statsEntry(rating))).toEqual({ ...rating, note: '', autoAbsence: false });
      expect(ratingFromStatsEntry(null)).toEqual(BLANK_RATING);
    });

    it('jeder Schreibvorgang der App enthält alle nötigen Felder; der Eintrag hat immer alle Felder', () => {
      for (const attendance of ATTENDANCES) {
        for (const autoAbsence of [false, true]) {
          const doc = docFromRating({ ...BLANK_RATING, attendance, autoAbsence });
          expect(hasStatsSource(doc)).toBe(true);
          expect(Object.keys(statsUpdate('p1', 'e1', doc).events['e1']).sort()).toEqual(
            ['assists', 'attendance', 'comprehension', 'effort', 'goals', 'minutes', 'tactics', 'technique'],
          );
        }
      }
      expect(hasStatsSource({ attendance: 'present' })).toBe(false);
      expect(RATING_SOURCE_FIELDS).toContain('grade');
      expect(statsUpdate('p1', 'e1', docFromRating(BLANK_RATING))).toEqual({
        playerId: 'p1',
        version: PLAYER_STATS_VERSION,
        events: { e1: { attendance: 'open', effort: null, technique: null, tactics: null, comprehension: null, minutes: null, goals: null, assists: null } },
      });
    });

    it('altes Dokument nur mit Gesamtnote: Teilnoten werden wie beim Lesen der Bewertung aufgefüllt', () => {
      const legacy = { grade: 3, attendance: 'present' };
      expect(ratingFromStatsEntry(statsEntry(ratingFromDoc(legacy)))).toEqual({ ...ratingFromDoc(legacy), note: '', autoAbsence: false });
    });
  });

  describe('Kennzahlen sind identisch zur bisherigen Berechnung', () => {
    for (const seed of [1, 7, 2026]) {
      it(`Neuberechnung (Datensatz ${seed})`, () => {
        const { players, events, store } = dataset(seed);
        const legacy = legacyRatings(store, events);
        const docs = buildPlayerStats(events.map((event) => event.id), legacy);
        const fromStats = ratingsFromPlayerStats(
          [...docs].map(([id, data]) => ({ id, data: JSON.parse(JSON.stringify(data)) as Raw })),
          events,
        );
        expect(fromStats).toEqual(withoutText(legacy));
        const expected = figures(players, events, legacy);
        expect(numbers(figures(players, events, fromStats))).toEqual(numbers(expected));
        // Der Datensatz ist nicht trivial: viele Benotete, Teamnote, Belastung, Scout-Einträge.
        expect(expected.leaders.length).toBeGreaterThan(15);
        expect(expected.teamStats.avgGrade).not.toBeNull();
        expect(expected.perPlayer.some((entry) => entry.risk.load > 0)).toBe(true);
        // Gegenprobe: eine einzige abweichende Teilnote eines benoteten Events ändert die Kennzahlen (der Vergleich sieht Unterschiede).
        const tampered = new Map(fromStats);
        const [eventId, byPlayer] = [...tampered].find(([, entries]) => [...entries.values()].some((r) => calculatedGrade(r) !== null))!;
        const [playerId, original] = [...byPlayer].find(([, r]) => calculatedGrade(r) !== null)!;
        tampered.set(eventId, new Map(byPlayer).set(playerId, { ...original, effort: original.effort === 6 ? 1 : 6 }));
        expect(numbers(figures(players, events, tampered))).not.toEqual(numbers(expected));
      });
    }

    it('laufendes Mitschreiben inkl. „Fehlt“, „Nicht im Kader“, gelöschter Bewertung, gelöschtem Event und entferntem Spieler', () => {
      const { players: allPlayers, events: allEvents, store: initial } = dataset(99);
      const rnd = random(5);
      // Ausgangslage: Bewertungen aus der Neuberechnung.
      const store: Store = new Map([...initial].map(([id, docs]) => [id, new Map([...docs].map(([pid, data]) => [pid, { ...data }]))]));
      const stats: StatsStore = new Map(
        [...buildPlayerStats(allEvents.map((event) => event.id), legacyRatings(store, allEvents))].map(([id, doc]) => [id, JSON.parse(JSON.stringify(doc)) as Raw]),
      );
      let events = [...allEvents];
      let players = [...allPlayers];

      // Wie RatingsApi.saveRating: Bewertung (merge) + Eintrag der Zusammenfassung (merge) in einem Schreibvorgang.
      const save = (eventId: string, playerId: string, data: Raw) => {
        const docs = store.get(eventId) ?? new Map<string, Raw>();
        docs.set(playerId, merge(docs.get(playerId), { ...data, playerId }));
        store.set(eventId, docs);
        stats.set(playerId, merge(stats.get(playerId), statsUpdate(playerId, eventId, data) as unknown as Raw));
      };
      const fields = ['attendance', 'effort', 'technique', 'tactics', 'comprehension', 'minutes', 'goals', 'assists', 'note'] as const;
      const values: Record<(typeof fields)[number], readonly string[]> = {
        attendance: ATTENDANCES,
        effort: ['1', '2', '3', '6', ''],
        technique: ['2', '4', ''],
        tactics: ['1', '5', ''],
        comprehension: ['3', ''],
        minutes: ['0', '45', '200', ''],
        goals: ['0', '2', '30', ''],
        assists: ['1', ''],
        note: ['', 'Prima'],
      };

      for (let step = 0; step < 1500; step += 1) {
        const event = events[Math.floor(rnd() * events.length)];
        const p = players[Math.floor(rnd() * players.length)];
        const action = rnd();
        if (action < 0.9) {
          // Eingabe im Bewertungsbogen (applyChange → docFromRating, wie RatingsService.setField)
          const current = ratingFromDoc(store.get(event.id)?.get(p.id));
          const field = fields[Math.floor(rnd() * fields.length)];
          const options = values[field];
          const { rating, clearedAuto } = applyChange(current, field, options[Math.floor(rnd() * options.length)], event.matchDuration ?? 90);
          if (rating !== current) save(event.id, p.id, docFromRating(rating, { clearAuto: clearedAuto }));
        } else if (action < 0.95) {
          // Abwesenheits-Automatik: „Fehlt“ mit Grund und Auto-Markierung
          save(event.id, p.id, docFromRating({ ...BLANK_RATING, attendance: 'absent', note: 'Urlaub', autoAbsence: true }, { clearAuto: true }));
        } else if (action < 0.98 && events.length > 5) {
          // Event löschen (EventsApi.deleteEvent): Bewertungen weg, Einträge in den Zusammenfassungen weg
          for (const playerId of store.get(event.id)?.keys() ?? []) {
            stats.set(playerId, merge(stats.get(playerId), { playerId, version: PLAYER_STATS_VERSION, events: { [event.id]: DELETE } }));
          }
          store.delete(event.id);
          events = events.filter((entry) => entry.id !== event.id);
        } else if (players.length > 5) {
          // Spieler entfernen (PlayersApi.deletePlayer): alle Bewertungen und die Zusammenfassung weg
          for (const docs of store.values()) docs.delete(p.id);
          stats.delete(p.id);
          players = players.filter((entry) => entry.id !== p.id);
        }
      }
      expect(events.length).toBeLessThan(allEvents.length);
      expect(players.length).toBeLessThan(allPlayers.length);
      const legacy = legacyRatings(store, events);
      const fromStats = ratingsFromPlayerStats(statsDocs(stats), events);
      expect(fromStats).toEqual(withoutText(legacy));
      expect(numbers(figures(players, events, fromStats))).toEqual(numbers(figures(players, events, legacy)));
      // … und Neuberechnung und Prüfung sind sich einig.
      const expected = buildPlayerStats(events.map((event) => event.id), legacy);
      expect(compareStats(statsDocs(stats), expected, events.map((event) => event.id))).toEqual([]);
    });

    it('Einträge zu gelöschten Events werden ignoriert; ein leeres Event hat (wie bisher) einen leeren Eintrag', () => {
      const events = [eventFromDoc('e1', { date: '2026-10-01' }), eventFromDoc('e2', { date: '2026-10-02' })];
      const docs = [{ id: 'p1', data: { playerId: 'p1', version: 1, events: { e1: statsEntry({ ...BLANK_RATING, attendance: 'present' }), weg: statsEntry(BLANK_RATING) } } }];
      const ratings = ratingsFromPlayerStats(docs, events);
      expect([...ratings.keys()]).toEqual(['e1', 'e2']);
      expect(ratings.get('e2')?.size).toBe(0);
      expect(ratings.get('e1')?.get('p1')?.attendance).toBe('present');
      expect(ratingsFromPlayerStats([{ id: 'p1', data: { events: 'kaputt' } }], events).get('e1')?.size).toBe(0);
    });
  });
});
