import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { COMPETENCE_DOMAINS, COMPETENCE_FRAMEWORK_VERSION, DOMAIN_HINTS, DOMAIN_LABELS, OBSERVATION_MAX, OCCASION_LABELS, criterionById, stepLabel, weightProfileById } from '../../core/competence/competence-catalog';
import { type CompetenceObservation, type DomainProfile } from '../../core/competence/competence';
import { CompetenceService } from '../../core/competence/competence.service';
import type { TeamEvent } from '../../core/events/event';
import { type Player, isConsentRevoked } from '../../core/player/player';
import { formatDate } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';
import { CompetenceObservationDialog } from './competence-observation-dialog';

/**
 * Entwicklungsraster im Spielerprofil (SCRUM-266, docs/bewertungsmodell.md): Bereichsprofil aus Beobachtungen über die
 * Zeit, getrennt von den Eventnoten (Momentaufnahmen je Termin). Nur Trainer. Ungemessene Bereiche heißen „nicht
 * erhoben“ (kein Wert, keine 0). Ein Gesamtindex erscheint nur, wenn das Team ihn eingeschaltet hat und die Abdeckung
 * reicht – immer mit Gewichten, Version und Datengrundlage.
 */
@Component({
  selector: 'tk-competence-card',
  imports: [Button, Card, Dialog, CompetenceObservationDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./profile-stats.css'],
  styles: `
    :host {
      display: block;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--tk-space-2);
    }
    .head h2 {
      margin: 0;
    }
    .muted {
      margin: 0;
      color: var(--tk-muted);
      font-size: var(--tk-text-sm);
    }
    .basis {
      margin: var(--tk-space-3) 0;
    }
    .snapshot {
      margin: var(--tk-space-3) 0;
      padding: var(--tk-space-2) var(--tk-space-3);
      background: var(--tk-soft-amber);
      border-radius: var(--tk-radius-md);
      font-size: var(--tk-text-sm);
    }
    .domains {
      display: grid;
      gap: var(--tk-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .domains > li {
      display: grid;
      gap: 4px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 4px var(--tk-space-2);
      font-size: var(--tk-text-sm);
    }
    .bar span {
      background: var(--tk-blue);
    }
    [data-state='none'] .value,
    [data-state='off'] .value {
      color: var(--tk-muted);
      font-style: italic;
    }
    details summary {
      cursor: pointer;
      min-height: 32px;
      color: var(--tk-muted);
      font-size: var(--tk-text-sm);
    }
    .criteria {
      display: grid;
      gap: 2px;
      margin: 4px 0 0;
      padding: 0 0 0 var(--tk-space-3);
      list-style: none;
      font-size: var(--tk-text-sm);
    }
    .index {
      margin-top: var(--tk-space-4);
      padding: var(--tk-space-3);
      background: var(--tk-surface-2);
      border-radius: var(--tk-radius-md);
      font-size: var(--tk-text-sm);
    }
    .index p,
    .index ul {
      margin: 4px 0 0;
    }
    .observations {
      display: grid;
      gap: var(--tk-space-2);
      margin: var(--tk-space-2) 0 0;
      padding: 0;
      list-style: none;
      font-size: var(--tk-text-sm);
    }
    .observations li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--tk-space-2);
    }
    .observations li > span {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .confirm-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--tk-space-2);
    }
    .error {
      color: var(--tk-red);
      font-size: var(--tk-text-sm);
    }
  `,
  template: `
    @if (service.visible()) {
      <tk-card>
        <section class="competence" aria-labelledby="competence-title" data-testid="competence-card">
          <div class="head">
            <div>
              <h2 id="competence-title">Entwicklungsraster</h2>
              <p class="muted">Profil aus Beobachtungen über die Zeit ({{ framework }}) – getrennt von den Eventnoten. Nur für Trainer sichtbar.</p>
            </div>
            @if (!revoked()) {
              <button tkButton size="sm" type="button" data-testid="competence-add" [disabled]="service.state() !== 'ready'" (click)="dialogOpen.set(true)">+ Beobachtung</button>
            }
          </div>
          @if (revoked()) {
            <p class="muted" role="note">Einwilligung widerrufen: keine neuen Beobachtungen. Vorhandene bleiben, bis du sie löschst.</p>
          }

          @if (service.state() === 'error') {
            <p class="error" role="alert">{{ service.error() }}</p>
          } @else if (service.state() !== 'ready') {
            <p class="muted" role="status">Beobachtungen werden geladen …</p>
          } @else {
            @if (profile().observations === 0) {
              <p class="muted basis" data-testid="competence-basis">Noch keine Beobachtung im letzten Jahr. Jeder Bereich ist „nicht erhoben“.</p>
            } @else {
              <p class="muted basis" data-testid="competence-basis">
                Aus {{ profile().observations }} Beobachtung(en) an {{ profile().days }} Tag(en), {{ formatDate(profile().from) }} – {{ formatDate(profile().to) }}. Je Kriterium zählen die letzten drei.
              </p>
            }
            @if (profile().snapshotOnly) {
              <p class="snapshot" role="note" data-testid="competence-snapshot">Bisher nur eine Momentaufnahme (alle Beobachtungen von einem Tag) – noch kein Profil.</p>
            }
            <ul class="domains">
              @for (domain of profile().domains; track domain.domain) {
                <li [attr.data-domain]="domain.domain" [attr.data-state]="domain.state">
                  <div class="row">
                    <strong>{{ labels[domain.domain] }}</strong>
                    <span class="value">{{ valueText(domain) }}</span>
                  </div>
                  @if (domain.state === 'observed') {
                    <div class="bar" role="img" [attr.aria-label]="labels[domain.domain] + ': ' + valueText(domain)"><span [style.width.%]="percent(domain.value)"></span></div>
                    <small class="muted">{{ domain.observedCriteria }} von {{ domain.totalCriteria }} Kriterien · {{ domain.observations }} Beobachtung(en) · zuletzt {{ formatDate(domain.lastDate ?? '') }}</small>
                  }
                  @if (domain.state !== 'off') {
                    <details>
                      <summary>Kriterien</summary>
                      @if (hints[domain.domain]; as hint) { <p class="muted">{{ hint }}</p> }
                      <ul class="criteria">
                        @for (entry of domain.criteria; track entry.criterion.id) {
                          <li><span>{{ entry.criterion.label }}:</span> {{ entry.value === null ? 'nicht erhoben' : stepLabel(entry.value) + ' (' + entry.count + '×)' }}</li>
                        }
                      </ul>
                    </details>
                  }
                </li>
              }
            </ul>

            @switch (index().kind) {
              @case ('insufficient') {
                <div class="index" data-testid="competence-index">
                  <strong>Kein Gesamtindex</strong> – die Datengrundlage reicht noch nicht:
                  <ul>
                    @for (reason of reasons(); track reason) { <li>{{ reason }}</li> }
                  </ul>
                </div>
              }
              @case ('index') {
                @if (indexValue(); as idx) {
                  <div class="index" data-testid="competence-index">
                    <strong>Gesamtindex (optional): {{ decimal(idx.value) }} von {{ max }}</strong> – entspricht etwa „{{ stepLabel(idx.value) }}“.
                    <p>Gewichte: {{ weightsText(idx.weights) }}.</p>
                    <p>Einstellung Version {{ idx.configVersion }} · {{ profileLabel(idx.weightProfile) }} (Hypothese, nicht wissenschaftlich festgelegt) · Raster {{ idx.framework }}.</p>
                    <p>Grundlage: {{ idx.observations }} Beobachtung(en) an {{ idx.days }} Tag(en), {{ formatDate(idx.from) }} – {{ formatDate(idx.to) }}.</p>
                    <p class="muted">Der Index ist eine Zusammenfassung für dieses Profil – kein Talentwert und kein Vergleich mit anderen Spielern.</p>
                  </div>
                }
              }
            }

            @if (service.recent().length > 0) {
              <details class="list">
                <summary>Beobachtungen · {{ service.recent().length }}</summary>
                <ul class="observations">
                  @for (entry of service.recent(); track entry.id) {
                    <li>
                      <span>{{ formatDate(entry.date) }} · {{ occasions[entry.occasion] }}@if (entry.position) { · {{ entry.position }}} · {{ criterionText(entry) }}: {{ stepLabel(entry.value) }} · {{ entry.by }}@if (entry.note) { – {{ entry.note }}}</span>
                      <button tkButton size="sm" variant="ghost" type="button" [attr.aria-label]="'Beobachtung vom ' + formatDate(entry.date) + ' löschen'" (click)="pendingDelete.set(entry)">Löschen</button>
                    </li>
                  }
                </ul>
              </details>
            }
          }
        </section>
      </tk-card>
      <tk-dialog [open]="pendingDelete() !== null" title="Beobachtung löschen" (closed)="pendingDelete.set(null)">
        @if (pendingDelete(); as entry) {
          <p>Beobachtung vom {{ formatDate(entry.date) }} ({{ criterionText(entry) }}: {{ stepLabel(entry.value) }}) wird gelöscht. Das lässt sich nicht rückgängig machen.</p>
        }
        <div class="confirm-actions">
          <button tkButton type="button" (click)="pendingDelete.set(null)">Abbrechen</button>
          <button tkButton type="button" variant="primary" data-testid="competence-delete-confirm" [disabled]="busy()" (click)="remove()">{{ busy() ? 'Bitte warten …' : 'Endgültig löschen' }}</button>
        </div>
      </tk-dialog>
      <tk-competence-observation-dialog [open]="dialogOpen()" [positions]="player().positions" [events]="events()" (closed)="dialogOpen.set(false)" />
    }
  `,
})
export class CompetenceCard {
  protected readonly service = inject(CompetenceService);
  readonly player = input.required<Player>();
  readonly events = input<readonly TeamEvent[]>([]);

  protected readonly dialogOpen = signal(false);
  protected readonly pendingDelete = signal<CompetenceObservation | null>(null);
  protected readonly busy = signal(false);
  protected readonly labels = DOMAIN_LABELS;
  protected readonly hints = DOMAIN_HINTS;
  protected readonly occasions = OCCASION_LABELS;
  protected readonly max = OBSERVATION_MAX;
  protected readonly framework = COMPETENCE_FRAMEWORK_VERSION;
  protected readonly formatDate = formatDate;
  protected readonly stepLabel = stepLabel;
  protected readonly profile = this.service.profile;
  protected readonly index = this.service.index;
  protected readonly revoked = computed(() => isConsentRevoked(this.player()));
  protected readonly reasons = computed(() => {
    const index = this.index();
    return index.kind === 'insufficient' ? index.reasons : [];
  });
  protected readonly indexValue = computed(() => {
    const index = this.index();
    return index.kind === 'index' ? index : null;
  });

  constructor() {
    effect(() => {
      const id = this.player().id;
      untracked(() => this.service.start(id));
    });
  }

  protected valueText(domain: DomainProfile): string {
    if (domain.state === 'off') return 'in diesem Team nicht erhoben';
    if (domain.state === 'none' || domain.value === null) return 'nicht erhoben';
    return `überwiegend „${stepLabel(domain.value)}“`;
  }

  /** 1–4 → Balkenbreite (1 = 25 %, 4 = 100 %). Nur für erhobene Bereiche. */
  protected percent(value: number | null): number {
    return value === null ? 0 : Math.round((value / OBSERVATION_MAX) * 100);
  }

  protected decimal(value: number): string {
    return value.toFixed(1).replace('.', ',');
  }

  protected weightsText(weights: Readonly<Partial<Record<string, number>>>): string {
    return COMPETENCE_DOMAINS.filter((domain) => (weights[domain] ?? 0) > 0)
      .map((domain) => `${DOMAIN_LABELS[domain]} ${weights[domain]} %`)
      .join(', ');
  }

  protected profileLabel(id: string): string {
    return weightProfileById(id)?.label ?? id;
  }

  protected criterionText(entry: CompetenceObservation): string {
    return criterionById(entry.criterionId)?.label ?? `${entry.criterionId} (${entry.framework})`;
  }

  protected async remove(): Promise<void> {
    const entry = this.pendingDelete();
    if (!entry || this.busy()) return;
    this.busy.set(true);
    await this.service.deleteObservation(entry.id);
    this.busy.set(false);
    this.pendingDelete.set(null);
  }
}
