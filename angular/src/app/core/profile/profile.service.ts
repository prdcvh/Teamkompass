import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { EventsService } from '../events/events.service';
import { GradeReleasesApi } from '../firebase/grade-releases.api';
import { RatingsApi } from '../firebase/ratings.api';
import { type GradeRelease, isReleaseActive, releaseFromDoc } from '../ratings/grade-release';
import { playerRating } from '../ratings/player-view';
import { type EventRating } from './profile';
import type { SnapshotMeta } from '../firebase/types';
import { type Rating, isRated, ratingFromDoc } from '../ratings/rating';
import { type PointsEntry, pointsFromDoc } from '../points/points';
import { SessionService } from '../auth/session.service';
import { SyncService } from '../shell/sync.service';
import { withSelfExertion } from '../self-report/self-report';
import { SelfReportsService } from '../self-report/self-reports.service';

/**
 * Bewertungen EINES Spielers über alle Events (Grundlage des Profils). Je Event wird nur das Bewertungsdokument
 * dieses Spielers abonniert (nie die Bewertungen anderer Spieler); neue und gelöschte Events folgen automatisch.
 * Beim Abmelden werden Abos und Daten sofort verworfen.
 *
 * Spieler und Eltern (SCRUM-115) lesen statt der Bewertung die Werte-Kopie je Event und – nur solange eine Freigabe
 * gilt – die Noten-Kopie. Noten, die die Regeln (noch) nicht herausgeben, fehlen einfach; einen Kommentar gibt es für
 * sie nie. Der Trainer liest wie bisher die vollständige Bewertung.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly ratingsApi = inject(RatingsApi);
  private readonly releasesApi = inject(GradeReleasesApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly events = inject(EventsService);
  private readonly selfReports = inject(SelfReportsService);

  readonly playerId = signal<string | null>(null);
  /** Bewertung (Trainer) bzw. Werte-Kopie (Spieler/Eltern) je Event-ID; `null` = gibt es (noch) nicht. */
  private readonly docs = signal<ReadonlyMap<string, Readonly<Record<string, unknown>> | null>>(new Map());
  /** Noten-Kopie je Event-ID (nur Spieler/Eltern mit gültiger Freigabe); fehlt/null = keine sichtbaren Noten. */
  private readonly gradeDocs = signal<ReadonlyMap<string, Readonly<Record<string, unknown>> | null>>(new Map());
  /** Freigabe der Noten (nur Spieler/Eltern, SCRUM-115); null = keine. */
  readonly release = signal<GradeRelease | null>(null);
  private readonly clock = signal(new Date());
  /** Läuft gerade eine Freigabe? Ohne sie sieht der Spieler nur seine Werte. */
  readonly gradesReleased = computed(() => isReleaseActive(this.release(), this.clock()));
  /** Spieler- oder Eltern-Zugang: liest die Kopien statt der Bewertung. */
  private readonly memberView = computed(() => {
    const role = this.session.role();
    return role === 'player' || role === 'parent';
  });
  /** Rating je Event-ID; `null` = für dieses Event gibt es (noch) keine Bewertung dieses Spielers. */
  private readonly byEvent = computed<ReadonlyMap<string, Rating | null>>(() => {
    const docs = this.docs();
    if (!this.memberView()) return new Map([...docs].map(([id, data]) => [id, data ? ratingFromDoc(data) : null]));
    const grades = this.gradesReleased() ? this.gradeDocs() : new Map<string, Readonly<Record<string, unknown>> | null>();
    return new Map([...docs].map(([id, data]) => [id, playerRating(data, grades.get(id) ?? null)]));
  });
  /** Trainingspunkte je Event-ID (SCRUM-104); nur für Trainer gefüllt, fehlender Eintrag = 0. */
  private readonly pointsByEvent = signal<ReadonlyMap<string, number>>(new Map());
  /** Anzahl der Events, deren erste Antwort noch aussteht. */
  private readonly waiting = signal(0);
  readonly error = signal('');

  readonly loading = computed(() => this.playerId() !== null && !this.error() && (this.events.load() !== 'ready' || this.waiting() > 0));
  /**
   * Alle Events mit der Bewertung des Spielers (oder null), neueste zuerst. Hat der Spieler seine Anstrengung selbst
   * angegeben (SCRUM-138), steht sie in `event.exertion` statt des Trainerwerts – so rechnen Belastungsampel,
   * Protokoll und Kennzahlen überall mit dem Spielerwert. Den Trainerwert zeigt die Eventliste ({@link EventsService}).
   */
  readonly items = computed<EventRating[]>(() => {
    const playerId = this.playerId();
    const items = [...this.events.events()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((event) => ({ event, rating: this.byEvent().get(event.id) ?? null }));
    return playerId ? withSelfExertion(items, this.selfReports.reportsFor(playerId)) : items;
  });

  /** Alle Events mit den gespeicherten Punkten des Spielers (ob das Event sie zählt, entscheidet `points.ts`). Nur Trainer. */
  readonly pointItems = computed<PointsEntry[]>(() =>
    this.session.role() === 'trainer' ? this.events.events().map((event) => {
        const rating = this.byEvent().get(event.id) ?? null;
        return { event, points: this.pointsByEvent().get(event.id) ?? 0, rated: rating !== null && isRated(rating) };
      }) : [],
  );

  private unsubscribers = new Map<string, () => void>();
  private pending = new Set<string>();
  private generation = 0;
  private releaseUnsubscribe: (() => void) | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Freigabe, für die die Noten-Abos laufen (Veröffentlichungszeitpunkt in ms; null = keine Abos). */
  private gradesFor: number | null = null;

  constructor() {
    // Folgt der Eventliste: für neue Events ein Abo anlegen, für gelöschte beenden.
    effect(() => {
      const playerId = this.playerId();
      const ids = this.events.events().map((event) => event.id);
      if (playerId !== null) untracked(() => this.reconcile(playerId, ids));
    });
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  /** Startet die Abos für den Spieler (ein anderer Spieler beendet die bisherigen). */
  start(playerId: string): void {
    if (this.playerId() === playerId) return;
    this.stop();
    this.generation += 1;
    this.playerId.set(playerId);
    if (this.memberView()) this.watchRelease(playerId, this.generation);
    this.events.start();
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();
    this.pending.clear();
    this.releaseUnsubscribe?.();
    this.releaseUnsubscribe = null;
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    this.gradesFor = null;
    this.release.set(null);
    this.gradeDocs.set(new Map());
    this.playerId.set(null);
    this.docs.set(new Map());
    this.pointsByEvent.set(new Map());
    this.waiting.set(0);
    this.error.set('');
  }

  private reconcile(playerId: string, ids: readonly string[]): void {
    const wanted = new Set(ids);
    const generation = this.generation;
    for (const [key, unsubscribe] of this.unsubscribers) {
      const eventId = key.startsWith('p:') || key.startsWith('g:') ? key.slice(2) : key;
      if (wanted.has(eventId)) continue;
      unsubscribe();
      this.unsubscribers.delete(key);
      this.pending.delete(key);
      const drop = (map: ReadonlyMap<string, unknown>) => {
        const next = new Map(map);
        next.delete(eventId);
        return next;
      };
      if (key.startsWith('p:')) this.pointsByEvent.update((map) => drop(map) as Map<string, number>);
      else if (key.startsWith('g:')) this.gradeDocs.update((map) => drop(map) as Map<string, Readonly<Record<string, unknown>> | null>);
      else this.docs.update((map) => drop(map) as Map<string, Readonly<Record<string, unknown>> | null>);
    }
    const trainer = this.session.role() === 'trainer';
    for (const eventId of ids) {
      if (this.unsubscribers.has(eventId) || this.pending.has(`open:${eventId}`)) continue;
      this.pending.add(`open:${eventId}`);
      this.pending.add(eventId);
      this.watch(playerId, eventId, generation);
      if (trainer) {
        this.pending.add(`p:${eventId}`);
        this.watchPoints(playerId, eventId, generation);
      }
    }
    if (this.gradesFor !== null) {
      for (const eventId of ids) if (!this.unsubscribers.has(`g:${eventId}`)) this.watchGrades(playerId, eventId, generation);
    }
    this.waiting.set([...this.pending].filter((key) => !key.startsWith('open:')).length);
  }

  private watch(playerId: string, eventId: string, generation: number): void {
    const answered = () => {
      this.pending.delete(eventId);
      this.waiting.set([...this.pending].filter((key) => !key.startsWith('open:')).length);
    };
    const onData = (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => {
      if (generation !== this.generation) return;
      this.docs.update((map) => new Map(map).set(eventId, data));
      answered();
      this.sync.applySnapshot(meta);
    };
    const onError = (error: unknown) => {
      if (generation === this.generation) this.fail(error);
    };
    // Spieler und Eltern: Werte-Kopie (SCRUM-115); Trainer: die vollständige Bewertung.
    const subscription = this.memberView()
      ? this.ratingsApi.watchValuesDoc(eventId, playerId, onData, onError)
      : this.ratingsApi.watchRatingDoc(eventId, playerId, onData, onError);
    subscription
      .then((unsubscribe) => {
        this.pending.delete(`open:${eventId}`);
        if (generation !== this.generation || this.error()) unsubscribe();
        else this.unsubscribers.set(eventId, unsubscribe);
      })
      .catch((error) => {
        this.pending.delete(`open:${eventId}`);
        if (generation === this.generation) this.fail(error);
      });
  }

  /**
   * Freigabe der Noten (Spieler/Eltern, SCRUM-115). Ändert sie sich (neu veröffentlicht, zurückgenommen, abgelaufen),
   * werden die Noten-Abos neu aufgesetzt: Die Regeln entscheiden beim Abruf, welche Noten freigegeben sind.
   */
  private watchRelease(playerId: string, generation: number): void {
    this.releasesApi
      .watchRelease(
        playerId,
        (data) => {
          if (generation !== this.generation) return;
          this.release.set(releaseFromDoc(data));
          this.applyRelease(playerId, generation);
        },
        (error) => {
          if (generation !== this.generation) return;
          console.error(error);
          this.release.set(null);
          this.applyRelease(playerId, generation);
        },
      )
      .then((unsubscribe) => {
        if (generation !== this.generation) unsubscribe();
        else this.releaseUnsubscribe = unsubscribe;
      })
      .catch((error) => {
        if (generation === this.generation) console.error(error);
      });
  }

  private applyRelease(playerId: string, generation: number): void {
    const release = this.release();
    const now = new Date();
    this.clock.set(now);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    const active = isReleaseActive(release, now);
    // Ablauf: danach blendet die App die Noten aus (die Regeln geben sie dann ohnehin nicht mehr heraus).
    if (active && release.expiresAt) {
      const wait = Math.min(release.expiresAt.getTime() - now.getTime(), 2_000_000_000);
      this.expiryTimer = setTimeout(() => {
        if (generation === this.generation) this.applyRelease(playerId, generation);
      }, wait + 50);
    }
    const key = active ? release.publishedUntil.getTime() : null;
    if (key === this.gradesFor) return;
    // Alte Noten-Abos beenden und Noten verwerfen.
    for (const [entry, unsubscribe] of [...this.unsubscribers]) {
      if (!entry.startsWith('g:')) continue;
      unsubscribe();
      this.unsubscribers.delete(entry);
    }
    this.gradeDocs.set(new Map());
    this.gradesFor = key;
    if (key === null) return;
    for (const event of this.events.events()) this.watchGrades(playerId, event.id, generation);
  }

  /** Noten-Kopie eines Events. Verweigern die Regeln sie (nach dem Klick vergeben, Freigabe vorbei), bleibt sie leer. */
  private watchGrades(playerId: string, eventId: string, generation: number): void {
    const key = `g:${eventId}`;
    const release = this.gradesFor;
    let active = true;
    const current = () => active && generation === this.generation && this.gradesFor === release;
    this.unsubscribers.set(key, () => (active = false)); // Platzhalter bis das Abo steht, verhindert doppeltes Abo
    this.ratingsApi
      .watchGradesDoc(
        eventId,
        playerId,
        (data) => {
          if (current()) this.gradeDocs.update((map) => new Map(map).set(eventId, data));
        },
        () => {
          // permission-denied ist hier der Normalfall für nicht freigegebene Noten – kein Fehler fürs Profil.
          if (current()) this.gradeDocs.update((map) => new Map(map).set(eventId, null));
        },
      )
      .then((unsubscribe) => {
        if (current()) {
          this.unsubscribers.set(key, () => {
            active = false;
            unsubscribe();
          });
        } else unsubscribe();
      })
      .catch(() => {
        if (current()) this.gradeDocs.update((map) => new Map(map).set(eventId, null));
      });
  }

  /** Punkte aus dem Trainer-Dokument des Spielers (nur Trainer dürfen den Pfad lesen). */
  private watchPoints(playerId: string, eventId: string, generation: number): void {
    const key = `p:${eventId}`;
    this.ratingsApi
      .watchPrivateDoc(
        eventId,
        playerId,
        (data, meta) => {
          if (generation !== this.generation) return;
          this.pointsByEvent.update((map) => new Map(map).set(eventId, pointsFromDoc(data)));
          this.pending.delete(key);
          this.waiting.set([...this.pending].filter((entry) => !entry.startsWith('open:')).length);
          this.sync.applySnapshot(meta);
        },
        (error) => {
          if (generation === this.generation) this.fail(error);
        },
      )
      .then((unsubscribe) => {
        if (generation !== this.generation || this.error()) unsubscribe();
        else this.unsubscribers.set(key, unsubscribe);
      })
      .catch((error) => {
        if (generation === this.generation) this.fail(error);
      });
  }

  private fail(error: unknown): void {
    console.error(error);
    this.error.set(`Das Profil konnte nicht geladen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
    this.sync.fail('Laden fehlgeschlagen', 'load');
  }

  /** Erneut versuchen nach einem Fehler. */
  retry(): void {
    const playerId = this.playerId();
    this.stop();
    if (playerId) this.start(playerId);
  }
}
