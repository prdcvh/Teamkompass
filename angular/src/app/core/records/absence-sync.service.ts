import { Injectable, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { type TeamEvent } from '../events/event';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { RatingsApi } from '../firebase/ratings.api';
import type { Player } from '../player/player';
import { hidesHealthReason, mayStoreHealth } from '../player/consent';
import { CurrentTeam } from '../team/current-team.service';
import { type Rating, docFromRating, ratingFromDoc } from '../ratings/rating';
import { type Absence, absenceFromDoc } from './absence';
import { autoAbsenceRating, keepPastOpenInjury, unavailabilityReason } from './availability';
import { NEUTRAL_ABSENCE_NOTE } from './health-reasons';
import { SessionService } from '../auth/session.service';
import { SyncService } from '../shell/sync.service';

export interface ReconcilePlayerOptions {
  /** Schon bekannte Abwesenheiten des Spielers (z. B. gerade gespeichert); sonst werden sie einmal gelesen. */
  readonly absences?: readonly Absence[];
  /**
   * Termine vor diesem Tag (ISO-Datum) werden nicht angefasst: Der Status „Verletzt“ ohne Datum wirkt nur nach vorn.
   * Leer = alle Termine prüfen.
   */
  readonly pastBefore?: string;
  /**
   * Der Status „Verletzt“ ohne Datum wurde zurückgenommen: Termine vor `pastBefore` behalten ihr automatisch gesetztes
   * „Fehlt“ dauerhaft (siehe `keepPastOpenInjury`), nur künftige werden zurückgesetzt.
   */
  readonly keepPastOpenInjury?: boolean;
}

/**
 * Belegt „Fehlt“ in Event-Bewertungen automatisch vor (Regel aus SCRUM-18), wenn sich ein Event oder ein Spieler
 * ändert: neue Events oder ein neues Datum prüfen alle Spieler, ein geänderter Spieler (Status, „verletzt bis“,
 * Abwesenheiten) prüft alle Events. Nur unbearbeitete Bewertungen werden vorbelegt, nur markierte Einträge
 * zurückgesetzt, von Hand gesetzte bleiben (siehe `autoAbsenceRating`). Liest die Daten einmalig, hält also keine
 * eigenen Abos; die Abwesenheiten je Spieler werden dabei nur einmal gelesen (SCRUM-159).
 */
@Injectable({ providedIn: 'root' })
export class AbsenceSyncService {
  private readonly playerRecordsApi = inject(PlayerRecordsApi);
  private readonly ratingsApi = inject(RatingsApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly team = inject(CurrentTeam);

  /**
   * Spieler, bei denen ein automatisches „Fehlt“ mit Grund übersprungen wurde, weil in einem fremden Verein die
   * dokumentierte Einwilligung fehlt (SCRUM-245). Kein Fehler – der Trainer bekommt nur einen Hinweis.
   */
  readonly lockedSkips = signal<readonly { readonly id: string; readonly name: string }[]>([]);

  /** Dürfen für den Spieler Gesundheitsdaten (auch als Grund in der Bewertung) gespeichert werden? */
  mayStore(player: Player): boolean {
    return mayStoreHealth(player, this.team.id());
  }

  /**
   * Grund für „Fehlt“ in der Rückmeldung: wie berechnet; bei widerrufener Einwilligung nur „Fehlt“ ohne Grund (SCRUM-248);
   * 'skip', wenn in einem fremden Verein die Einwilligung fehlt (dann Hinweis merken, SCRUM-245).
   */
  allowedReason(player: Player, reason: string | null): string | null | 'skip' {
    if (!reason) return reason;
    if (mayStoreHealth(player, this.team.id())) return hidesHealthReason(player) ? NEUTRAL_ABSENCE_NOTE : reason;
    if (!this.lockedSkips().some((entry) => entry.id === player.id)) this.lockedSkips.update((list) => [...list, { id: player.id, name: player.name }]);
    return 'skip';
  }

  /** Neues oder verschobenes Event: für alle Spieler prüfen. Rückgabe: Anzahl geänderter Bewertungen. */
  reconcileEvent(event: TeamEvent, players: readonly Player[]): Promise<number> {
    return this.reconcileEvents([event], players);
  }

  /**
   * Mehrere Events für alle Spieler prüfen, z. B. frisch angelegte Serien-Trainings. Mit `fresh` (gerade neu angelegt,
   * es kann noch keine automatisch gesetzte Bewertung geben) wird eine Bewertung nur gelesen, wenn der Spieler an
   * dem Tag fehlt; so bleiben es auch bei vielen Terminen wenige Lesezugriffe.
   */
  async reconcileEvents(events: readonly TeamEvent[], players: readonly Player[], options: { readonly fresh?: boolean } = {}): Promise<number> {
    const dated = events.filter((event) => event.date);
    if (this.session.role() !== 'trainer' || dated.length === 0 || players.length === 0) return 0;
    const results = await Promise.all(
      players.map(async (player) => {
        const absences = await this.readAbsences(player);
        if (!absences) return 0;
        const changed = await Promise.all(
          dated.map((event) => {
            const reason = this.allowedReason(player, unavailabilityReason(player, absences, event.date));
            if (reason === 'skip' || (!reason && options.fresh)) return 0;
            return this.apply(event, player, (existing) => autoAbsenceRating(existing, reason));
          }),
        );
        return sum(changed);
      }),
    );
    return sum(results);
  }

  /** Geänderter Spieler (Status, „verletzt bis“ oder Abwesenheiten): für alle Events dieses Spielers prüfen. */
  async reconcilePlayer(player: Player, events: readonly TeamEvent[], options: ReconcilePlayerOptions = {}): Promise<number> {
    if (this.session.role() !== 'trainer') return 0;
    const absences = options.absences ?? (await this.readAbsences(player));
    if (!absences) return 0;
    const pastBefore = options.pastBefore ?? '';
    const changed = await Promise.all(
      events
        .filter((event) => event.date)
        .map((event) => {
          if (pastBefore && event.date < pastBefore) {
            if (!options.keepPastOpenInjury) return 0;
            const covered = !!unavailabilityReason(player, absences, event.date);
            return this.apply(event, player, (existing) => keepPastOpenInjury(existing, covered));
          }
          const reason = this.allowedReason(player, unavailabilityReason(player, absences, event.date));
          if (reason === 'skip') return 0;
          return this.apply(event, player, (existing) => autoAbsenceRating(existing, reason));
        }),
    );
    return sum(changed);
  }

  private async readAbsences(player: Player): Promise<readonly Absence[] | null> {
    try {
      const docs = await this.playerRecordsApi.readPlayerRecords(player.id, 'absences');
      return docs.map((entry) => absenceFromDoc(entry.id, entry.data));
    } catch (error) {
      this.fail(error);
      return null;
    }
  }

  /** Liest die Bewertung, berechnet die neue und schreibt sie, falls sich etwas ändert. Rückgabe: 1 = geändert. */
  private async apply(event: TeamEvent, player: Player, decide: (existing: Rating | null) => Rating | null): Promise<number> {
    try {
      const ratingDoc = await this.ratingsApi.readRatingDoc(event.id, player.id);
      const next = decide(ratingDoc ? ratingFromDoc(ratingDoc) : null);
      if (!next) return 0;
      await this.ratingsApi.saveRating(event.id, player.id, docFromRating(next, { clearAuto: true }));
      return 1;
    } catch (error) {
      this.fail(error);
      return 0;
    }
  }

  private fail(error: unknown): void {
    console.error(error);
    this.sync.fail(`Abwesenheit konnte nicht in die Bewertung übernommen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
