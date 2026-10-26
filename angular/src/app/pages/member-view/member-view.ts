import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentTeam } from '../../core/team/current-team.service';
import { formatDate } from '../../core/events/event';
import { LayoutService } from '../../core/shell/layout.service';
import { ageFromBirthdate, todayIso } from '../../core/shared/dates';
import { type Player, positionText } from '../../core/player/player';
import { canCreateLoadReport } from '../../core/analysis/load-report';
import { type EventRating, availability, gradeToPercent, gradedEvents, numberLabel, profileFigures, skillAverages, trendChart } from '../../core/profile/profile';
import { ProfileService } from '../../core/profile/profile.service';
import { gradeLabel } from '../../core/ratings/rating';
import { effectiveStatus } from '../../core/records/availability';
import { RecordsStateService } from '../../core/records/records-state.service';
import { ScoutViewService } from '../../core/scout/scout-view.service';
import { SessionService } from '../../core/auth/session.service';
import { SquadService } from '../../core/player/squad.service';
import { SyncService } from '../../core/shell/sync.service';
import { BreakNotice } from '../../ui/break-notice/break-notice';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { InstallHint } from '../../ui/install-hint/install-hint';
import { Status } from '../../ui/status/status';
import { HomeRanking } from '../home/home-ranking/home-ranking';
import { LoadReportAction } from '../profile/load-report-action';
import { ProfileExtras } from '../profile/profile-extras';
import { ConnectEmail } from './connect-email';
import { RsvpPanel } from './rsvp-panel';

/**
 * Die eine Ansicht für Spieler, Eltern, Medizin und Scouts (Figma 01c/01d). Sie zeigt nur, was die Firestore-Regeln
 * der Rolle erlauben:
 * - Spieler: das eigene Profil, die eigenen Bewertungen (ohne interne Trainer-Notizen) und den eigenen Förderplan
 *   samt Selbstreflexion.
 * - Eltern: dasselbe, nur lesend.
 * - Medizin (`physio`): Spielerliste, Status sowie Abwesenheiten/Verletzungen und Messwerte – keine Noten, keine
 *   Förderpläne.
 * - Scout (SCRUM-170): Kompetenzprofil, Notenverlauf und Statistik aller freigegebenen Spieler, ausschließlich aus der
 *   bereinigten Scout-Sicht – keine Gesundheitsdaten (Status, Verletzungen, Abwesenheitsgründe, Messwerte), keine
 *   Rückmeldungen oder Notizen.
 * Es gibt keine Navigation zu Trainer-Bereichen; die Trainer-Routen sperrt `trainerGuard`.
 * Spieler-Zugänge ohne E-Mail können sich hier nachträglich mit E-Mail und Passwort verbinden (SCRUM-114).
 * Spieler und Eltern sagen hier für die nächsten Termine zu oder ab (SCRUM-205).
 */
