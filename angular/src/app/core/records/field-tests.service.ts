import { Injectable, computed, inject } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { mayStoreHealth } from '../player/consent';
import type { Player } from '../player/player';
import { SquadService } from '../player/squad.service';
import { todayIso } from '../shared/dates';
import { SyncService } from '../shell/sync.service';
import { CurrentTeam } from '../team/current-team.service';
import {
  type FieldTestPlayerDraft,
  type FieldTestResult,
  type FieldTestSessionDraft,
  type FieldTestSessionEvaluation,
  docFromFieldTest,
  evaluateSession,
  fieldTestHistory,
  resultsFromSession,
} from './field-test';
import { RecordsStateService } from './records-state.service';

export interface SaveSessionResult {
  readonly evaluation: FieldTestSessionEvaluation;
  /** Spieler, für die ein Ergebnis gespeichert wurde. */
  readonly saved: readonly string[];
  /** Spieler, bei denen das Speichern fehlgeschlagen ist. */
  readonly failed: readonly string[];
  /** Fehlertext für das Speichern ('' = alles gespeichert oder Prüffehler). */
  readonly error: string;
}

/**
 * Darf für diesen Spieler ein Feldtest gespeichert werden? Wie Messwerte (gleiche Sammlung, SCRUM-245): fremde Vereine
 * nur mit dokumentierter Einwilligung; bei widerrufener Einwilligung werden keine neuen Daten erfasst.
 */
export function mayRecordFieldTest(player: Pick<Player, 'consentStatus'>, teamId: string): boolean {
  return player.consentStatus !== 'revoked' && mayStoreHealth(player, teamId);
}

/**
 * Feldtests (SCRUM-263): Testtermin für mehrere Spieler speichern (Seite „Feldtests“) und die Ergebnisse des im Profil
 * geladenen Spielers lesen und löschen. Schreiben dürfen nur Trainer (Regeln von `players/{id}/measurements`).
 */
@Injectable({ providedIn: 'root' })
export class FieldTestsService {
  private readonly api = inject(PlayerRecordsApi);
  private readonly state = inject(RecordsStateService);
  private readonly session = inject(SessionService);
  private readonly squad = inject(SquadService);
  private readonly sync = inject(SyncService);
  private readonly team = inject(CurrentTeam);

  readonly canWrite = computed(() => this.session.role() === 'trainer');
  /** Ergebnisse des im Profil geladenen Spielers, je Test gruppiert, neueste zuerst. */
  readonly history = computed(() => fieldTestHistory(this.state.fieldTests()));

  /**
   * Prüft den Testtermin und speichert je Spieler mit Eingaben ein Ergebnis. Bei Prüffehlern wird nichts gespeichert.
   * Spieler, für die keine Daten gespeichert werden dürfen, werden ignoriert (die Seite bietet sie gar nicht an).
   */
  async saveSession(draft: FieldTestSessionDraft, players: readonly FieldTestPlayerDraft[], now: Date = new Date()): Promise<SaveSessionResult> {
    const allowed = new Map(this.squad.players().filter((player) => mayRecordFieldTest(player, this.team.id())).map((player) => [player.id, player]));
    const drafts = players.filter((entry) => allowed.has(entry.playerId));
    const evaluation = evaluateSession(draft, drafts, {
      today: todayIso(now),
      birthdates: new Map([...allowed.values()].map((player) => [player.id, player.birthdate])),
    });
    if (!this.canWrite()) return { evaluation, saved: [], failed: [], error: 'Nur Trainer dürfen Feldtests speichern.' };
    if (!evaluation.ok) return { evaluation, saved: [], failed: [], error: '' };
    const results = resultsFromSession(draft, evaluation, { sessionId: `ft${crypto.randomUUID()}`, newId: () => `ft${crypto.randomUUID()}`, recordedAt: now.toISOString() });
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    const outcomes = await Promise.allSettled(results.map(({ playerId, result }) => this.api.savePlayerRecord(playerId, 'measurements', result.id, docFromFieldTest(result))));
    const saved: string[] = [];
    const failed: string[] = [];
    let firstError: unknown = null;
    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') saved.push(results[index].playerId);
      else {
        failed.push(results[index].playerId);
        firstError ??= outcome.reason;
      }
    });
    if (failed.length === 0) {
      this.sync.clearError();
      return { evaluation, saved, failed, error: '' };
    }
    console.error(firstError);
    const error = `Feldtest konnte nicht für alle gespeichert werden. ${authErrorMessage(errorCode(firstError), this.session.role())}`;
    this.sync.fail(error);
    return { evaluation, saved, failed, error };
  }

  /** Löscht ein Ergebnis des im Profil geladenen Spielers (nur Trainer). */
  async deleteResult(id: string): Promise<boolean> {
    return this.state.remove('measurements', id, 'Feldtest konnte nicht gelöscht werden.', (list) => this.state.fieldTests.set(list as FieldTestResult[]), this.state.fieldTests());
  }
}
