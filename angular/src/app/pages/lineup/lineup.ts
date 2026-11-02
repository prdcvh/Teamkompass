import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { EventsService } from '../../core/events/events.service';
import { formatDate } from '../../core/events/event';
import { LayoutService } from '../../core/shell/layout.service';
import { type Candidate, eligibleCandidates, formationOptions, assignmentsFromPreview, suggestedLineup } from '../../core/lineup/formation-assignment';
import { type Assignments, benchOf, fitToFormat, formationName, lineupGrade, lineupIsEmpty, moveToZone, nextGame, onPitchIds, previousGameWithLineup, removeFromPitch, swapPlayers, zoneOf, zonesForFormat } from '../../core/lineup/lineup';
import { PITCH_ZONES, type Zone, outOfPosition } from '../../core/lineup/pitch';
import { GAME_FORMATS, type GameFormat, ROTATION_HINT, gameFormatInfo, isGameFormat } from '../../core/lineup/game-format';
import { LineupService } from '../../core/lineup/lineup.service';
import { todayIso } from '../../core/shared/dates';
import { positionText } from '../../core/player/player';
import { averageGrade, gradedEvents } from '../../core/profile/profile';
import { gradeLabel } from '../../core/ratings/rating';
import { effectiveStatus } from '../../core/records/availability';
import { SessionService } from '../../core/auth/session.service';
import { SyncService } from '../../core/shell/sync.service';
import { TeamSettingsService } from '../../core/team-settings/team-settings.service';
import { TeamService } from '../../core/team/team.service';
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
  private readonly eventsService = inject(EventsService);
  protected readonly mobile = inject(LayoutService).isMobile;
  private readonly session = inject(SessionService);
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');
  private readonly settings = inject(TeamSettingsService);
  protected readonly gameFormats = GAME_FORMATS;
  protected readonly rotationHint = ROTATION_HINT;

  // Die Teameinstellungen (Spielform) müssen geantwortet haben; scheitert das Laden, gilt 11:11.
  private readonly settingsSettled = computed(() => this.settings.load() === 'ready' || this.settings.load() === 'error');
  protected readonly ready = computed(() => this.team.ready() && this.lineup.load() === 'ready' && this.eventsService.load() === 'ready' && this.settingsSettled());
  protected readonly failed = computed(() => this.team.error() || this.lineup.error() || this.eventsService.error());

  /** Alle Spiele, neueste zuerst; die Aufstellung lässt sich für jedes davon ablegen. */
  protected readonly games = computed(() =>
    this.eventsService
      .events()
      .filter((event) => event.type === 'Spiel')
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
  /** Gewähltes Ziel: undefined = Standard (nächstes Spiel), '' = allgemeine Startelf ohne Spiel, sonst die Event-ID. */
  private readonly chosen = signal<string | undefined>(undefined);
  /** Ziel-Spiel; null = allgemeine Startelf (kein Spiel gewählt oder keins ansteht). */
  protected readonly targetGame = computed(() => {
    const chosen = this.chosen();
    if (chosen === undefined) return nextGame(this.games(), todayIso());
    return this.games().find((event) => event.id === chosen) ?? null;
  });
  protected readonly targetValue = computed(() => this.targetGame()?.id ?? '');
  private readonly storedForTarget = computed(() => {
    const game = this.targetGame();
    return game ? (this.lineup.eventLineups()[game.id] ?? null) : null;
  });
  /** Spielform der Aufstellung: die des Spiels, sonst die des Teams (ohne Angabe 11:11). */
  protected readonly format = computed<GameFormat>(() => this.storedForTarget()?.gameFormat ?? this.settings.gameFormat());
  protected readonly info = computed(() => gameFormatInfo(this.format()));
  protected readonly max = computed(() => this.info().players);
  /** Die gespeicherte Aufstellung passt nicht zur Spielform (z. B. 11 Spieler bei 5:5); nie bei 11:11. */
  protected readonly misfit = computed(() => fitToFormat(this.assignments(), this.format()) !== this.assignments());
  protected readonly hasStoredForTarget = computed(() => this.storedForTarget() !== null);
  /** Letztes Spiel vor dem Ziel mit gespeicherter Aufstellung – Quelle für „Vom letzten Spiel übernehmen“. */
  protected readonly previousGame = computed(() =>
    this.targetGame() ? previousGameWithLineup(this.games(), this.lineup.eventLineups(), this.targetGame(), todayIso()) : null,
  );

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

  /** Gespeicherte Aufstellung des Ziels. Eine leere Aufstellung bleibt leer (SCRUM-26); der Vorschlag kommt nur per Button. */
  protected readonly assignments = computed<Assignments>(() => {
    // Für ein Spiel: dessen gespeicherte Aufstellung; sonst die allgemeine Startelf (wie in der bisherigen App).
    const stored = this.storedForTarget()?.assignments ?? this.lineup.assignments();
    return stored;
  });
  /** Empfohlene Elf, nur wenn das Feld leer ist und es einen Vorschlag gibt. */
  protected readonly suggestion = computed<Assignments | null>(() => {
    if (!lineupIsEmpty(this.assignments())) return null;
    const suggested = suggestedLineup(this.eligible(), this.format());
    return lineupIsEmpty(suggested) ? null : suggested;
  });
  protected readonly name = computed(() => formationName(this.assignments()));
  protected readonly teamGrade = computed(() => lineupGrade(this.assignments(), this.entries()));
  protected readonly options = computed(() => formationOptions(this.eligible(), this.format()));
  protected readonly bench = computed(() => benchOf(this.assignments(), this.entries()));

  /** Zonen mit ihren Spielern, bereit zum Anzeigen. */
  protected readonly visibleZones = computed(() => zonesForFormat(this.format(), this.assignments()));
  protected readonly board = computed(() =>
    this.visibleZones().map((zone) => ({
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
      this.eventsService.start();
      this.settings.start();
    }
  }

  protected formatDate = formatDate;

  protected onTargetSelect(event: Event): void {
    this.chosen.set((event.target as HTMLSelectElement).value);
  }

  /** Übernimmt die Aufstellung des letzten Spiels mit Aufstellung und legt sie am Ziel-Spiel ab. */
  protected copyFromPrevious(): void {
    const game = this.targetGame();
    const source = this.previousGame();
    if (!game || !source || !this.lineup.canEdit()) return;
    const entry = this.lineup.eventLineups()[source.id];
    if (entry) this.lineup.saveForEvent(game.id, entry.assignments, undefined, entry.gameFormat);
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

  protected adaptToFormat(): void {
    this.apply(fitToFormat(this.assignments(), this.format()));
  }

  protected applySuggestion(): void {
    const suggested = this.suggestion();
    if (suggested) this.apply(suggested);
  }

  protected applyFormation(index: number): void {
    const option = this.options()[index];
    if (option) this.apply(assignmentsFromPreview(option.preview.assigned));
  }

  protected onFormationSelect(event: Event): void {
    const index = Number((event.target as HTMLSelectElement).value);
    if (Number.isInteger(index) && index >= 0 && index < this.options().length) this.applyFormation(index);
  }

  /** Spielform für das gewählte Spiel ändern; zu viele Spieler (oder der Torwart bei 3:3) gehen auf die Bank. */
  protected onFormatSelect(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const game = this.targetGame();
    const value = select.value;
    if (!game || !isGameFormat(value) || !this.lineup.saveForEvent(game.id, fitToFormat(this.assignments(), value), undefined, value)) {
      select.value = this.format();
    }
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
    if (this.eventsService.load() === 'error') {
      this.eventsService.stop();
      this.eventsService.start();
    }
  }

  private place(playerId: string, zone: Zone): void {
    const next = moveToZone(this.assignments(), playerId, zone, this.max());
    if (next === 'voll') {
      this.message.set(`Die Startelf ist bereits voll (${this.max()} Spieler). Nimm zuerst jemanden vom Feld, bevor du einen weiteren Spieler aufstellst.`);
      return;
    }
    this.apply(next);
  }

  private apply(next: Assignments): void {
    const game = this.targetGame();
    const saved = game ? this.lineup.saveForEvent(game.id, next, undefined, this.storedForTarget()?.gameFormat) : this.lineup.save(next);
    if (saved) this.target.set(null);
  }
}
