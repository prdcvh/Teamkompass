import { Injectable, inject } from '@angular/core';
import { EventsService } from '../events/events.service';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { RatingsApi } from '../firebase/ratings.api';
import { ProfileService } from '../profile/profile.service';
import { docFromRating } from '../ratings/rating';
import { SquadService } from '../player/squad.service';
import { type Absence, type AbsenceDraft, type AbsenceErrors, absenceFromDraft, docFromAbsence, validateAbsence } from './absence';
import { AbsenceSyncService } from './absence-sync.service';
import { autoAbsenceRating, unavailabilityReason } from './availability';
import { RecordsStateService } from './records-state.service';

/**
 * Abwesenheiten und Verletzungen des geladenen Spielers schreiben (nur Trainer). Eine geänderte oder gelöschte
 * Abwesenheit gleicht die automatisch gesetzten „Fehlt“-Einträge der Events ab (SCRUM-18).
 */
@Injectable({ providedIn: 'root' })
export class AbsencesService {
  private readonly playerRecordsApi = inject(PlayerRecordsApi);
  private readonly ratingsApi = inject(RatingsApi);
  private readonly squad = inject(SquadService);
  private readonly profile = inject(ProfileService);
  private readonly state = inject(RecordsStateService);
  private readonly events = inject(EventsService);
  private readonly absenceSync = inject(AbsenceSyncService);

  readonly absences = this.state.absences.asReadonly();

  saveAbsence(draft: AbsenceDraft): AbsenceErrors {
    const playerId = this.state.writablePlayer();
    if (!playerId) return { reason: 'Nur Trainer dürfen Abwesenheiten ändern.' };
    const errors = validateAbsence(draft);
    if (Object.keys(errors).length > 0) return errors;
    const id = draft.id ?? `ab${crypto.randomUUID()}`;
    const absence = absenceFromDraft(draft, id);
    const next = [...this.state.absences().filter((item) => item.id !== id), absence];
    this.state.absences.set(next);
    this.state.write('Abwesenheit konnte nicht gespeichert werden.', () => this.playerRecordsApi.savePlayerRecord(playerId, 'absences', id, docFromAbsence(absence)));
    void this.reconcileAbsences(playerId, next);
    return {};
  }

  async deleteAbsence(id: string): Promise<boolean> {
    const playerId = this.state.writablePlayer();
    const ok = await this.state.remove('absences', id, 'Abwesenheit konnte nicht gelöscht werden.', (list) => this.state.absences.set(list as Absence[]), this.state.absences());
    if (ok && playerId) void this.reconcileAbsences(playerId, this.state.absences());
    return ok;
  }

  /**
   * Gleicht die Bewertungen aller Events dieses Spielers mit den Abwesenheiten ab: fehlende Spieler werden vorbelegt,
   * gelöschte oder verkürzte Abwesenheiten setzen automatisch gesetzte „Fehlt“-Einträge zurück. Sind die Bewertungen
   * des Profils schon geladen, wird mit ihnen gerechnet; sonst (Profil lädt noch oder hatte einen Fehler) liest der
   * Abgleich jede Bewertung einzeln aus der Datenbank, damit nichts Unbekanntes überschrieben wird und trotzdem nichts
   * verloren geht (SCRUM-164). Rückgabe: Anzahl geänderter Bewertungen.
   */
  async reconcileAbsences(playerId: string, absences: readonly Absence[]): Promise<number> {
    const player = (await this.squad.whenLoaded()).find((entry) => entry.id === playerId);
    if (!player) return 0;
    if (this.profile.playerId() !== playerId || this.profile.loading() || this.profile.error()) {
      return this.absenceSync.reconcilePlayer(player, await this.events.whenLoaded(), { absences });
    }
    let changed = 0;
    for (const { event, rating } of this.profile.items()) {
      const next = autoAbsenceRating(rating, unavailabilityReason(player, absences, event.date));
      if (!next) continue;
      changed += 1;
      this.state.write('Abwesenheit konnte nicht in die Event-Bewertung übernommen werden.', () =>
        this.ratingsApi.saveRating(event.id, playerId, docFromRating(next, { clearAuto: true })),
      );
    }
    return changed;
  }
}
