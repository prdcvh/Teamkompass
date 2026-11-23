import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { ClubApi } from '../firebase/club.api';
import { SquadService } from '../player/squad.service';
import { CurrentTeam } from '../team/current-team.service';
import { overviewFromDoc, overviewFromPlayers, overviewKey } from './club-overview';

/**
 * Trainer-Client pflegt die Kurzfassung des Kaders für den Vereinsadmin (SCRUM-183): `meta/clubOverview` mit
 * Spielerzahl, offenen/widerrufenen Einwilligungen und je Spieler nur Name, Nummer, Positionen. Der Vereinsadmin liest
 * das Spielerdokument selbst nicht (Gesundheitsangaben). Abgeglichen wird, sobald der Kader geladen ist und sich ändert;
 * gleicher Inhalt wird nicht neu geschrieben. Für andere Rollen tut der Dienst nichts.
 */
@Injectable({ providedIn: 'root' })
export class ClubOverviewService {
  private readonly api = inject(ClubApi);
  private readonly session = inject(SessionService);
  private readonly squad = inject(SquadService);
  private readonly team = inject(CurrentTeam);

  private readonly trainer = computed(() => this.session.role() === 'trainer');
  /** Zuletzt bekannter Stand je Team (gelesen oder geschrieben). */
  private readonly known = new Map<string, string>();
  private running = false;
  private again = false;

  constructor() {
    effect(() => {
      // Abhängigkeiten: Kader, Ladezustand, Team und Rolle – bei jeder Änderung abgleichen.
      this.squad.players();
      const ready = this.squad.load() === 'ready';
      const teamId = this.team.id();
      if (!this.trainer() || !ready) return;
      untracked(() => void this.reconcile(teamId));
    });
  }

  private async reconcile(teamId: string): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      if (!this.known.has(teamId)) {
        const existing = overviewFromDoc(await this.api.readOverview(teamId));
        this.known.set(teamId, existing ? overviewKey(existing) : '');
      }
      // Erst nach dem Lesen den aktuellen Kader nehmen (er kann sich inzwischen geändert haben).
      if (!this.trainer() || this.squad.load() !== 'ready' || this.team.id() !== teamId) return;
      const wanted = overviewFromPlayers(this.squad.players());
      const key = overviewKey(wanted);
      if (this.known.get(teamId) === key) return;
      await this.api.writeOverview(teamId, wanted);
      this.known.set(teamId, key);
    } catch (error) {
      // Kein Hinweis an den Trainer (z. B. Regeln noch nicht veröffentlicht): der nächste Abgleich versucht es erneut.
      console.warn('Vereinsübersicht konnte nicht aktualisiert werden', error);
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        if (this.trainer() && this.squad.load() === 'ready') void this.reconcile(this.team.id());
      }
    }
  }
}
