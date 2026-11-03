import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import type { TeamEvent } from '../events/event';
import { type SelfReportKind, SelfReportsApi } from '../firebase/self-reports.api';
import type { RawDoc } from '../firebase/types';
import { SyncService } from '../shell/sync.service';
import {
  type SelfReport,
  type WellnessAnswers,
  type WellnessEntry,
  docFromSelfReport,
  docFromWellness,
  hasWellnessAnswer,
  selfReportFromDoc,
  wellnessFromDoc,
} from './self-report';

/**
 * Angaben EINES Spielers nach den Terminen (SCRUM-138): Anstrengung und Befinden in Echtzeit. Gestartet von Profil
 * (Trainer) und „Mein Profil“ (Spieler, Eltern, Medizin), zusammen mit den übrigen Zusatzdaten.
 *
 * Fehler beim Laden blockieren das Profil nicht: Ohne Spielerangaben rechnet die App einfach mit dem Trainerwert.
 * Das Befinden fehlt still, wenn die Rolle es nicht lesen darf (z. B. Einwilligung widerrufen, Regeln).
 */
@Injectable({ providedIn: 'root' })
export class SelfReportsService {
  private readonly api = inject(SelfReportsApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  readonly playerId = signal<string | null>(null);
  /** Anstrengung je Event-ID. */
  readonly reports = signal<ReadonlyMap<string, SelfReport>>(new Map());
  /** Befinden je Event-ID. */
  readonly wellness = signal<ReadonlyMap<string, WellnessEntry>>(new Map());
  /** Anstrengung geladen (oder Laden fehlgeschlagen – dann gilt der Trainerwert). */
  readonly loaded = signal(false);
  /** Laden der Anstrengung fehlgeschlagen (Hinweis in der Anzeige). */
  readonly failed = signal(false);
  /** Befinden lesbar und geladen. */
  readonly wellnessReadable = signal(false);
  readonly saving = signal(false);

  /** Spieler und Eltern antworten nur für den eigenen Spieler. */
  readonly canAnswer = computed(() => {
    const role = this.session.role();
    return (role === 'player' || role === 'parent') && this.playerId() !== null && this.session.playerId() === this.playerId();
  });

  private unsubscribers: (() => void)[] = [];
  private generation = 0;

  constructor() {
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  /** Angaben dieses Spielers (leer, solange ein anderer Spieler geladen ist). */
  reportsFor(playerId: string): ReadonlyMap<string, SelfReport> {
    return this.playerId() === playerId ? this.reports() : new Map();
  }

  start(playerId: string): void {
    if (this.playerId() === playerId) return;
    this.stop();
    const generation = ++this.generation;
    this.playerId.set(playerId);
    this.open(generation, playerId, 'selfReports', (docs) => {
      const entries = docs.flatMap((entry) => {
        const report = selfReportFromDoc(entry.id, entry.data);
        return report ? [[entry.id, report] as const] : [];
      });
      this.reports.set(new Map(entries));
      this.loaded.set(true);
    });
    this.open(generation, playerId, 'wellness', (docs) => {
      this.wellness.set(new Map(docs.map((entry) => [entry.id, wellnessFromDoc(entry.id, entry.data)])));
      this.wellnessReadable.set(true);
    });
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.playerId.set(null);
    this.reports.set(new Map());
    this.wellness.set(new Map());
    this.loaded.set(false);
    this.failed.set(false);
    this.wellnessReadable.set(false);
    this.saving.set(false);
  }

  /**
   * Speichert die Anstrengung und – falls übergeben – das Befinden des eigenen Spielers. `wellness` nur bei
   * dokumentierter Einwilligung übergeben (sonst lehnen die Regeln ab). Leeres Befinden wird nur geschrieben, wenn
   * es schon eine Antwort gab (zum Zurücknehmen); sonst bleibt es ganz weg.
   */
  async save(event: TeamEvent, exertion: number, wellness: WellnessAnswers | null): Promise<boolean> {
    const playerId = this.playerId();
    const role = this.session.role();
    if (!this.canAnswer() || !playerId || !role || !Number.isInteger(exertion) || exertion < 0 || exertion > 10) return false;
    this.saving.set(true);
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    try {
      await this.api.saveSelfReport(playerId, 'selfReports', event.id, docFromSelfReport(playerId, event, exertion, role));
      if (wellness && (hasWellnessAnswer(wellness) || this.wellness().has(event.id))) {
        await this.api.saveSelfReport(playerId, 'wellness', event.id, docFromWellness(playerId, event, wellness, role));
      }
      this.sync.clearError();
      return true;
    } catch (error) {
      console.error(error);
      this.sync.fail(`Deine Angabe konnte nicht gespeichert werden. ${authErrorMessage(errorCode(error), role)}`);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private open(generation: number, playerId: string, kind: SelfReportKind, apply: (docs: RawDoc[]) => void): void {
    const onError = (error: unknown) => {
      if (generation !== this.generation) return;
      console.warn(`Spielerangaben (${kind}) nicht lesbar`, error);
      if (kind === 'selfReports') {
        this.failed.set(true);
        this.loaded.set(true);
      } else {
        this.wellnessReadable.set(false);
      }
    };
    this.api
      .watchSelfReports(
        playerId,
        kind,
        (docs, meta) => {
          if (generation !== this.generation) return;
          apply(docs);
          this.sync.applySnapshot(meta);
        },
        onError,
      )
      .then((unsubscribe) => {
        if (generation !== this.generation) unsubscribe();
        else this.unsubscribers.push(unsubscribe);
      })
      .catch(onError);
  }
}
