import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { CONSENT_LABELS, type Player } from '../../core/player/player';
import { SquadService } from '../../core/player/squad.service';
import {
  CONDITIONS_MAX,
  type FieldTestPlayerDraft,
  type FieldTestSessionDraft,
  type FieldTestSessionErrors,
  MIN_TEST_DATE,
  TESTER_MAX,
  attemptError,
  evaluateSession,
} from '../../core/records/field-test';
import {
  DIRECTION_LABELS,
  type FieldTestMethod,
  type FieldTestProtocol,
  type FieldTestSurface,
  METHOD_LABELS,
  SURFACE_LABELS,
  aggregationText,
  currentProtocols,
} from '../../core/records/field-test-protocols';
import { FieldTestsService, mayRecordFieldTest } from '../../core/records/field-tests.service';
import { decimalText } from '../../core/records/measurement-protocol';
import { formatDate, todayIso } from '../../core/shared/dates';
import { SyncService } from '../../core/shell/sync.service';
import { CurrentTeam } from '../../core/team/current-team.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

interface Row {
  readonly values: readonly string[];
  readonly invalid: readonly boolean[];
}

/**
 * Feldtests (SCRUM-263, nur Trainer): einen Testtermin für mehrere Spieler erfassen – ein Test, ein Datum, eine
 * Messmethode, Tester und Bedingungen für alle, dazu je Spieler die einzelnen Versuche. Wer keine Eingabe hat, bekommt
 * kein Ergebnis (kein Nullwert). Ergebnisse stehen danach im Spielerprofil unter „Feldtests“.
 */
