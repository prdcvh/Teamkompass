import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { LayoutService } from '../../core/layout.service';
import {
  type Assignments,
  type Candidate,
  PITCH_ZONES,
  ZONES,
  type Zone,
  benchOf,
  eligibleCandidates,
  formationName,
  formationOptions,
  lineupGrade,
  lineupIsEmpty,
  moveToZone,
  onPitchIds,
  outOfPosition,
  removeFromPitch,
  assignmentsFromPreview,
  suggestedLineup,
  swapPlayers,
  zoneOf,
  MAX_ON_PITCH,
  FORMATION_PRESETS,
} from '../../core/lineup';
import { LineupService } from '../../core/lineup.service';
import { todayIso } from '../../core/player';
import { positionText } from '../../core/player';
import { averageGrade, gradedEvents } from '../../core/profile';
import { gradeLabel } from '../../core/rating';
import { effectiveStatus } from '../../core/records';
import { SessionService } from '../../core/session.service';
import { SyncService } from '../../core/sync.service';
import { TeamService } from '../../core/team.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';

/** Was der Dialog gerade tut: eine Zone/einen Spieler auf dem Feld ersetzen, oder einen Bankspieler aufstellen. */
type Target = { kind: 'zone'; zone: Zone; playerId: string | null } | { kind: 'bench'; playerId: string };

/** Aufstellung: Startelf auf dem Feld, Formationsvorschläge, Bank und Auswechslungen (nur Trainer). */
@Component({
  selector: 'app-lineup',
  imports: [Button, Card, Dialog],
  templateUrl: './lineup.html',
  styleUrl: './lineup.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Lineup implements OnInit {
  protected readonly team = inject(TeamService);
  protected readonly lineup = inject(LineupService);
  protected readonly sync = inject(SyncService);
  protected readonly mobile = inject(LayoutService).isMobile;
  private readonly session = inject(SessionService);
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');
  protected readonly zones = ZONES;
  protected readonly max = MAX_ON_PITCH;

  protected readonly ready = computed(() => this.team.ready() && this.lineup.load() === 'ready');
  protected readonly failed = computed(() => this.team.error() || this.lineup.error());

  /** Alle Spieler mit Durchschnittsnote und aktuellem Status. */
  private readonly entries = computed<Candidate[]>(() => {
    const today = todayIso();
    return this.team.data().map(({ player, items, absences }) => ({
      player,
      grade: averageGrade(gradedEvents(items)),
      status: effectiveStatus(player, absences, today),
    }));
  });
  private readonly eligible = computed(() => eligibleCandidates(this.entries()));
  private readonly byId = computed(() => new Map(this.entries().map((entry) => [entry.player.id, entry])));

  /** Gespeicherte Startelf; ist noch nichts gespeichert, zeigt das Board den besten Vorschlag. */
  protected readonly assignments = computed<Assignments>(() => {
    const stored = this.lineup.assignments();
    return lineupIsEmpty(stored) ? suggestedLineup(this.eligible()) : stored;
  });
  protected readonly name = computed(() => formationName(this.assignments()));
  protected readonly teamGrade = computed(() => lineupGrade(this.assignments(), this.entries()));
  protected readonly options = computed(() => formationOptions(this.eligible()));
  protected readonly bench = computed(() => benchOf(this.assignments(), this.entries()));

  /** Zonen mit ihren Spielern, bereit zum Anzeigen. */
  protected readonly board = computed(() =>
    ZONES.map((zone) => ({
      zone,
      ...PITCH_ZONES[zone],
      chips: this.assignments()[zone].flatMap((id) => {
        const entry = this.byId().get(id);
        return entry ? [{ player: entry.player, grade: entry.grade, off: outOfPosition(entry.player, zone) }] : [];
      }),
    })),
  );

  protected readonly target = signal<Target | null>(null);
  protected readonly zoneTarget = computed(() => {
    const target = this.target();
    return target?.kind === 'zone' ? target : null;
  });
  protected readonly benchTarget = computed(() => this.target()?.kind === 'bench');
  protected readonly dialogTitle = computed(() => {
    const target = this.target();
    if (target?.kind === 'bench') return 'Auf welche Position?';
    return target ? `Position ${target.zone}` : 'Position';
  });
  protected readonly query = signal('');
  protected readonly message = signal('');

  protected readonly currentOptionIndex = computed(() => {
    const current = this.name();
    return this.options().findIndex((option) => option.name === current);
  });

  protected readonly pickList = computed(() => {
    const target = this.target();
    if (target?.kind !== 'zone') return [];
    const query = this.query().trim().toLowerCase();
    return [...this.entries()]
      .sort((a, b) => a.player.number - b.player.number)
      .filter((entry) => !query || [entry.player.name, positionText(entry.player), String(entry.player.number)].join(' ').toLowerCase().includes(query))
      .map((entry) => ({
        ...entry,
        zone: zoneOf(this.assignments(), entry.player.id),
        eligible: !outOfPosition(entry.player, target.zone),
      }));
  });

  protected positionText = positionText;
  protected gradeLabel = gradeLabel;

  ngOnInit(): void {
    if (this.isTrainer()) {
      this.team.start();
      this.lineup.start();
    }
  }

  protected openZone(zone: Zone, playerId: string | null): void {
    if (!this.lineup.canEdit()) return;
    this.query.set('');
    this.message.set('');
    this.target.set({ kind: 'zone', zone, playerId });
  }

  protected openBench(playerId: string): void {
    if (!this.lineup.canEdit()) return;
    this.message.set('');
    this.target.set({ kind: 'bench', playerId });
  }

  protected close(): void {
    this.target.set(null);
  }

  /** Spieler für eine Zone gewählt: Tausch mit dem bisherigen Spieler der Zone oder einfach dorthin stellen. */
  protected pick(playerId: string): void {
    const target = this.target();
    if (target?.kind !== 'zone') return;
    const current = this.assignments();
    if (target.playerId && target.playerId !== playerId) this.apply(swapPlayers(current, playerId, target.playerId));
    else this.place(playerId, target.zone);
  }

  protected placeBench(zone: Zone): void {
    const target = this.target();
    if (target?.kind === 'bench') this.place(target.playerId, zone);
  }

  protected removeCurrent(): void {
    const target = this.target();
    if (target?.kind !== 'zone' || !target.playerId) return;
    this.apply(removeFromPitch(this.assignments(), target.playerId));
  }

  protected applyFormation(index: number): void {
    const option = this.options()[index];
    if (option) this.apply(assignmentsFromPreview(option.preview.assigned));
  }

  protected onFormationSelect(event: Event): void {
    const index = Number((event.target as HTMLSelectElement).value);
    if (Number.isInteger(index) && index >= 0 && index < FORMATION_PRESETS.length) this.applyFormation(index);
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected onPitchCount(): number {
    return onPitchIds(this.assignments()).size;
  }

  protected retry(): void {
    this.team.retry();
    this.lineup.stop();
    this.lineup.start();
  }

  private place(playerId: string, zone: Zone): void {
    const next = moveToZone(this.assignments(), playerId, zone);
    if (next === 'voll') {
      this.message.set('Die Startelf ist bereits voll (11 Spieler). Nimm zuerst jemanden vom Feld, bevor du einen weiteren Spieler aufstellst.');
      return;
    }
    this.apply(next);
  }

  private apply(next: Assignments): void {
    if (this.lineup.save(next)) this.target.set(null);
  }
}
