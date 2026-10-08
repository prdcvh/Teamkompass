import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from './auth-errors';
import { type EventDraft, type EventErrors, type TeamEvent, docFromEvent, eventFromDoc, eventFromDraft, validateDraft } from './event';
import { AbsenceSyncService } from './absence-sync.service';
import { FirebaseService } from './firebase.service';
import { SessionService } from './session.service';
import { SquadService } from './squad.service';
import { SyncService } from './sync.service';

export type EventsLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Events des Teams: hält die Events im Speicher, folgt der Datenbank in Echtzeit und schreibt
 * Änderungen. Schreiben darf nur der Trainer (die Regeln erzwingen es zusätzlich serverseitig).
 * Beim Abmelden werden Abo und Daten sofort verworfen. Den Sync-Status teilt sich der Dienst mit
 * dem Kader; er setzt ihn nicht zurück, weil das den Kader-Zustand überschreiben würde.
 */
@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly absences = inject(AbsenceSyncService);
  private readonly squad = inject(SquadService);

  readonly events = signal<readonly TeamEvent[]>([]);
  readonly load = signal<EventsLoad>('idle');
  readonly error = signal('');
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly canEdit = computed(() => this.canWrite() && this.load() === 'ready');

  private unsubscribe: (() => void) | null = null;
  private waiters: (() => void)[] = [];
  /** Erhöht bei jedem start/stop, damit ein spät eintreffendes Abo eines alten Laufs verworfen wird. */
  private generation = 0;

  constructor() {
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  /** Startet das Echtzeit-Abo (mehrfacher Aufruf ist harmlos). */
  start(): void {
    if (this.unsubscribe || this.load() === 'loading') return;
    const generation = ++this.generation;
    this.load.set('loading');
    this.error.set('');
    this.firebase
      .watchEvents(
        (docs, meta) => {
          if (generation !== this.generation) return;
          this.events.set(docs.map((entry) => eventFromDoc(entry.id, entry.data)));
          this.load.set('ready');
          this.flushWaiters();
          this.sync.applySnapshot(meta);
        },
        (error) => {
          if (generation !== this.generation) return;
          this.failLoad(error);
        },
      )
      .then((unsubscribe) => {
        // Wurde inzwischen gestoppt oder ist das Abo schon fehlgeschlagen, wird es sofort wieder beendet.
        if (generation !== this.generation || this.load() === 'error') unsubscribe();
        else this.unsubscribe = unsubscribe;
      })
      .catch((error) => {
        if (generation === this.generation) this.failLoad(error);
      });
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.events.set([]);
    this.load.set('idle');
    this.error.set('');
    this.flushWaiters();
  }

  /** Startet das Abo (falls nötig) und liefert die Events, sobald sie geladen sind; bei Fehler oder Abbruch leer. */
  async whenLoaded(): Promise<readonly TeamEvent[]> {
    this.start();
    if (this.load() === 'loading') await new Promise<void>((resolve) => this.waiters.push(resolve));
    return this.load() === 'ready' ? this.events() : [];
  }

  private flushWaiters(): void {
    const waiting = this.waiters;
    this.waiters = [];
    waiting.forEach((resolve) => resolve());
  }

  /**
   * Prüft die Eingaben und löst das Speichern aus. Bei Fehlern in den Eingaben kommen sie zurück
   * und es wird nichts geschrieben. Die Änderung ist durch das Abo sofort sichtbar (auch offline);
   * das Ergebnis der Cloud zeigt der Sync-Status.
   */
  save(draft: EventDraft): EventErrors {
    if (!this.canWrite()) return { title: 'Nur Trainer dürfen Events ändern.' };
    if (this.load() !== 'ready') return { title: 'Die Events sind noch nicht geladen. Bitte kurz warten und erneut versuchen.' };
    const errors = validateDraft(draft);
    if (Object.keys(errors).length > 0) return errors;
    const id = draft.id ?? `e${crypto.randomUUID()}`;
    const event = eventFromDraft(draft, id);
    const previous = this.events().find((entry) => entry.id === id);
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    void this.firebase
      .saveEvent(id, docFromEvent(event))
      .then(() => this.sync.clearError())
      // Neues Event oder neues Datum: Spieler mit Abwesenheit im Zeitraum automatisch auf „Fehlt“ setzen (SCRUM-80).
      .then(() => (!previous || previous.date !== event.date ? this.absences.reconcileEvent(event, this.squad.players()) : 0))
      .catch((error) => this.failWrite(error, `„${event.title}“ konnte nicht gespeichert werden.`));
    return {};
  }

  /** Löscht das Event (inkl. Bewertungen und internen Notizen). Rückgabe: erfolgreich? */
  async remove(id: string): Promise<boolean> {
    if (!this.canEdit()) return false;
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    try {
      await this.firebase.deleteEvent(id);
      this.sync.clearError();
      return true;
    } catch (error) {
      this.failWrite(error, 'Event konnte nicht vollständig gelöscht werden.');
      return false;
    }
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null; // erlaubt „Erneut versuchen“
    this.load.set('error');
    this.flushWaiters();
    this.error.set(`Die Events konnten nicht geladen werden. ${authErrorMessage(errorCode(error))}`);
    this.sync.fail('Laden fehlgeschlagen');
  }

  private failWrite(error: unknown, text: string): void {
    console.error(error);
    this.sync.fail(`${text} ${authErrorMessage(errorCode(error))}`);
  }
}
