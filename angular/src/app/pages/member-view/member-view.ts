import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { formatDate } from '../../core/events/event';
import { LayoutService } from '../../core/shell/layout.service';
import { ageFromBirthdate, todayIso } from '../../core/shared/dates';
import { type Player, positionText } from '../../core/player/player';
import { availability, gradeToPercent, gradedEvents, profileFigures, skillAverages, trendChart } from '../../core/profile/profile';
import { ProfileService } from '../../core/profile/profile.service';
import { gradeLabel } from '../../core/ratings/rating';
import { effectiveStatus } from '../../core/records/availability';
import { RecordsStateService } from '../../core/records/records-state.service';
import { SessionService } from '../../core/auth/session.service';
import { SquadService } from '../../core/player/squad.service';
import { type ScoutPlayer, scoutItems } from '../../core/scout/scout-profile';
import { ScoutViewService } from '../../core/scout/scout-view.service';
import { SyncService } from '../../core/shell/sync.service';
import { BreakNotice } from '../../ui/break-notice/break-notice';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { InstallHint } from '../../ui/install-hint/install-hint';
import { Status } from '../../ui/status/status';
import { ProfileExtras } from '../profile/profile-extras';

/**
 * Die eine Ansicht für Spieler, Eltern, Medizin und Scout (Figma 01c/01d). Sie zeigt nur, was die Firestore-Regeln der
 * Rolle erlauben:
 * - Spieler: das eigene Profil, die eigenen Bewertungen (ohne interne Trainer-Notizen) und den eigenen Förderplan
 *   samt Selbstreflexion.
 * - Eltern: dasselbe, nur lesend.
 * - Medizin: Spielerliste, Status sowie Abwesenheiten/Verletzungen und Messwerte – keine Noten, keine Förderpläne.
 * - Scout (SCRUM-170): Spielerliste, Kompetenzprofil, Notenverlauf und Statistik aus der bereinigten Ansicht
 *   `scoutProfiles` – kein Status, keine Verletzungen, Abwesenheitsgründe, Messwerte, Rückmeldungen oder Notizen.
 * Es gibt keine Navigation zu Trainer-Bereichen; die Trainer-Routen sperrt `trainerGuard`.
 */
