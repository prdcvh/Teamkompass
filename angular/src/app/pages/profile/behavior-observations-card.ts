import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { formatDate } from '../../core/events/event';
import {
  type BehaviorObservation,
  type CriterionSummary,
  type EvidenceEvent,
  MIN_OPPORTUNITIES,
  QUALITY_LABELS,
  type Quality,
  SOURCE_LABELS,
  anchorFor,
  criterionById,
  rangeLabel,
  uncalibratedReason,
} from '../../core/observations/behavior-observation';
import { BehaviorObservationsService } from '../../core/observations/behavior-observations.service';
import { type Player, isConsentRevoked } from '../../core/player/player';
import type { EventRating } from '../../core/profile/profile';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Chip, type Tone } from '../../ui/chip/chip';
import { BehaviorObservationDialog } from './behavior-observation-dialog';

const QUALITY_TONES: Readonly<Record<Quality, Tone>> = { none: 'neutral', limited: 'amber', sufficient: 'green', conflicting: 'blue' };

/**
 * Trainerbeobachtungen mit Verhaltensankern (SCRUM-268, docs/beobachtungsanker.md): je Kriterium die Einschätzung
 * jedes Trainers getrennt, mit Zeitraum, Gelegenheiten und Beleg, dazu die Güte (ausreichend beobachtet, begrenzte
 * Daten, widersprüchlich). Kein Mittelwert über Trainer, keine Rangliste, keine Typen oder Diagnosen. Nur Trainer.
 */
