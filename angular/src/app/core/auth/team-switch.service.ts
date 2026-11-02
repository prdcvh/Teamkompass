import { Injectable, Injector, inject } from '@angular/core';
import type { MemberRecord } from '../firebase/types';
import { CurrentTeam, type TeamChoice } from '../team/current-team.service';
import { authErrorMessage, errorCode } from './auth-errors';
import { flushTeardown } from './auth-helpers';
import { AuthService } from './auth.service';
import { TeamAccess } from './team-access';

/**
 * Teamwechsel ohne Neuladen (SCRUM-182) für Konten in mehreren Teams. Ablauf:
 * 1. Zugang zum Zielteam frisch aus der Datenbank prüfen – nicht der Stand von der Anmeldung: ein inzwischen gesperrter
 *    oder abgelaufener Zugang öffnet nichts, und es gilt die Rolle, die das Konto JETZT in diesem Team hat.
 * 2. Altes Team abbauen wie beim Abmelden ({@link AuthService.leaveTeam}) und sofort einen Durchlauf der Oberfläche
 *    ausführen: Datendienste beenden ihre Abos und verwerfen ihre Daten, Seiten und Dialoge des alten Teams verschwinden.
 * 3. Erst danach das neue Team mit seiner Rolle öffnen; Seiten bauen sich neu auf und laden neu.
 * Der lokale Firestore-Speicher bleibt (gleiches Konto, die Regeln gelten weiter).
 */
@Injectable({ providedIn: 'root' })
export class TeamSwitch {
  private readonly auth = inject(AuthService);
  private readonly teamAccess = inject(TeamAccess);
  private readonly team = inject(CurrentTeam);
  private readonly injector = inject(Injector);
  /** Läuft schon ein Wechsel (Doppel-Tippen)? */
  private running = false;

  /** true = das Team ist jetzt geöffnet; false = nicht gewechselt (Fehlertext dann in `auth.error`). */
  async switchTo(teamId: string): Promise<boolean> {
    const user = this.auth.user;
    if (!user || this.running) return false;
    if (teamId === this.team.id()) return true;
    this.running = true;
    this.auth.error.set('');
    try {
      let teams: Map<string, MemberRecord>;
      try {
        teams = await this.teamAccess.find(user);
      } catch (error) {
        console.error(error);
        this.auth.error.set(`Team konnte nicht gewechselt werden. ${authErrorMessage(errorCode(error))}`);
        return false;
      }
      if (this.auth.user !== user) return false; // inzwischen abgemeldet oder anderes Konto
      this.team.choices.set(this.choicesFor(teams));
      const member = teams.get(teamId);
      if (!member) {
        this.auth.error.set('Für dieses Team gibt es keinen gültigen Zugang mehr (zum Beispiel gesperrt oder abgelaufen). Bitte wende dich an den Trainer.');
        return false;
      }
      const epoch = this.auth.leaveTeam();
      this.team.select(teamId);
      await flushTeardown(this.injector);
      return this.auth.enterTeam(user, member, epoch);
    } finally {
      this.running = false;
    }
  }

  /** Neue Teamliste; bekannte Namen/Logos bleiben, bis sie frisch nachgeladen sind. */
  private choicesFor(teams: ReadonlyMap<string, MemberRecord>): TeamChoice[] {
    const known = new Map(this.team.choices().map((choice) => [choice.teamId, choice.meta]));
    return [...teams].map(([teamId, record]) => ({ teamId, role: record.role, meta: known.get(teamId) ?? null }));
  }
}
