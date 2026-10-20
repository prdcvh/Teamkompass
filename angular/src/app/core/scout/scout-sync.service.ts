import { Injectable, effect, inject } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { ScoutProfilesApi } from '../firebase/scout-profiles.api';
import type { Player } from '../player/player';
import type { Rating } from '../ratings/rating';
import { buildScoutProfiles, scoutProfileWrites } from './scout-profile';

/** Wartezeit, bis nach der letzten Änderung abgeglichen wird (bündelt viele Snapshots beim Laden und Bewerten). */
export const SCOUT_SYNC_DELAY_MS = 1500;

/**
 * Trainer-Seite der Scout-Ansicht (SCRUM-170): gleicht `scoutProfiles` mit Kader und Bewertungen ab – neue und
 * geänderte Profile werden geschrieben, Profile gelöschter Spieler entfernt. Den vollständigen Stand liefert
 * {@link TeamService} (erst wenn alle Bewertungen geladen sind, sonst würden halb geladene Profile entstehen).
 * Geschrieben wird nur, was vom gespeicherten Stand abweicht; bestehende Daten werden so beim ersten Öffnen nachgezogen.
 */
@Injectable({ providedIn: 'root' })
export class ScoutSyncService {
  private readonly api = inject(ScoutProfilesApi);
  private readonly session = inject(SessionService);

  private existing: Readonly<Record<string, unknown>> | null = null;
  private unsubscribe: (() => void) | null = null;
  private opening = false;
  private latest: { players: readonly Player[]; ratings: ReadonlyMap<string, ReadonlyMap<string, Rating>> } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private generation = 0;
  delayMs = SCOUT_SYNC_DELAY_MS;

  constructor() {
    // Nur der Trainer pflegt die Scout-Ansicht; bei Abmeldung oder Rollenwechsel sofort aufhören.
    effect(() => {
      if (this.session.role() !== 'trainer') this.stop();
    });
  }

  /** Neuer vollständiger Stand aus Kader und Bewertungen (vom TeamService, wenn alles geladen ist). */
  update(players: readonly Player[], ratings: ReadonlyMap<string, ReadonlyMap<string, Rating>>): void {
    if (this.session.role() !== 'trainer') return;
    this.latest = { players, ratings };
    this.watch();
    this.schedule();
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.opening = false;
    this.existing = null;
    this.latest = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private watch(): void {
    if (this.unsubscribe || this.opening) return;
    this.opening = true;
    const generation = this.generation;
    this.api
      .watchScoutProfiles(
        (docs) => {
          if (generation !== this.generation) return;
          this.existing = Object.fromEntries(docs.map((entry) => [entry.id, entry.data]));
          this.schedule();
        },
        (error) => console.warn('Scout-Ansicht konnte nicht gelesen werden', error),
      )
      .then((unsubscribe) => {
        this.opening = false;
        if (generation !== this.generation) unsubscribe();
        else this.unsubscribe = unsubscribe;
      })
      .catch((error) => {
        this.opening = false;
        console.warn('Scout-Ansicht konnte nicht gelesen werden', error);
      });
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.delayMs);
  }

  private async run(): Promise<void> {
    if (!this.latest || !this.existing || this.session.role() !== 'trainer') return;
    if (this.running) {
      this.schedule();
      return;
    }
    this.running = true;
    try {
      const { set, remove } = scoutProfileWrites(buildScoutProfiles(this.latest.players, this.latest.ratings), this.existing);
      await this.api.applyScoutProfiles(
        set.map(([id, profile]) => [id, profile as unknown as Readonly<Record<string, unknown>>] as const),
        remove,
      );
    } catch (error) {
      console.warn('Scout-Ansicht konnte nicht abgeglichen werden', error);
    } finally {
      this.running = false;
    }
  }
}