@Component({
  selector: 'app-member-view',
  imports: [RouterLink, Button, Card, InstallHint, Status, ProfileExtras, BreakNotice, LoadReportAction, HomeRanking, ConnectEmail, RsvpPanel],
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

  private readonly team = inject(CurrentTeam);
  protected readonly club = computed(() => [this.team.clubName(), this.team.label()].filter(Boolean).join(' '));
  protected readonly today = todayIso();

  protected readonly role = this.session.role;
  /** Medizin-Zugang: Gesundheitsdaten, keine Noten. */
  protected readonly physio = computed(() => this.role() === 'physio');
  /** Scout-Zugang: Noten und Statistik, keine Gesundheitsdaten. */
  protected readonly scout = computed(() => this.role() === 'scout');
  /** Medizin und Scout wählen unter allen Spielern; Spieler und Eltern sehen nur das verknüpfte Profil. */
  protected readonly picks = computed(() => this.physio() || this.scout());
  /** Spieler und Eltern sind an ein Profil gebunden; ohne Verknüpfung gibt es nichts zu zeigen. */
  protected readonly unlinked = computed(() => !this.picks() && !this.session.playerId());

  private readonly chosen = signal('');
  protected readonly players = computed<readonly Player[]>(() =>
    this.scout() ? this.scoutView.players() : [...this.squad.players()].sort((a, b) => a.number - b.number),
  );
  protected readonly player = computed<Player | null>(() => {
    if (this.unlinked()) return null;
    const list = this.players();
    // Spieler und Eltern: ausschließlich das verknüpfte Profil, nie eine Auswahl.
    if (!this.picks()) return list.find((entry) => entry.id === this.session.playerId()) ?? null;
    return list.find((entry) => entry.id === this.chosen()) ?? list.at(0) ?? null;
  });

  protected readonly title = computed(() => {
    const role = this.role();
    if (role === 'scout') return 'Scout-Ansicht';
    if (role === 'physio') return 'Medizin-Ansicht';
    if (role === 'parent') return this.player() ? `Profil von ${this.player()!.name}` : 'Profil';
    return 'Mein Profil';
  });
  protected readonly intro = computed(() => {
    const role = this.role();
    if (role === 'scout') return 'Lesezugang: Kompetenzprofil, Notenverlauf und Statistik.';
    if (role === 'physio') return 'Lesezugang: Status, Abwesenheiten, Verletzungen und Messwerte.';
    if (role === 'parent') return 'Lesezugang zum Profil, zu den Bewertungen und zum Förderplan.';
    return 'Deine Bewertungen, dein Förderplan und deine Entwicklung.';
  });

  /** Alle Termine mit Bewertung des gewählten Spielers (Scout: aus der Scout-Sicht). */
  private readonly items = computed<readonly EventRating[]>(() => {
    if (!this.scout()) return this.profile.items();
    const player = this.player();
    return player ? (this.scoutView.view().items.get(player.id) ?? []) : [];
  });
  protected readonly graded = computed(() => gradedEvents(this.items()));
  protected readonly history = computed(() => [...this.graded()].reverse());
  protected readonly figures = computed(() => profileFigures(this.items(), this.today));
  protected readonly skills = computed(() => skillAverages(this.graded()));
  protected readonly attendance = computed(() => availability(this.items(), this.today));
  protected readonly chart = computed(() => trendChart(this.graded()));
  protected readonly cards = computed(() => {
    const f = this.figures();
    const cards = [
      { label: 'Notenschnitt', value: gradeLabel(f.average) },
      { label: 'Bewertete Events', value: String(f.ratedEvents) },
      { label: 'Teilnahmen', value: String(f.attendances) },
      { label: 'Tore + Vorlagen', value: `${f.games.goals} + ${f.games.assists}` },
    ];
    if (!this.scout()) return cards;
    return [
      ...cards,
      { label: 'Spiel-Schnitt', value: gradeLabel(f.gameAverage) },
      { label: 'Training-Schnitt', value: gradeLabel(f.trainingAverage) },
      { label: 'Einsatzquote', value: `${f.games.appearanceRate}%` },
      { label: 'Min./Spiel', value: f.games.minutesPerGame ? String(f.games.minutesPerGame) : '–' },
      { label: 'Scorer/Spiel', value: numberLabel(f.games.scorersPerGame) },
    ];
  });

  protected readonly status = computed(() => {
    const player = this.player();
    return player ? effectiveStatus(player, this.records.absences(), this.today) : 'Fit';
  });
  protected readonly loaded = computed(() => (this.scout() ? this.scoutView.load() === 'ready' : this.squad.load() === 'ready'));
  protected readonly ready = computed(() => this.loaded() && (this.picks() || !this.profile.loading()));
  /** Belastungsprotokoll (SCRUM-139): nur der Spieler selbst, erst wenn Abwesenheiten und Messwerte geladen sind. */
  protected readonly reportAllowed = computed(() => {
    const player = this.player();
    return !!player && this.records.ready() && canCreateLoadReport(this.role(), this.session.playerId(), player.id);
  });
  protected readonly failed = computed(() =>
    this.scout() ? this.scoutView.load() === 'error' : this.squad.load() === 'error' || (!this.physio() && this.profile.error() !== ''),
  );
  protected readonly errorText = computed(() => (this.scout() ? this.scoutView.error() : this.squad.error() || this.profile.error()));

  constructor() {
    // Daten laden, sobald das eigene (bzw. gewählte) Profil feststeht.
    effect(() => {
      const player = this.player();
      untracked(() => {
        // Scouts lesen nur die Scout-Sicht: keine Bewertungen, Abwesenheiten, Messwerte oder Pläne abonnieren.
        if (!player || this.scout()) {
          this.profile.stop();
          this.records.stop();
          return;
        }
        // Medizin darf keine Bewertungen lesen (Regeln: events/*/ratings) – dort wird nichts abonniert.
        if (this.physio()) this.profile.stop();
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
    const player = this.player();
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
