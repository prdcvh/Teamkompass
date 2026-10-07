import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { formatDate } from '../../core/event';
import { LayoutService } from '../../core/layout.service';
import { ageFromBirthdate, consentRevokedMessage, isConsentRevoked, positionText, todayIso } from '../../core/player';
import {
  availability,
  gradeToPercent,
  gradedEvents,
  numberLabel,
  profileFigures,
  skillAverages,
  trendChart,
} from '../../core/profile';
import { ProfileService } from '../../core/profile.service';
import { effectiveStatus } from '../../core/records';
import { RecordsService } from '../../core/records.service';
import { injuryRisk } from '../../core/risk';
import { gradeLabel } from '../../core/rating';
import { SquadService } from '../../core/squad.service';
import { SyncService } from '../../core/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Status } from '../../ui/status/status';
import { ProfileExtras } from './profile-extras';

/** Spielerprofil (Figma: Profil Desktop/Handy): Kopfbereich, Notenverlauf, Kompetenzprofil, Verfügbarkeit, Statistik, Eventhistorie. */
@Component({
  selector: 'app-profile',
  imports: [Button, Card, Status, ProfileExtras],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profile implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly squad = inject(SquadService);
  protected readonly profile = inject(ProfileService);
  protected readonly records = inject(RecordsService);
  protected readonly sync = inject(SyncService);
  protected readonly mobile = inject(LayoutService).isMobile;

  private readonly routeId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), { initialValue: '' });
  /** Gewählter Spieler: aus der Adresse, sonst der erste im Kader (nach Rückennummer). */
  private readonly chosen = signal('');

  protected readonly players = computed(() => [...this.squad.players()].sort((a, b) => a.number - b.number));
  protected readonly player = computed(() => {
    const id = this.chosen() || this.routeId();
    return this.players().find((entry) => entry.id === id) ?? this.players()[0] ?? null;
  });

  protected readonly today = todayIso();
  protected readonly graded = computed(() => gradedEvents(this.profile.items()));
  protected readonly history = computed(() => [...this.graded()].reverse());
  protected readonly figures = computed(() => profileFigures(this.profile.items(), this.today));
  protected readonly skills = computed(() => skillAverages(this.graded()));
  protected readonly attendance = computed(() => availability(this.profile.items(), this.today));
  protected readonly chart = computed(() => trendChart(this.graded()));
  protected readonly ready = computed(() => this.squad.load() === 'ready' && !this.profile.loading());
  protected readonly failed = computed(() => this.squad.load() === 'error' || this.profile.error() !== '');
  protected readonly errorText = computed(() => this.profile.error() || this.squad.error());

  /** Anzeige-Status: eine heute laufende Abwesenheit überlagert den manuell gesetzten Status. */
  protected readonly status = computed(() => {
    const player = this.player();
    return player ? effectiveStatus(player, this.records.absences(), this.today) : 'Fit';
  });
  /** Belastungsindikator; erst sinnvoll, wenn Bewertungen und Zusatzdaten geladen sind. */
  protected readonly risk = computed(() => {
    const player = this.player();
    if (!player || !this.records.ready() || this.profile.loading()) return null;
    return injuryRisk(player, this.profile.items(), this.records.absences(), this.records.measurements());
  });

  protected readonly cards = computed(() => {
    const f = this.figures();
    const g = f.games;
    return [
      { label: 'Notenschnitt', value: gradeLabel(f.average) },
      { label: 'Spiel-Schnitt', value: gradeLabel(f.gameAverage) },
      { label: 'Training-Schnitt', value: gradeLabel(f.trainingAverage) },
      { label: 'Bewertete Events', value: String(f.ratedEvents) },
      { label: 'Teilnahmen', value: String(f.attendances) },
      { label: 'Trend', value: numberLabel(f.trend, { signed: true }) },
      { label: 'Ø Intensität zuletzt', value: numberLabel(f.recentIntensity) },
      { label: 'Entwicklung Saison', value: numberLabel(f.development, { signed: true }) },
      { label: 'Bestes Event', value: f.best ? `${gradeLabel(f.best.grade)} · ${f.best.event.type}` : '–' },
      { label: 'Einsatzquote', value: `${g.appearanceRate}%` },
      { label: 'Scorer/Spiel', value: numberLabel(g.scorersPerGame) },
      { label: 'Tore + Vorlagen', value: `${g.goals} + ${g.assists}` },
      { label: 'Min./Spiel', value: g.minutesPerGame ? String(g.minutesPerGame) : '–' },
      { label: 'Min./Scorerpunkt', value: g.minutesPerScorer === null ? '–' : String(g.minutesPerScorer) },
    ];
  });

  constructor() {
    // Das Profil folgt dem gewählten Spieler.
    effect(() => {
      const player = this.player();
      untracked(() => {
        if (player) {
          this.profile.start(player.id);
          this.records.start(player.id);
        } else {
          this.profile.stop();
          this.records.stop();
        }
      });
    });
  }

  ngOnInit(): void {
    this.squad.start();
  }

  protected formatDate = formatDate;
  protected positionText = positionText;
  protected gradeLabel = gradeLabel;
  protected gradeToPercent = gradeToPercent;
  protected numberLabel = numberLabel;

  protected age(birthdate: string): string {
    const age = ageFromBirthdate(birthdate);
    return age === null ? '–' : String(age);
  }

  protected consentWarning(): string {
    const player = this.player();
    return player && isConsentRevoked(player) ? consentRevokedMessage(player.name) : '';
  }

  protected consent(): string {
    const player = this.player();
    if (!player) return '';
    if (player.consentStatus === 'granted') return player.consentDate ? `dokumentiert am ${formatDate(player.consentDate)}` : 'dokumentiert';
    return player.consentStatus === 'revoked' ? 'widerrufen' : 'noch offen';
  }

  protected injury(): string {
    const player = this.player();
    return this.status() === 'Verletzt' && player?.injuryUntil ? ` (ca. bis ${formatDate(player.injuryUntil)})` : '';
  }

  protected choose(id: string): void {
    this.chosen.set(id);
    void this.router.navigate(['/profile', id], { replaceUrl: true });
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected retry(): void {
    if (this.squad.load() === 'error') {
      this.squad.stop();
      this.squad.start();
    }
    this.profile.retry();
    this.records.retry();
  }
}