@Component({
  selector: 'tk-behavior-observations-card',
  imports: [Card, Button, Chip, BehaviorObservationDialog],
  styleUrl: './behavior-observations-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (service.visible()) {
      <tk-card>
        <section class="panel" data-testid="behavior-observations" aria-labelledby="behavior-title">
          <div class="head">
            <h2 id="behavior-title">Beobachtungen mit Verhaltensankern</h2>
            @if (canAdd()) {
              <button tkButton size="sm" type="button" (click)="openDialog('')">+ Beobachtung</button>
            }
          </div>
          <p class="muted">
            Jede Einschätzung beschreibt beobachtetes Verhalten in einem Zeitraum – keine feste Eigenschaft, keine Diagnose, kein Talenturteil.
            Einschätzungen mehrerer Trainer stehen nebeneinander und werden nicht gemittelt. Nur für Trainer sichtbar.
          </p>
          @if (revoked()) {
            <p class="notice" role="status">Die Datennutzung wurde widerrufen: keine neuen Beobachtungen. Vorhandene bleiben lesbar, bis du sie löschst.</p>
          }

          @switch (service.state()) {
            @case ('error') {
              <p class="error" role="alert">{{ service.error() }}</p>
            }
            @case ('ready') {
              <ul class="criteria">
                @for (summary of service.summaries(); track summary.criterion.id) {
                  <li class="criterion" [attr.data-testid]="'criterion-' + summary.criterion.id" [attr.data-quality]="summary.quality">
                    <div class="criterion-head">
                      <strong>{{ summary.criterion.label }}</strong>
                      <tk-chip [tone]="tone(summary.quality)">{{ qualityLabel(summary.quality) }}</tk-chip>
                    </div>
                    @if (summary.range && summary.quality !== 'conflicting') {
                      <p class="level">
                        <b>{{ range(summary) }}</b>
                        @if (summary.range.min === summary.range.max) { – {{ anchorText(summary.criterion.id, summary.range.min) }} }
                      </p>
                    }
                    <p class="message" [class.uncertain]="summary.quality === 'limited' || summary.quality === 'conflicting'">{{ summary.message }}</p>
                    @if (summary.perAssessor.length > 0) {
                      <ul class="assessors">
                        @for (entry of summary.perAssessor; track entry.id) {
                          <li>
                            <span><b>{{ entry.by || 'Unbekannt' }}</b>: Stufe {{ entry.value }} – {{ anchorText(entry.criterionId, entry.value) }}</span>
                            <small>{{ facts(entry) }}</small>
                            @if (entry.evidence) { <small class="evidence">Beleg: „{{ entry.evidence }}“</small> }
                          </li>
                        }
                      </ul>
                    }
                    @if (canAdd()) {
                      <button tkButton size="sm" variant="neutral" type="button" class="add" [attr.aria-label]="'Einschätzung zu ' + summary.criterion.label + ' eintragen'" (click)="openDialog(summary.criterion.id)">+ Einschätzung</button>
                    }
                  </li>
                }
              </ul>

              @if (service.history().length > 0) {
                <details class="fold">
                  <summary>Alle Einträge · {{ service.history().length }}</summary>
                  <ul class="history">
                    @for (entry of service.history(); track entry.id) {
                      <li>
                        <div>
                          <span><b>{{ label(entry.criterionId) }}</b> · Stufe {{ entry.value }} · {{ entry.by || 'Unbekannt' }}</span>
                          <small>{{ facts(entry) }}</small>
                        </div>
                        @if (pendingDelete() === entry.id) {
                          <span class="confirm">
                            <button tkButton size="sm" variant="primary" type="button" (click)="remove(entry.id)">Wirklich löschen</button>
                            <button tkButton size="sm" variant="neutral" type="button" (click)="pendingDelete.set(null)">Abbrechen</button>
                          </span>
                        } @else {
                          <button tkButton size="sm" variant="neutral" type="button" (click)="pendingDelete.set(entry.id)" [attr.aria-label]="'Eintrag vom ' + format(entry.date) + ' löschen'">Löschen</button>
                        }
                      </li>
                    }
                  </ul>
                </details>
              }

              @if (service.legacy().length > 0) {
                <details class="fold" data-testid="behavior-legacy">
                  <summary>Historisch / unkalibriert · {{ service.legacy().length }}</summary>
                  <p class="muted">Diese Einträge sind ohne vollständigen Beleg (Anker, Zeitraum, Gelegenheiten) gespeichert. Sie bleiben lesbar, zählen aber nicht zur Einschätzung oben.</p>
                  <ul class="history">
                    @for (entry of service.legacy(); track entry.id) {
                      <li>
                        <div>
                          <span><b>{{ label(entry.criterionId) }}</b> · Wert {{ entry.value }} · {{ entry.by || 'Unbekannt' }} · {{ format(entry.date) }}</span>
                          <small>Historisch/unkalibriert: {{ reason(entry) }}</small>
                        </div>
                        @if (pendingDelete() === entry.id) {
                          <span class="confirm">
                            <button tkButton size="sm" variant="primary" type="button" (click)="remove(entry.id)">Wirklich löschen</button>
                            <button tkButton size="sm" variant="neutral" type="button" (click)="pendingDelete.set(null)">Abbrechen</button>
                          </span>
                        } @else {
                          <button tkButton size="sm" variant="neutral" type="button" (click)="pendingDelete.set(entry.id)">Löschen</button>
                        }
                      </li>
                    }
                  </ul>
                </details>
              }
            }
            @default {
              <p class="muted" role="status">Beobachtungen werden geladen …</p>
            }
          }

          <p class="muted legacy-note" data-testid="legacy-grades-note">
            Die bisherigen Eventnoten (Kompetenzprofil, Eventhistorie) haben keinen Verhaltensanker und keine Zahl der Beobachtungen. Sie bleiben unverändert
            lesbar und gelten als historisch/unkalibriert. „Ausreichend beobachtet“ heißt hier: mindestens {{ minOpportunities }} konkrete Gelegenheiten – das ist
            eine Faustregel, keine statistische Sicherheit.
          </p>
        </section>
      </tk-card>
      <tk-behavior-observation-dialog [open]="dialogOpen()" [criterionId]="dialogCriterion()" [events]="evidenceEvents()" (closed)="dialogOpen.set(false)" />
    }
  `,
})
export class BehaviorObservationsCard {
  protected readonly service = inject(BehaviorObservationsService);

  readonly player = input.required<Player>();
  /** Termine des Spielers mit seiner Bewertung (für den Beleg „Termin“). */
  readonly items = input.required<readonly EventRating[]>();

  protected readonly minOpportunities = MIN_OPPORTUNITIES;
  protected readonly dialogOpen = signal(false);
  protected readonly dialogCriterion = signal('');
  protected readonly pendingDelete = signal<string | null>(null);
  protected readonly revoked = computed(() => isConsentRevoked(this.player()));
  protected readonly canAdd = computed(() => this.service.state() === 'ready' && !this.revoked());
  /** Termine, bei denen der Spieler nicht als „Fehlt“ oder „Nicht im Kader“ eingetragen ist. */
  protected readonly evidenceEvents = computed<EvidenceEvent[]>(() =>
    this.items()
      .filter((item) => item.rating?.attendance !== 'absent' && item.rating?.attendance !== 'excluded')
      .map((item) => ({ id: item.event.id, date: item.event.date, title: item.event.title })),
  );
  private readonly eventTitles = computed(() => new Map(this.items().map((item) => [item.event.id, `${item.event.title} (${formatDate(item.event.date)})`])));

  constructor() {
    effect(() => {
      const id = this.player().id;
      untracked(() => this.service.start(id));
    });
    inject(DestroyRef).onDestroy(() => this.service.stop());
  }

  protected openDialog(criterionId: string): void {
    this.dialogCriterion.set(criterionId);
    this.dialogOpen.set(true);
  }

  protected async remove(id: string): Promise<void> {
    this.pendingDelete.set(null);
    await this.service.remove(id);
  }

  protected tone(quality: Quality): Tone {
    return QUALITY_TONES[quality];
  }

  protected qualityLabel(quality: Quality): string {
    return QUALITY_LABELS[quality];
  }

  protected range(summary: CriterionSummary): string {
    return rangeLabel(summary.range);
  }

  protected anchorText(criterionId: string, value: number): string {
    return anchorFor(criterionId, value)?.text ?? '';
  }

  protected label(criterionId: string): string {
    return criterionById(criterionId)?.label ?? (criterionId || 'Ohne Kriterium');
  }

  protected reason(entry: BehaviorObservation): string {
    return uncalibratedReason(entry);
  }

  protected format(iso: string): string {
    return formatDate(iso);
  }

  /** Zeitraum, Gelegenheiten, Termin, Quelle und Datum in einer Zeile. */
  protected facts(entry: BehaviorObservation): string {
    const parts = [`${formatDate(entry.periodFrom)}–${formatDate(entry.periodTo)}`, `${entry.opportunities} ${entry.opportunities === 1 ? 'Gelegenheit' : 'Gelegenheiten'}`];
    if (entry.eventId) parts.push(`Termin: ${this.eventTitles().get(entry.eventId) ?? 'Termin gelöscht'}`);
    parts.push(`${SOURCE_LABELS[entry.source as keyof typeof SOURCE_LABELS] ?? entry.source} vom ${formatDate(entry.date)}`);
    return parts.join(' · ');
  }
}
