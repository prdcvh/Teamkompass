import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { EventsService } from '../events/events.service';
import { RankingApi } from '../firebase/ranking.api';
import { SquadService } from '../player/squad.service';
import { todayIso } from '../shared/dates';
import { countsPoints, pointsFromDoc } from './points';
import {
  RANKING_SHOWS_POINTS_TO_PLAYERS,
  type Ranking,
  type RankingEntry,
  docFromRanking,
  entriesFor,
  inPeriod,
  monthPeriod,
  rankPlayers,
  rankingFromDoc,
  sameRanking,
  weekPeriod,
  withoutPoints,
} from './ranking';

export type RankingLoad = 'idle' | 'loading' | 'ready' | 'error';

/** So lange gilt eine frisch berechnete Rangliste, bevor der Trainer beim nächsten Öffnen der Startseite neu liest. */
const FRESH_MS = 5 * 60 * 1000;

/**
 * MVP und Top-5 (SCRUM-105). Trainer: liest einmalig die Punkte der Events von Woche und Monat (nur Events, die Punkte
 * vergeben), rechnet die Ranglisten und schreibt sie nach `meta/ranking`. Spieler und Eltern: lesen nur dieses eine
 * Dokument (ein Lesezugriff), nie die Punkte der anderen im Trainer-Pfad. Veraltete Zeiträume (z. B. letzte Woche, wenn der
 * Trainer die App noch nicht geöffnet hat) werden als leer gezeigt.
 */
@Injectable({ providedIn: 'root' })
export class RankingService {
  private readonly api = inject(RankingApi);
  private readonly session = inject(SessionService);
  private readonly events = inject(EventsService);
  private readonly squad = inject(SquadService);

  readonly load = signal<RankingLoad>('idle');
  readonly error = signal('');
  private readonly ranking = signal<Ranking | null>(null);
  private readonly today = signal(todayIso());

  /** Rangliste der laufenden Woche (Montag bis Sonntag); leer, wenn es keine Punkte gibt oder der Stand veraltet ist. */
  readonly week = computed<readonly RankingEntry[]>(() => entriesFor(this.ranking()?.week, weekPeriod(this.today())));
  /** Rangliste des laufenden Kalendermonats. */
  readonly month = computed<readonly RankingEntry[]>(() => entriesFor(this.ranking()?.month, monthPeriod(this.today())));

  private generation = 0;
  private refreshedAt = 0;
  private running: Promise<void> | null = null;

  constructor() {
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) this.reset();
    });
  }

  /** Lädt die Rangliste passend zur Rolle. Mehrfacher Aufruf ist harmlos. */
  start(): Promise<void> {
    if (this.running) return this.running;
    const role = this.session.role();
    if (role !== 'trainer' && role !== 'player' && role !== 'parent') return Promise.resolve();
    const fresh = role === 'trainer' && this.load() === 'ready' && Date.now() - this.refreshedAt < FRESH_MS;
    if (fresh || (role !== 'trainer' && this.load() === 'ready')) return Promise.resolve();
    const generation = this.generation;
    this.today.set(todayIso());
    this.load.set('loading');
    this.error.set('');
    const job = (role === 'trainer' ? this.computeAsTrainer(generation) : this.readStored(generation)).finally(() => {
      this.running = null;
    });
    this.running = job;
    return job;
  }

  /** Punkte oder Events haben sich geändert: beim nächsten Öffnen der Startseite neu rechnen. */
  invalidate(): void {
    this.refreshedAt = 0;
  }

  retry(): Promise<void> {
    this.load.set('idle');
    this.refreshedAt = 0;
    return this.start();
  }

  private async readStored(generation: number): Promise<void> {
    try {
      const ranking = rankingFromDoc(await this.api.readRanking());
      if (generation !== this.generation) return;
      this.ranking.set(ranking);
      this.load.set('ready');
    } catch (error) {
      this.fail(error, generation);
    }
  }

  private async computeAsTrainer(generation: number): Promise<void> {
    try {
      const [events, players] = await Promise.all([this.events.whenLoaded(), this.squad.whenLoaded()]);
      const today = todayIso();
      const week = weekPeriod(today);
      const month = monthPeriod(today);
      const range = { from: week.from < month.from ? week.from : month.from, to: week.to > month.to ? week.to : month.to };
      const relevant = events.filter((event) => countsPoints(event) && inPeriod(event.date, range));
      const notes = await Promise.all(relevant.map(async (event) => ({ event, docs: await this.api.readPrivateNotes(event.id) })));
      if (generation !== this.generation) return;
      const names = new Map(players.map((player) => [player.id, player.name]));
      const totalsFor = (from: string, to: string) => {
        const sums = new Map<string, number>();
        for (const { event, docs } of notes) {
          if (!inPeriod(event.date, { from, to })) continue;
          for (const doc of docs) sums.set(doc.id, (sums.get(doc.id) ?? 0) + pointsFromDoc(doc.data));
        }
        return rankPlayers([...sums].flatMap(([id, points]) => (names.has(id) ? [{ name: names.get(id) ?? '', points }] : [])));
      };
      const built: Ranking = {
        week: { ...week, entries: totalsFor(week.from, week.to) },
        month: { ...month, entries: totalsFor(month.from, month.to) },
        updatedAt: new Date().toISOString(),
      };
      this.today.set(today);
      this.ranking.set(built);
      this.refreshedAt = Date.now();
      this.load.set('ready');
      await this.publish(built, generation);
    } catch (error) {
      this.fail(error, generation);
    }
  }

  /** Schreibt die Rangliste für Spieler, wenn sie sich geändert hat. Ein Fehler hier stört die Anzeige für den Trainer nicht. */
  private async publish(built: Ranking, generation: number): Promise<void> {
    try {
      const shared: Ranking = RANKING_SHOWS_POINTS_TO_PLAYERS
        ? built
        : { ...built, week: { ...built.week, entries: withoutPoints(built.week.entries) }, month: { ...built.month, entries: withoutPoints(built.month.entries) } };
      const stored = rankingFromDoc(await this.api.readRanking());
      if (generation !== this.generation || sameRanking(stored, shared)) return;
      await this.api.saveRanking(docFromRanking(shared));
    } catch (error) {
      console.error(error);
    }
  }

  private fail(error: unknown, generation: number): void {
    if (generation !== this.generation) return;
    console.error(error);
    this.error.set(`Die Rangliste konnte nicht geladen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
    this.load.set('error');
  }

  private reset(): void {
    this.generation += 1;
    this.ranking.set(null);
    this.load.set('idle');
    this.error.set('');
    this.refreshedAt = 0;
    this.running = null;
  }
}
