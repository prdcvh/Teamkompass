import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { PlanningApi } from '../firebase/planning.api';
import { SyncService } from '../shell/sync.service';
import { type PlanningBreak, breaksFromDoc } from './breaks';

export type BreaksLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Pausen des Teams (SCRUM-150): das Dokument `meta/breaks`, das jedes Teammitglied lesen darf (Trainer und Spieler sehen
 * den Pausen-Hinweis). Die Serien bleiben im Dokument `meta/planning`, das nur Trainer lesen. Geschrieben wird nur vom
 * Trainer über {@link BreaksService}. Das Abo startet erst nach der Anmeldung und endet mit dem Abmelden. Schlägt das
 * Lesen fehl, bleibt der Hinweis einfach weg (kein Dialog, keine Meldung); die Planungsseite des Trainers zeigt den Fehler.
 */
@Injectable({ providedIn: 'root' })
export class BreaksStore {
  private readonly api = inject(PlanningApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  private readonly stored = signal<Readonly<Record<string, unknown>> | null>(null);
  readonly load = signal<BreaksLoad>('idle');
  readonly breaks = computed<readonly PlanningBreak[]>(() => breaksFromDoc(this.stored()));

  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor() {
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  start(): void {
    if (this.unsubscribe || this.load() === 'loading' || this.session.role() === null) return;
    const generation = ++this.generation;
    this.load.set('loading');
    this.api
      .watchBreaks(
        (data, meta) => {
          if (generation !== this.generation) return;
          this.stored.set(data);
          this.load.set('ready');
          // Der Synchronisierungsstatus gehört dem Trainer (er schreibt); bei Spielern bleibt er unberührt.
          if (this.session.role() === 'trainer') this.sync.applySnapshot(meta);
        },
        (error) => {
          if (generation === this.generation) this.failLoad(error);
        },
      )
      .then((unsubscribe) => {
        if (generation !== this.generation || this.load() === 'error') unsubscribe();
        else this.unsubscribe = unsubscribe;
      })
      .catch((error) => {
        if (generation === this.generation) this.failLoad(error);
      });
  }

  retry(): void {
    this.stop();
    this.start();
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stored.set(null);
    this.load.set('idle');
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.load.set('error');
  }
}
