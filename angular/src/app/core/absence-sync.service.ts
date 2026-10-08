import { Injectable, inject } from '@angular/core';
import { authErrorMessage, errorCode } from './auth-errors';
import { type TeamEvent } from './event';
import { FirebaseService } from './firebase.service';
import { type Player } from './player';
import { docFromRating, ratingFromDoc } from './rating';
import { absenceFromDoc, autoAbsenceRating, unavailabilityReason } from './records';
import { SessionService } from './session.service';
import { SyncService } from './sync.service';

/**
 * Belegt „Fehlt“ in Event-Bewertungen automatisch vor (Regel aus SCRUM-18), wenn sich ein Event oder ein Spieler
 * ändert: ein neues Event oder ein neues Datum prüft alle Spieler, ein geänderter Spieler (Status, „verletzt bis“)
 * prüft alle Events. Nur unbearbeitete Bewertungen werden vorbelegt, nur markierte Einträge zurückgesetzt, von Hand
 * gesetzte bleiben (siehe `autoAbsenceRating`). Liest die Daten einmalig, hält also keine eigenen Abos.
 */
@Injectable({ providedIn: 'root' })
export class AbsenceSyncService {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  /** Neues oder verschobenes Event: für alle Spieler prüfen. Rückgabe: Anzahl geänderter Bewertungen. */
  async reconcileEvent(event: TeamEvent, players: readonly Player[]): Promise<number> {
    if (this.session.role() !== 'trainer' || !event.date) return 0;
    const results = await Promise.all(players.map((player) => this.reconcileOne(event, player)));
    return results.reduce((sum, changed) => sum + changed, 0);
  }

  /** Geänderter Spieler: für alle Events dieses Spielers prüfen. */
  async reconcilePlayer(player: Player, events: readonly TeamEvent[]): Promise<number> {
    if (this.session.role() !== 'trainer') return 0;
    const results = await Promise.all(events.filter((event) => event.date).map((event) => this.reconcileOne(event, player)));
    return results.reduce((sum, changed) => sum + changed, 0);
  }

  private async reconcileOne(event: TeamEvent, player: Player): Promise<number> {
    try {
      const [absenceDocs, ratingDoc] = await Promise.all([
        this.firebase.readPlayerRecords(player.id, 'absences'),
        this.firebase.readRatingDoc(event.id, player.id),
      ]);
      const absences = absenceDocs.map((entry) => absenceFromDoc(entry.id, entry.data));
      const existing = ratingDoc ? ratingFromDoc(ratingDoc) : null;
      const next = autoAbsenceRating(existing, unavailabilityReason(player, absences, event.date));
      if (!next) return 0;
      await this.firebase.saveRating(event.id, player.id, docFromRating(next, { clearAuto: true }));
      return 1;
    } catch (error) {
      console.error(error);
      this.sync.fail(`Abwesenheit konnte nicht in die Bewertung übernommen werden. ${authErrorMessage(errorCode(error))}`);
      return 0;
    }
  }
}
