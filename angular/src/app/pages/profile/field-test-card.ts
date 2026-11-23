import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type FieldTestAttempt, type FieldTestEntry, type FieldTestGroup, methodLabel, surfaceLabel, valueText } from '../../core/records/field-test';
import { DIRECTION_LABELS } from '../../core/records/field-test-protocols';
import { FieldTestsService } from '../../core/records/field-tests.service';
import { formatDate } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';

/**
 * Feldtests im Spielerprofil (SCRUM-263): je Test die Ergebnisse, neueste zuerst, mit Rohwerten aller Versuche, der
 * Regel, nach der das Ergebnis gebildet wurde, Messmethode und – beim Vergleich mit dem vorigen Ergebnis – einer
 * Warnung, wenn Testprotokoll, Methode, Einheit oder Untergrund abweichen. Keine Gesamtnote.
 * Sichtbar für alle, die die Messwerte lesen dürfen (gleiche Sammlung, gleiche Regeln); löschen nur Trainer.
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

    @if (canEdit()) {
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

  /** Löschen und „+ Testtermin“ (nur Trainer im eigenen Profil-Bearbeitungsmodus). */
  readonly canEdit = input(false);
  /** Tester und Bedingungen (Trainer und Medizin). */
  readonly showDetails = input(false);

  protected readonly directionLabels = DIRECTION_LABELS;
  protected readonly formatDate = formatDate;
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
