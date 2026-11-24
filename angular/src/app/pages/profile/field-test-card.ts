import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type FieldTestAttempt, type FieldTestEntry, type FieldTestGroup, methodLabel, surfaceLabel, valueText } from '../../core/records/field-test';
import { DIRECTION_LABELS } from '../../core/records/field-test-protocols';
import { FieldTestsService } from '../../core/records/field-tests.service';
import { type ReferenceComparison, MIN_N_PERCENTILE, MIN_N_Z, compareWithReference } from '../../core/records/field-test-reference';
import { FieldTestReferenceService } from '../../core/records/field-test-reference.service';
import { RecordsStateService } from '../../core/records/records-state.service';
import { isConsentRevoked } from '../../core/player/player';
import { SquadService } from '../../core/player/squad.service';
import { formatDate } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';

/**
 * Feldtests im Spielerprofil (SCRUM-263): je Test die Ergebnisse, neueste zuerst, mit Rohwerten aller Versuche, der
 * Regel, nach der das Ergebnis gebildet wurde, Messmethode und – beim Vergleich mit dem vorigen Ergebnis – einer
 * Warnung, wenn Testprotokoll, Methode, Einheit oder Untergrund abweichen. Keine Gesamtnote.
 * Sichtbar für alle, die die Messwerte lesen dürfen (gleiche Sammlung, gleiche Regeln); löschen nur Trainer.
 *
 * Vergleich im Team (SCRUM-264, nur Trainer): beim neuesten Ergebnis je Test z-Wert, normierter Index und – ab genug
 * Spielern – empirischer Perzentilrang gegenüber der Referenzgruppe, immer mit n, Zeitraum, Filtern, Regel-Version und
 * Gütehinweisen. Rechenregeln: field-test-reference.ts. Spieler, Eltern und Medizin sehen keinen Vergleich.
 */
