import { Injectable, Injector, computed, effect, inject, signal } from '@angular/core';
import { AbsenceSyncService } from '../records/absence-sync.service';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { PlayersApi } from '../firebase/players.api';
import type { SnapshotMeta } from '../firebase/types';
import { CurrentTeam } from '../team/current-team.service';
import { hasHealthFields, healthLockedMessage, requiresDocumentedConsent } from './consent';
import { type Player, type PlayerDraft, type PlayerErrors, playerFromCard, playerFromDoc, playerFromDraft, docFromPlayer, validateDraft } from './player';
import { EventsService } from '../events/events.service';
import { isOpenInjury } from '../records/availability';
import { todayIso } from '../shared/dates';
import { SessionService } from '../auth/session.service';
import { SyncService } from '../shell/sync.service';

export type SquadLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Kader des Teams: hält die Spieler im Speicher, folgt der Datenbank in Echtzeit und schreibt
 * Änderungen. Schreiben darf nur der Trainer (die Regeln erzwingen es zusätzlich serverseitig).
 * Beim Abmelden werden Abo und Daten sofort verworfen.
 */
@Injectable({ providedIn: 'root' })
export class SquadService {
  private readonly playersApi = inject(PlayersApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly absences = inject(AbsenceSyncService);
  private readonly team = inject(CurrentTeam);
  // EventsService hängt selbst vom Kader ab: erst beim Gebrauch holen, sonst gäbe es einen Zirkelbezug.
  private readonly injector = inject(Injector);

  readonly players = signal<readonly Player[]>([]);
  readonly load = signal<SquadLoad>('idle');
  readonly error = signal('');
  /** Trainer: Spielerdokumente ohne Feld `consentStatus` (ältere Daten). Ohne das Feld fehlen sie in der Medizin-Liste (SCRUM-245). */
  readonly missingConsent = signal<readonly string[]>([]);
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  /** Anlegen/Ändern erst, wenn der ganze Kader da ist – sonst ließe sich die Rückennummern-Prüfung umgehen. */
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

  /**
   * Startet das Echtzeit-Abo (mehrfacher Aufruf ist harmlos). Spieler und Eltern dürfen die Spielerliste nicht
   * abfragen: für sie besteht der „Kader“ nur aus dem eigenen Spielerdokument (Regeln: `isPlayerFor`).
   */
  start(): void {
    // Auch „ready“ ohne Abmeldefunktion zählt als laufend: die ersten Daten können vor dem Abo-Handle ankommen (SCRUM-205).
    if (this.unsubscribe || this.load() === 'loading' || this.load() === 'ready') return;
    const generation = ++this.generation;
    this.sync.clearError();
    this.load.set('loading');
    this.error.set('');
    const onData = (players: readonly Player[], meta: SnapshotMeta) => {
      if (generation !== this.generation) return;
      this.players.set(players);
      this.load.set('ready');
      this.flushWaiters();
      this.sync.applySnapshot(meta);
    };
    const onError = (error: unknown) => {
      if (generation !== this.generation) return;
      this.failLoad(error);
    };
    const role = this.session.role();
    const ownId = this.session.playerId();
    const subscription =
      role === 'player' || role === 'parent'
        ? ownId
          ? this.watchOwn(ownId, onData, onError)
          : Promise.reject(new Error('Kein Spielerprofil verknüpft'))
        : this.playersApi.watchPlayers(
            (docs, meta) => {
              if (role === 'trainer' && generation === this.generation) {
                this.missingConsent.set(docs.filter((entry) => typeof entry.data['consentStatus'] !== 'string').map((entry) => entry.id));
              }
              onData(docs.map((entry) => playerFromDoc(entry.id, entry.data)), meta);
            },
            onError,
            // Medizin sieht Spieler mit widerrufener Einwilligung nicht (SCRUM-245, Regeln: players list).
            { withoutRevokedConsent: role === 'physio' },
          );
    subscription
      .then((unsubscribe) => {
        // Wurde inzwischen gestoppt oder ist das Abo schon fehlgeschlagen, wird es sofort wieder beendet.
        if (generation !== this.generation || this.load() === 'error') unsubscribe();
        else this.unsubscribe = unsubscribe;
      })
      .catch((error) => {
        if (generation === this.generation) this.failLoad(error);
      });
  }

  /**
   * Spieler/Eltern: das eigene Spielerdokument. Sperren die Regeln es (widerrufene Einwilligung, SCRUM-245), kommt die
   * bereinigte Karte ohne Gesundheitsangaben. Verschwindet die Karte wieder (Einwilligung nicht mehr widerrufen), wird
   * einmal erneut das Spielerdokument versucht.
   */
  private async watchOwn(
    ownId: string,
    onData: (players: readonly Player[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    let stopped = false;
    let stopDoc: (() => void) | null = null;
    let stopCard: (() => void) | null = null;
    let sawCard = false;
    const openDoc = async (): Promise<void> => {
      const unsubscribe = await this.playersApi.watchPlayerDoc(ownId, (data, meta) => onData(data ? [playerFromDoc(ownId, data)] : [], meta), (error) => {
        if (stopped) return;
        if (errorCode(error) === 'permission-denied' && !stopCard) void openCard(error).catch(onError);
        else onError(error);
      });
      if (stopped) unsubscribe();
      else stopDoc = unsubscribe;
    };
    const openCard = async (denied: unknown): Promise<void> => {
      sawCard = false;
      const unsubscribe = await this.playersApi.watchPlayerCard(
        ownId,
        (data, meta) => {
          if (stopped) return;
          if (data) {
            sawCard = true;
            onData([playerFromCard(ownId, data)], meta);
            return;
          }
          // Keine Karte: der Grund der Sperre ist nicht die Einwilligung (oder der Trainer hat noch nicht abgeglichen).
          if (!sawCard) {
            onError(denied);
            return;
          }
          // Karte gelöscht: Einwilligung wieder offen/dokumentiert – zurück zum Spielerdokument.
          stopCard?.();
          stopCard = null;
          void openDoc().catch(onError);
        },
        onError,
      );
      if (stopped) unsubscribe();
      else stopCard = unsubscribe;
    };
    await openDoc();
    return () => {
      stopped = true;
      stopDoc?.();
      stopCard?.();
    };
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.missingConsent.set([]);
    this.players.set([]);
    this.load.set('idle');
    this.error.set('');
    this.sync.reset();
    this.flushWaiters();
  }

  /** Startet das Abo (falls nötig) und liefert die Spieler, sobald sie geladen sind; bei Fehler oder Abbruch leer. */
  async whenLoaded(): Promise<readonly Player[]> {
    this.start();
    if (this.load() === 'loading') await new Promise<void>((resolve) => this.waiters.push(resolve));
    return this.load() === 'ready' ? this.players() : [];
  }

  private flushWaiters(): void {
    const waiting = this.waiters;
    this.waiters = [];
    waiting.forEach((resolve) => resolve());
  }

  /**
   * Prüft die Eingaben und löst das Speichern aus. Bei Fehlern in den Eingaben kommen sie
   * zurück und es wird nichts geschrieben. Das Ergebnis der Cloud zeigt der Sync-Status; die
   * Änderung ist durch das Abo sofort sichtbar (auch offline), deshalb wird nicht darauf gewartet.
   */
  save(draft: PlayerDraft): PlayerErrors {
    if (!this.canWrite()) return { name: 'Nur Trainer dürfen Spieler ändern.' };
    if (this.load() !== 'ready') return { name: 'Der Kader ist noch nicht geladen. Bitte kurz warten und erneut versuchen.' };
    const errors: PlayerErrors = validateDraft(draft, this.players());
    // Fremde Vereine (SCRUM-245): Gesundheitsangaben nur mit dokumentierter Einwilligung (die Regeln sperren es sonst).
    if (requiresDocumentedConsent(this.team.id()) && draft.consentStatus !== 'granted' && hasHealthFields({ status: draft.status, injuryUntil: draft.injuryUntil, injuredSince: '' })) {
      errors.status = healthLockedMessage(draft.name.trim() || 'diesen Spieler');
    }
    if (Object.keys(errors).length > 0) return errors;
    const id = draft.id ?? `p${crypto.randomUUID()}`;
    const previous = this.players().find((entry) => entry.id === id);
    const now = new Date();
    const today = todayIso(now);
    let player = playerFromDraft(draft, id, previous ?? null, now);
    // Neu „dokumentiert“: Datum (falls leer) und wer es eingetragen hat festhalten (die Regeln verlangen die eigene UID).
    if (player.consentStatus === 'granted' && previous?.consentStatus !== 'granted') {
      player = { ...player, consentDate: player.consentDate || today, consentBy: this.session.email() ?? '', consentByUid: this.session.uid() ?? '' };
    }
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    void this.playersApi
      .savePlayer(id, docFromPlayer(player))
      .then(() => this.sync.clearError())
      // Status, „verletzt bis“ oder „verletzt seit“ geändert: Events dieses Spielers automatisch abgleichen (SCRUM-80).
      // Der Status „Verletzt“ ohne Datum wirkt nur ab heute; vergangene Termine behalten ihr „Fehlt“ (SCRUM-164).
      .then(async () => {
        const changed = previous
          ? previous.status !== player.status || previous.injuryUntil !== player.injuryUntil || previous.injuredSince !== player.injuredSince
          : player.status === 'Verletzt';
        if (!changed) return;
        const wasOpen = isOpenInjury(previous);
        const open = isOpenInjury(player);
        const events = await this.injector.get(EventsService).whenLoaded();
        await this.absences.reconcilePlayer(player, events, wasOpen || open ? { pastBefore: today, keepPastOpenInjury: wasOpen && !open } : {});
      })
      .catch((error) => this.failWrite(error, `„${player.name}“ konnte nicht gespeichert werden.`));
    return {};
  }

  /** Löscht den Spieler (inkl. Bewertungen). Rückgabe: erfolgreich? */
  async remove(id: string): Promise<boolean> {
    if (!this.canEdit()) return false;
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    try {
      await this.playersApi.deletePlayer(id);
      this.sync.clearError();
      return true;
    } catch (error) {
      this.failWrite(error, 'Spieler konnte nicht vollständig gelöscht werden.');
      return false;
    }
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null; // erlaubt „Erneut versuchen“
    this.load.set('error');
    this.flushWaiters();
    this.error.set(`Der Kader konnte nicht geladen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
    this.sync.fail('Laden fehlgeschlagen', 'load');
  }

  private failWrite(error: unknown, text: string): void {
    console.error(error);
    this.sync.fail(`${text} ${authErrorMessage(errorCode(error), this.session.role())}`);
  }
}
