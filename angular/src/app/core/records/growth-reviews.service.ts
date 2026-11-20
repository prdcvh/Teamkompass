import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { todayIso } from '../shared/dates';
import { type GrowthReview, type GrowthReviewDraft, type GrowthReviewErrors, MAX_REVIEW_BY, docFromGrowthReview, growthReviewFromDoc, validateGrowthReview } from './growth-review';

/**
 * Trainerprüfungen „Wachstum und Belastung“ (SCRUM-257) EINES Spielers im Profil. Nur der Trainer lädt und schreibt
 * sie (die Regeln sperren alle anderen Rollen). Eine Notiz wird nie geändert, nur angelegt oder gelöscht.
 */
@Injectable({ providedIn: 'root' })
export class GrowthReviewsService {
  private readonly api = inject(PlayerRecordsApi);
  private readonly session = inject(SessionService);

  readonly playerId = signal<string | null>(null);
  readonly reviews = signal<readonly GrowthReview[]>([]);
  readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly error = signal('');
  readonly visible = computed(() => this.session.role() === 'trainer');
  /** Name, der als prüfender Trainer eingetragen wird. */
  readonly reviewer = computed(() => (this.session.displayName().trim() || this.session.email() || 'Trainer').slice(0, MAX_REVIEW_BY));

  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor() {
    effect(() => {
      if (!this.visible()) this.stop();
    });
  }

  start(playerId: string): void {
    if (!this.visible()) {
      this.stop();
      return;
    }
    if (this.playerId() === playerId && this.state() !== 'error') return;
    this.stop();
    const generation = ++this.generation;
    this.playerId.set(playerId);
    this.state.set('loading');
    this.api
      .watchPlayerRecords(
        playerId,
        'growthReviews',
        (docs) => {
          if (generation !== this.generation) return;
          this.reviews.set(docs.map((entry) => growthReviewFromDoc(entry.id, entry.data)).filter((entry): entry is GrowthReview => entry !== null));
          this.state.set('ready');
        },
        (error) => {
          if (generation === this.generation) this.fail(error);
        },
      )
      .then((unsubscribe) => {
        if (generation === this.generation) this.unsubscribe = unsubscribe;
        else unsubscribe();
      })
      .catch((error) => {
        if (generation === this.generation) this.fail(error);
      });
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.playerId.set(null);
    this.reviews.set([]);
    this.state.set('idle');
    this.error.set('');
  }

  /** Prüfung speichern; Name und Konto des Trainers trägt die App ein. Fehler je Feld, leer = gespeichert. */
  async save(draft: GrowthReviewDraft, hintKey: string, planIds: readonly string[]): Promise<GrowthReviewErrors> {
    const playerId = this.playerId();
    const uid = this.session.uid();
    if (!this.visible() || !playerId || !uid || this.state() !== 'ready') return { action: 'Nur Trainer dürfen eine Prüfung dokumentieren.' };
    const today = todayIso();
    const errors = validateGrowthReview(draft, planIds, today);
    if (Object.keys(errors).length > 0) return errors;
    const review: GrowthReview = {
      id: `gr${crypto.randomUUID()}`,
      planId: draft.planId,
      hintKey,
      date: draft.date,
      by: this.reviewer(),
      byUid: uid,
      action: draft.action.trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      await this.api.savePlayerRecord(playerId, 'growthReviews', review.id, docFromGrowthReview(review));
      this.reviews.update((list) => [...list.filter((item) => item.id !== review.id), review]);
      return {};
    } catch (error) {
      console.error(error);
      return { action: `Die Prüfung konnte nicht gespeichert werden. ${authErrorMessage(errorCode(error), this.session.role())}` };
    }
  }

  /** Alle Prüfungen des Spielers löschen (Aufgabe „Gesundheitsdaten prüfen und löschen“). */
  async removeAll(): Promise<boolean> {
    const playerId = this.playerId();
    if (!this.visible() || !playerId) return false;
    try {
      for (const review of [...this.reviews()]) {
        await this.api.deletePlayerRecord(playerId, 'growthReviews', review.id);
        this.reviews.update((list) => list.filter((item) => item.id !== review.id));
      }
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  private fail(error: unknown): void {
    console.error(error);
    this.state.set('error');
    this.error.set(`Die Prüfungen „Wachstum und Belastung“ konnten nicht geladen oder gelöscht werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
  }
}