@Component({
  selector: 'app-member-view',
  imports: [RouterLink, Button, Card, InstallHint, Status, ProfileExtras, BreakNotice],
  templateUrl: './member-view.html',
  styleUrls: ['../profile/profile.css', './member-view.css', '../../ui/chart/chart.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberView implements OnInit {
  private readonly session = inject(SessionService);
  protected readonly squad = inject(SquadService);
  protected readonly profile = inject(ProfileService);
  protected readonly records = inject(RecordsStateService);
  protected readonly scoutView = inject(ScoutViewService);
  protected readonly sync = inject(SyncService);
  protected readonly mobile = inject(LayoutService).isMobile;

  protected readonly club = `${environment.clubName} ${environment.teamLabel}`;
  protected readonly today = todayIso();

  protected readonly role = this.session.role;
  protected readonly medical = computed(() => this.role() === 'medical');
  protected readonly scout = computed(() => this.role() === 'scout');
  /** Medizin und Scout wählen einen Spieler aus der Liste; Spieler und Eltern sehen nur das verknüpfte Profil. */
  protected readonly picker = computed(() => this.medical() || this.scout());
  /** Spieler und Eltern sind an ein Profil gebunden; ohne Verknüpfung gibt es nichts zu zeigen. */
  protected readonly unlinked = computed(() => !this.picker() && !this.session.playerId());

  private readonly chosen = signal('');
  protected readonly players = computed<readonly ScoutPlayer[]>(() =>
    [...(this.scout() ? this.scoutView.players() : this.squad.players())].sort((a, b) => a.number - b.number),
  );
  protected readonly player = computed<ScoutPlayer | null>(() => {
    if (this.unlinked()) return null;
    const list = this.players();
    // Spieler und Eltern: ausschließlich das verknüpfte Profil, nie eine Auswahl.
    if (!this.picker()) return list.find((entry) => entry.id === this.session.playerId()) ?? null;
    return list.find((entry) => entry.id === this.chosen()) ?? list.at(0) ?? null;
  });
  /** Vollständige Spielerdaten (mit Status) – nie für Scouts, die nur die bereinigte Ansicht lesen. */
  private readonly fullPlayer = computed<Player | null>(() => {
    const id = this.player()?.id;
    return this.scout() || !id ? null : (this.squad.players().find((entry) => entry.id === id) ?? null);
  });
  /** Ladezustand der Spielerliste (Kader bzw. Scout-Ansicht). */
  protected readonly listLoad = computed(() => {
    if (!this.scout()) return this.squad.load();
    if (this.scoutView.load() === 'error') return 'error';
    return this.scoutView.ready() ? 'ready' : 'loading';
  });
  /** Alle Events mit der Bewertung des gewählten Spielers (Scout: aus der bereinigten Ansicht). */
  private readonly items = computed(() =>
    this.scout() ? scoutItems(this.scoutView.events(), this.scoutView.ratings().get(this.player()?.id ?? '')) : this.profile.items(),
  );

  protected readonly title = computed(() => {
    const role = this.role();
    if (role === 'medical') return 'Medizin-Ansicht';
    if (role === 'scout') return 'Scout-Ansicht';
    if (role === 'parent') return this.player() ? `Profil von ${this.player()!.name}` : 'Profil';
    return 'Mein Profil';
  });
  protected readonly intro = computed(() => {
    const role = this.role();
    if (role === 'medical') return 'Lesezugang: Status, Abwesenheiten, Verletzungen und Messwerte.';
    if (role === 'scout') return 'Lesezugang: Kompetenzprofil, Notenverlauf und Statistik.';
    if (role === 'parent') return 'Lesezugang zum Profil, zu den Bewertungen und zum Förderplan.';
    return 'Deine Bewertungen, dein Förderplan und deine Entwicklung.';
  });

  protected readonly graded = computed(() => gradedEvents(this.items()));
  protected readonly history = computed(() => [...this.graded()].reverse());
  protected readonly figures = computed(() => profileFigures(this.items(), this.today));
  protected readonly skills = computed(() => skillAverages(this.graded()));
  protected readonly attendance = computed(() => availability(this.items(), this.today));
  protected readonly chart = computed(() => trendChart(this.graded()));
  protected readonly cards = computed(() => {
    const f = this.figures();
    return [
      { label: 'Notenschnitt', value: gradeLabel(f.average) },
      { label: 'Bewertete Events', value: String(f.ratedEvents) },
      { label: 'Teilnahmen', value: String(f.attendances) },
      { label: 'Tore + Vorlagen', value: `${f.games.goals} + ${f.games.assists}` },
    ];
  });

  protected readonly status = computed(() => {
    const player = this.fullPlayer();
    return player ? effectiveStatus(player, this.records.absences(), this.today) : 'Fit';
  });
  protected readonly ready = computed(() => {
    if (this.scout()) return this.scoutView.ready();
    return this.squad.load() === 'ready' && (this.medical() || !this.profile.loading());
  });
  protected readonly failed = computed(() => {
    if (this.scout()) return this.scoutView.load() === 'error';
    return this.squad.load() === 'error' || (!this.medical() && this.profile.error() !== '');
  });
  protected readonly errorText = computed(() => (this.scout() ? this.scoutView.error() : this.squad.error() || this.profile.error()));

  constructor() {
    // Daten laden, sobald das eigene (bzw. gewählte) Profil feststeht.
    effect(() => {
      const player = this.player();
      untracked(() => {
        // Scouts lesen weder Bewertungen noch Abwesenheiten/Messwerte (Regeln), nur die bereinigte Ansicht.
        if (!player || this.scout()) {
          this.profile.stop();
          this.records.stop();
          return;
        }
        // Medizin darf keine Bewertungen lesen (Regeln: events/*/ratings) – dort wird nichts abonniert.
        if (this.medical()) this.profile.stop();
        else this.profile.start(player.id);
        this.records.start(player.id);
      });
    });
  }

  ngOnInit(): void {
    if (this.scout()) this.scoutView.start();
    else if (!this.unlinked()) this.squad.start();
  }

  protected formatDate = formatDate;
  protected positionText = positionText;
  protected gradeLabel = gradeLabel;
  protected gradeToPercent = gradeToPercent;

  protected age(birthdate: string): string {
    const age = ageFromBirthdate(birthdate);
    return age === null ? '–' : String(age);
  }

  protected injury(): string {
    const player = this.fullPlayer();
    return this.status() === 'Verletzt' && player?.injuryUntil ? ` (ca. bis ${formatDate(player.injuryUntil)})` : '';
  }

  protected choose(event: Event): void {
    this.chosen.set((event.target as HTMLSelectElement).value);
  }

  protected retry(): void {
    if (this.scout()) {
      this.scoutView.retry();
      return;
    }
    if (this.squad.load() === 'error') {
      this.squad.stop();
      this.squad.start();
    }
    this.profile.retry();
    this.records.retry();
  }
}
