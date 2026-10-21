import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { type EventDraft, type EventErrors, type TeamEvent, docFromEvent, eventFromDoc, eventFromDraft, validateDraft } from './event';
import { AbsenceSyncService } from '../records/absence-sync.service';
import { EventsApi } from '../firebase/events.api';
import { LineupApi } from '../firebase/lineup.api';
import { PlanningApi } from '../firebase/planning.api';
import { parseSeriesEventId } from '../planning/series-events';
import { SessionService } from '../auth/session.service';
import { seasonStartIso } from '../shared/season';
import { SquadService } from '../player/squad.service';
import { SyncService } from '../shell/sync.service';

export type EventsLoad = 'idle' | 'loading' | 'ready' | 'error';

/** season: nur Events ab Beginn der laufenden Saison (Standard, spart Lesezugriffe); all: alle Saisons. */
export type EventsScope = 'season' | 'all';

/**
 * Events des Teams: hält die Events im Speicher, folgt der Datenbank in Echtzeit und schreibt
 * Änderungen. Schreiben darf nur der Trainer (die Regeln erzwingen es zusätzlich serverseitig).
 * Beim Abmelden werden Abo und Daten sofort verworfen. Den Sync-Status teilt sich der Dienst mit
 * dem Kader; er setzt ihn nicht zurück, weil das den Kader-Zustand überschreiben würde.
 * Standardmäßig werden nur Events ab Saisonbeginn (1. Juli) geladen, weil Firestore jeden gelesenen Datensatz zählt
 * (SCRUM-199); ältere Saisons und alles für Export/Sicherung holt {@link showAllSeasons}.
 */
@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly eventsApi = inject(EventsApi);
  private readonly planningApi = inject(PlanningApi);
  private readonly lineupApi = inject(LineupApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly absences = inject(AbsenceSyncService);
  private readonly squad = inject(SquadService);

  readonly events = signal<readonly TeamEvent[]>([]);
  readonly load = signal<EventsLoad>('idle');
  readonly error = signal('');
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly canEdit = computed(() => this.canWrite() && this.load() === 'ready');

  readonly scope = signal<EventsScope>('season');
  /** Erster Tag der laufenden Saison, festgehalten beim (Neu-)Start des Abos. */
  readonly seasonStart = signal(seasonStartIso());

  private unsubscribe: (() => void) | null = null;
  private waiters: (() => void)[] = [];
  /** Erhöht bei jedem start/stop, damit ein spät eintreffendes Abo eines alten Laufs verworfen wird. */
  private generation = 0;

  constructor() {
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) {
        this.scope.set('season');
        this.stop();
      }
    });
  }

  /** Startet das Echtzeit-Abo (mehrfacher Aufruf ist harmlos). */
  start(): void {
    if (this.unsubscribe || this.load() === 'loading') return;
    const generation = ++this.generation;
    this.load.set('loading');
    this.error.set('');
    this.seasonStart.set(seasonStartIso());
    this.eventsApi
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
        this.scope() === 'all' ? null : this.seasonStart(),
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

  /** Lädt zusätzlich alle älteren Saisons (Saison-Auswahl, Export/Sicherung). Die Liste bleibt dabei stehen. */
  showAllSeasons(): void {
    this.switchScope('all');
  }

  /** Zurück zur laufenden Saison (spart Lesezugriffe, wenn die älteren nicht mehr gebraucht werden). */
  showCurrentSeason(): void {
    this.switchScope('season');
  }

  private switchScope(scope: EventsScope): void {
    if (this.scope() === scope) return;
    this.scope.set(scope);
    if (!this.unsubscribe && this.load() !== 'loading') return; // läuft noch nicht: gilt beim nächsten Start
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.load.set('idle');
    this.start();
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
    // Ein Event vor dem Saisonbeginn würde sonst gleich nach dem Speichern aus der Liste verschwinden.
    if (event.date < this.seasonStart()) this.showAllSeasons();
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    // Serien-Training (SCRUM-147): Wird es einzeln geändert, merken wir das; die Serie überschreibt es dann nie mehr.
    const edited = previous !== undefined && parseSeriesEventId(id) !== null && JSON.stringify(docFromEvent(previous)) !== JSON.stringify(docFromEvent(event));
    void this.eventsApi
      .saveEvent(id, edited ? { ...docFromEvent(event), seriesEdited: true } : docFromEvent(event))
      .then(() => this.sync.clearError())
      // Neues Event oder neues Datum: Spieler mit Abwesenheit im Zeitraum automatisch auf „Fehlt“ setzen (SCRUM-80).
      .then(() => (!previous || previous.date !== event.date ? this.absences.reconcileEvent(event, this.squad.players()) : 0))
      .catch((error) => this.failWrite(error, `„${event.title}“ konnte nicht gespeichert werden.`));
    return {};
  }

  /** Löscht das Event (inkl. Bewertungen, internen Notizen und der gespeicherten Aufstellung). Rückgabe: erfolgreich? */
  async remove(id: string): Promise<boolean> {
    if (!this.canEdit()) return false;
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    try {
      // Serien-Training (SCRUM-146): zuerst den Merker setzen, damit es bei der nächsten Serien-Speicherung nicht
      // neu entsteht. Scheitert das Löschen danach, ist der Merker harmlos (das Event existiert ja noch).
      const fromSeries = parseSeriesEventId(id);
      if (fromSeries) await this.planningApi.markSkipped(fromSeries.seriesId, fromSeries.date);
      await this.eventsApi.deleteEvent(id);
      await this.lineupApi.deleteEventLineup(id); // gespeicherte Aufstellung des Spiels (SCRUM-128)
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