@Component({
  selector: 'app-field-tests',
  imports: [Button, Card, RouterLink],
  templateUrl: './field-tests.html',
  styleUrl: './field-tests.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldTests implements OnInit {
  private readonly session = inject(SessionService);
  protected readonly squad = inject(SquadService);
  protected readonly sync = inject(SyncService);
  private readonly team = inject(CurrentTeam);
  private readonly fieldTests = inject(FieldTestsService);

  protected readonly protocols = currentProtocols();
  protected readonly methodLabels = METHOD_LABELS;
  protected readonly surfaces = Object.entries(SURFACE_LABELS) as [FieldTestSurface, string][];
  protected readonly directionLabels = DIRECTION_LABELS;
  protected readonly consentLabels = CONSENT_LABELS;
  protected readonly testerMax = TESTER_MAX;
  protected readonly conditionsMax = CONDITIONS_MAX;
  protected readonly minDate = MIN_TEST_DATE;
  protected readonly today = todayIso();
  protected readonly formatDate = formatDate;

  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');
  protected readonly draft = signal<FieldTestSessionDraft>({ protocolId: '', date: todayIso(), method: '', tester: '', surface: '', conditions: '' });
  protected readonly rows = signal<Readonly<Record<string, Row>>>({});
  protected readonly errors = signal<FieldTestSessionErrors>({});
  protected readonly playerErrors = signal<ReadonlyMap<string, { attempts: readonly string[]; general: string }>>(new Map());
  protected readonly busy = signal(false);
  protected readonly done = signal('');
  protected readonly saveError = signal('');

  protected readonly protocol = computed<FieldTestProtocol | null>(() => this.protocols.find((entry) => entry.id === this.draft().protocolId) ?? null);
  protected readonly slots = computed(() => Array.from({ length: this.protocol()?.attempts ?? 0 }, (_, index) => index));
  private readonly sorted = computed(() => [...this.squad.players()].sort((a, b) => a.name.localeCompare(b.name, 'de')));
  protected readonly allowed = computed(() => this.sorted().filter((player) => mayRecordFieldTest(player, this.team.id())));
  protected readonly blocked = computed(() => this.sorted().filter((player) => !mayRecordFieldTest(player, this.team.id())));
  /** Wie viele Spieler mindestens einen Versuch eingetragen haben. */
  protected readonly filled = computed(() => Object.values(this.rows()).filter((row) => row.values.some((value) => value.trim()) || row.invalid.some(Boolean)).length);

  ngOnInit(): void {
    this.squad.start();
    this.draft.update((draft) => ({ ...draft, tester: this.session.displayName().slice(0, TESTER_MAX) }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected patch(change: Partial<FieldTestSessionDraft>): void {
    this.done.set('');
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  /** Neuer Test: Methode auf die empfohlene setzen, Versuche leeren (andere Einheit). */
  protected chooseProtocol(id: string): void {
    const protocol = this.protocols.find((entry) => entry.id === id);
    this.patch({ protocolId: id, method: protocol?.methods[0] ?? '' });
    this.rows.set({});
    this.errors.set({});
    this.playerErrors.set(new Map());
  }

  protected row(playerId: string): Row {
    return this.rows()[playerId] ?? { values: [], invalid: [] };
  }

  protected setValue(playerId: string, index: number, text: string): void {
    this.done.set('');
    this.rows.update((rows) => {
      const row = rows[playerId] ?? { values: [], invalid: [] };
      const values = [...row.values];
      values[index] = text;
      return { ...rows, [playerId]: { ...row, values } };
    });
  }

  protected toggleInvalid(playerId: string, index: number, checked: boolean): void {
    this.done.set('');
    this.rows.update((rows) => {
      const row = rows[playerId] ?? { values: [], invalid: [] };
      const invalid = [...row.invalid];
      invalid[index] = checked;
      return { ...rows, [playerId]: { ...row, invalid } };
    });
  }

  /** Sofortprüfung eines Werts beim Verlassen des Felds (die volle Prüfung kommt beim Speichern). */
  protected attemptMessage(playerId: string, index: number): string {
    const saved = this.playerErrors().get(playerId)?.attempts[index];
    if (saved) return saved;
    const protocol = this.protocol();
    return protocol ? attemptError(this.row(playerId).values[index] ?? '', protocol) : '';
  }

  protected generalMessage(playerId: string): string {
    return this.playerErrors().get(playerId)?.general ?? '';
  }

  protected rangeText(protocol: FieldTestProtocol): string {
    return `${decimalText(protocol.min)}–${decimalText(protocol.max)} ${protocol.unit}${protocol.step ? `, in Schritten von ${protocol.step} ${protocol.unit}` : ''}`;
  }

  protected methodsOf(protocol: FieldTestProtocol | null): readonly FieldTestMethod[] {
    return protocol?.methods ?? [];
  }

  protected ruleText(protocol: FieldTestProtocol): string {
    return aggregationText(protocol);
  }

  private playerDrafts(): FieldTestPlayerDraft[] {
    return this.allowed().map((player: Player) => ({ playerId: player.id, values: this.row(player.id).values, invalid: this.row(player.id).invalid }));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || !this.isTrainer()) return;
    this.saveError.set('');
    this.done.set('');
    // Vorab prüfen, damit Fehler sofort sichtbar sind; der Dienst prüft beim Speichern noch einmal.
    const check = evaluateSession(this.draft(), this.playerDrafts(), { today: todayIso(), birthdates: new Map(this.allowed().map((player) => [player.id, player.birthdate])) });
    this.errors.set(check.errors);
    this.playerErrors.set(check.playerErrors);
    if (!check.ok) return;
    this.busy.set(true);
    try {
      const result = await this.fieldTests.saveSession(this.draft(), this.playerDrafts());
      this.errors.set(result.evaluation.errors);
      this.playerErrors.set(result.evaluation.playerErrors);
      if (result.error) {
        this.saveError.set(result.error);
        // Gespeicherte Spieler aus dem Formular nehmen, damit ein zweiter Versuch sie nicht doppelt anlegt.
        this.rows.update((rows) => Object.fromEntries(Object.entries(rows).filter(([id]) => !result.saved.includes(id))));
        return;
      }
      if (result.saved.length > 0) {
        const name = this.protocol()?.name ?? 'Feldtest';
        this.done.set(`${name} vom ${formatDate(this.draft().date)} für ${result.saved.length} Spieler gespeichert. Spieler ohne Eingabe haben kein Ergebnis bekommen.`);
        this.rows.set({});
      }
    } finally {
      this.busy.set(false);
    }
  }
}