@Component({
  selector: 'tk-field-test-card',
  imports: [Button, Card, Dialog, RouterLink],
  styleUrl: './field-test-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ft-block" aria-labelledby="field-tests-title">
      <div class="ft-head">
        <h2 id="field-tests-title">Feldtests</h2>
        @if (canEdit()) {
          <a tkButton size="sm" routerLink="/feldtests">+ Testtermin</a>
        }
      </div>
      <tk-card>
        @if (service.history().length === 0) {
          <p class="muted pad">Noch keine Feldtests für diesen Spieler eingetragen.</p>
        } @else {
          <p class="muted pad note">Jeder Test steht für sich – aus Feldtests wird keine Gesamtnote gebildet.</p>
          @for (group of service.history(); track group.protocolId) {
            <div class="group" [attr.data-protocol]="group.protocolId">
              <h3>{{ group.name }}</h3>
              <p class="muted small">{{ group.unit }}{{ group.direction ? ' · ' + directionLabels[group.direction] : '' }}</p>
              <ul class="ft-list">
                @for (entry of group.entries; track entry.result.id) {
                  <li>
                    <div>
                      <strong>{{ formatDate(entry.result.date) }}: {{ resultText(entry) }}</strong>
                      <p class="small">{{ entry.outcome.missing || entry.outcome.rule + usedText(entry) }}</p>
                      <p class="small">Versuche: {{ attemptsText(entry) }}</p>
                      <p class="small method">{{ metaText(entry) }}</p>
                      @if (showDetails() && detailsText(entry)) { <p class="small muted">{{ detailsText(entry) }}</p> }
                      @if ($first && referenceVisible()) {
                        <div class="ref" data-testid="field-test-reference">
                          <p class="ref-title"><strong>Vergleich im Team</strong> <span class="muted">(nur für Trainer sichtbar)</span></p>
                          @if (referenceBlocked()) {
                            <p class="small">{{ referenceBlocked() }}</p>
                          } @else if (reference.state() === 'loading' || reference.state() === 'idle') {
                            <p class="small muted">Vergleich wird geladen …</p>
                          } @else if (reference.state() === 'error') {
                            <p class="small error" role="alert">Vergleich konnte nicht geladen werden.</p>
                          } @else {
                            @let ref = compare(entry);
                            @if (ref.group; as g) {
                              <dl class="ref-facts">
                                <div>
                                  <dt>z-Wert (richtungsbereinigt)</dt>
                                  <dd>{{ ref.z === null ? ref.zMissing : zText(ref.z) + ' – positiv heißt besser als der Schnitt' }}</dd>
                                </div>
                                <div>
                                  <dt>Normierter Index (50 + 10 · z, nicht gekappt – kein Perzentil)</dt>
                                  <dd>{{ ref.index === null ? '–' : indexText(ref.index) }}</dd>
                                </div>
                                <div>
                                  <dt>Perzentilrang (empirisch, Rang in dieser Gruppe)</dt>
                                  <dd>{{ ref.percentile === null ? ref.percentileMissing : percentileText(ref.percentile) }}</dd>
                                </div>
                              </dl>
                              <p class="small">Referenzgruppe: n = {{ g.n }} · {{ g.scope === 'birth-year' ? 'eigener Jahrgang' : 'ganzes Team (alle Jahrgänge)' }} · Zeitraum {{ formatDate(g.from) }}–{{ formatDate(g.to) }}{{ ref.mean !== null ? ' · Mittelwert ' + valueText(ref.mean, entry.protocol) + ' ' + entry.result.unit + ' · SD ' + valueText(ref.sd ?? 0, entry.protocol) + ' ' + entry.result.unit : '' }} · Regeln Version {{ g.rulesVersion }}</p>
                              <p class="small muted">Filter: {{ g.criteria.join(' · ') }}</p>
                              <p class="small muted">Nicht berücksichtigt: {{ g.notConsidered.join(' · ') }}</p>
                            } @else {
                              <p class="small">{{ ref.zMissing }}</p>
                            }
                            @for (hint of ref.hints; track $index) {
                              <p class="small warning" role="note">Hinweis: {{ hint }}</p>
                            }
                            @if (reference.failed() > 0) {
                              <p class="small warning" role="note">Hinweis: Für {{ reference.failed() }} Spieler konnten die Daten nicht geladen werden – sie fehlen im Vergleich.</p>
                            }
                            <p class="small muted">z-Wert und Index ab {{ minZ }} Spielern, Perzentilrang ab {{ minPercentile }} Spielern. Ein Vergleich ist kein Talentwert.</p>
                          }
                        </div>
                      }
                      @if (entry.comparison; as comparison) {
                        @if (comparison.delta !== null) {
                          <p class="small" [attr.data-improved]="comparison.improved">{{ deltaText(entry, group) }}</p>
                        }
                        @for (warning of comparison.warnings; track $index) {
                          <p class="small warning" role="note">Achtung: {{ warning }}</p>
                        }
                      }
                    </div>
                    @if (canEdit()) {
                      <div class="row-actions">
                        <button tkButton size="sm" type="button" class="danger" (click)="askDelete(entry, group)" [attr.aria-label]="'Feldtest löschen: ' + group.name + ' vom ' + formatDate(entry.result.date)">Löschen</button>
                      </div>
                    }
                  </li>
                }
              </ul>
            </div>
          }
        }
      </tk-card>
    </section>

    <!-- Nur solange ein Löschen offen ist: sonst stünde eine zweite Bestätigung neben der der Messwerte im Profil. -->
    @if (canEdit() && deleting() !== null) {
      <tk-dialog [open]="deleting() !== null" title="Feldtest löschen?" (closed)="deleting.set(null)">
        <p>{{ deleting()?.text }} wird mit allen Versuchen gelöscht. Das lässt sich nicht rückgängig machen.</p>
        @if (deleteFailed()) { <p class="error" role="alert">Löschen fehlgeschlagen. Bitte Verbindung prüfen und erneut versuchen.</p> }
        <div class="confirm-actions">
          <button tkButton type="button" (click)="deleting.set(null)">Abbrechen</button>
          <button tkButton type="button" variant="primary" [disabled]="deleteBusy()" (click)="confirmDelete()">{{ deleteBusy() ? 'Löscht …' : 'Endgültig löschen' }}</button>
        </div>
      </tk-dialog>
    }
  `,
})
export class FieldTestCard {
  protected readonly service = inject(FieldTestsService);
  protected readonly reference = inject(FieldTestReferenceService);
  private readonly records = inject(RecordsStateService);
  private readonly squad = inject(SquadService);

  /** Löschen und „+ Testtermin“ (nur Trainer im eigenen Profil-Bearbeitungsmodus). */
  readonly canEdit = input(false);
  /** Tester und Bedingungen (Trainer und Medizin). */
  readonly showDetails = input(false);

  protected readonly directionLabels = DIRECTION_LABELS;
  protected readonly formatDate = formatDate;
  protected readonly valueText = valueText;
  protected readonly minZ = MIN_N_Z;
  protected readonly minPercentile = MIN_N_PERCENTILE;

  /** Spieler dieses Profils (für Jahrgang und Einwilligung). */
  private readonly player = computed(() => this.squad.players().find((entry) => entry.id === this.records.playerId()) ?? null);
  protected readonly referenceVisible = computed(() => this.reference.visible() && this.records.playerId() !== null);
  /** Grund, warum es für diesen Spieler grundsätzlich keinen Vergleich gibt ('' = es gibt einen). */
  protected readonly referenceBlocked = computed(() => {
    const player = this.player();
    if (!player) return 'Spieler nicht im Kader – kein Vergleich.';
    return isConsentRevoked(player) ? 'Datennutzung widerrufen – kein Vergleich im Team.' : '';
  });

  constructor() {
    // Referenz einmal je Profil laden, sobald der Kader da ist (Trainer); andere Rollen laden nichts.
    let loadedFor = '';
    effect(() => {
      const playerId = this.records.playerId();
      const ready = this.squad.load() === 'ready';
      if (!this.reference.visible() || !playerId || !ready || loadedFor === playerId) return;
      loadedFor = playerId;
      untracked(() => void this.reference.load());
    });
  }

  protected compare(entry: FieldTestEntry): ReferenceComparison {
    return compareWithReference({ playerId: this.records.playerId() ?? '', birthdate: this.player()?.birthdate ?? '', result: entry.result }, this.reference.players());
  }

  protected zText(z: number): string {
    const rounded = Math.round(z * 10) / 10;
    return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${String(Math.abs(rounded).toFixed(1)).replace('.', ',')}`;
  }

  protected indexText(index: number): string {
    return String(Math.round(index));
  }

  protected percentileText(percentile: number): string {
    return `${Math.round(percentile)} – so viel Prozent der Gruppe haben einen schlechteren Wert (Gleichstände halb gezählt)`;
  }
  protected readonly deleting = signal<{ id: string; text: string } | null>(null);
  protected readonly deleteBusy = signal(false);
  protected readonly deleteFailed = signal(false);

  protected resultText(entry: FieldTestEntry): string {
    return entry.outcome.value === null ? 'kein Ergebnis' : `${valueText(entry.outcome.value, entry.protocol)} ${entry.result.unit}`;
  }

  protected usedText(entry: FieldTestEntry): string {
    const used = entry.outcome.used;
    if (used.length === 0) return '';
    return used.length === 1 ? ` – ${used[0]}. Versuch` : ` – Versuche ${used.join(', ')}`;
  }

  private attemptText(attempt: FieldTestAttempt, entry: FieldTestEntry): string {
    const value = attempt.value === null ? 'kein Wert' : `${valueText(attempt.value, entry.protocol)}`;
    return `${attempt.n}.: ${value}${attempt.valid ? '' : ' (ungültig)'}`;
  }

  protected attemptsText(entry: FieldTestEntry): string {
    return entry.result.attempts.length ? entry.result.attempts.map((attempt) => this.attemptText(attempt, entry)).join(' · ') : 'keine';
  }

  protected metaText(entry: FieldTestEntry): string {
    const version = entry.result.protocolVersion ? `Protokoll ${entry.result.protocolVersion}` : 'Protokoll unbekannt';
    return [`Methode: ${methodLabel(entry.result.method)}`, surfaceLabel(entry.result.surface), version].filter(Boolean).join(' · ');
  }

  protected detailsText(entry: FieldTestEntry): string {
    return [entry.result.tester ? `Gemessen von ${entry.result.tester}` : '', entry.result.conditions].filter(Boolean).join(' · ');
  }

  protected deltaText(entry: FieldTestEntry, group: FieldTestGroup): string {
    const comparison = entry.comparison;
    if (!comparison || comparison.delta === null) return '';
    const amount = `${valueText(Math.abs(comparison.delta), entry.protocol)} ${entry.result.unit}`;
    const since = `seit ${formatDate(comparison.previous.date)}`;
    if (comparison.delta === 0) return `Gleich wie am ${formatDate(comparison.previous.date)}.`;
    const change = comparison.delta > 0 ? `${amount} mehr` : `${amount} weniger`;
    const verdict = comparison.improved === null ? '' : comparison.improved ? ' (besser' : ' (schlechter';
    return `${change} ${since}${verdict ? `${verdict}, ${DIRECTION_LABELS[group.direction ?? 'lower']})` : ''}.`;
  }

  protected askDelete(entry: FieldTestEntry, group: FieldTestGroup): void {
    this.deleteFailed.set(false);
    this.deleting.set({ id: entry.result.id, text: `${group.name} vom ${formatDate(entry.result.date)}` });
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleting();
    if (!target || this.deleteBusy()) return;
    this.deleteBusy.set(true);
    this.deleteFailed.set(false);
    try {
      if (await this.service.deleteResult(target.id)) this.deleting.set(null);
      else this.deleteFailed.set(true);
    } finally {
      this.deleteBusy.set(false);
    }
  }
}
