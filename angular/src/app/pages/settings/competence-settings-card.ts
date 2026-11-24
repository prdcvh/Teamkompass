import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { COMPETENCE_DOMAINS, type CompetenceDomain, DOMAIN_LABELS, WEIGHT_PROFILES, WEIGHT_TOLERANCE, weightProfileById } from '../../core/competence/competence-catalog';
import { type CompetenceConfig, type ConfigDraft, suggestedWeights, validateConfigDraft, weightBounds } from '../../core/competence/competence';
import { CompetenceService } from '../../core/competence/competence.service';
import { formatDate } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

function draftOf(config: CompetenceConfig): ConfigDraft {
  return { domains: config.domains, weightProfile: config.weightProfile, weights: config.weights, indexEnabled: config.indexEnabled };
}

/**
 * Einstellungen → „Entwicklungsraster“ (nur Trainer, SCRUM-266, docs/bewertungsmodell.md §7): erhobene Bereiche,
 * Gewichtsprofil (Hypothese) mit Gewichten innerhalb ±10 Prozentpunkten und ob ein Gesamtindex gezeigt wird. Jedes
 * Speichern legt eine neue, unveränderliche Version an; die Liste zeigt alle Versionen.
 */
@Component({
  selector: 'tk-competence-settings-card',
  imports: [Button, Card],
  styleUrl: './settings.css',
  styles: `
    fieldset {
      display: grid;
      gap: var(--tk-space-2);
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: var(--tk-space-2);
      font-weight: 700;
    }
    .weight input {
      width: 5.5rem;
    }
    .weight small {
      color: var(--tk-muted);
    }
    .history {
      display: grid;
      gap: 4px;
      margin: 4px 0 0;
      padding-left: var(--tk-space-4);
      font-size: var(--tk-text-sm);
    }
    details summary {
      cursor: pointer;
      min-height: 32px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (service.visible()) {
      <tk-card>
        <div class="panel" id="entwicklungsraster" data-testid="competence-settings">
          <h2>Entwicklungsraster (Cloud, für das Team)</h2>
          <p class="muted">
            Bereiche, die ihr im Profil über Beobachtungen erhebt – getrennt von den Eventnoten. Nicht erhobene Bereiche erscheinen als
            „nicht erhoben“. Gültig ist Version {{ service.config().version }}@if (service.config().version === 0) { (Standard, noch nichts gespeichert)}.
          </p>
          @if (service.configState() === 'error') {
            <p class="error" role="alert">{{ service.configError() }}</p>
          } @else if (service.configState() !== 'ready') {
            <p class="muted" role="status">Wird geladen …</p>
          } @else {
            <fieldset>
              <legend>Erhobene Bereiche</legend>
              @for (domain of domains; track domain) {
                <label class="row">
                  <span>{{ labels[domain] }}</span>
                  <input type="checkbox" [checked]="draft().domains.includes(domain)" [attr.data-testid]="'competence-domain-' + domain" (change)="toggleDomain(domain, checked($event))" />
                </label>
              }
            </fieldset>
            <label class="tk-label">
              Gewichtsprofil für einen Gesamtindex
              <select class="tk-input" data-testid="competence-profile" (change)="chooseProfile(value($event))">
                <option value="" [selected]="!draft().weightProfile">kein Gesamtindex</option>
                @for (profile of profiles; track profile.id) {
                  <option [value]="profile.id" [selected]="draft().weightProfile === profile.id">{{ profile.label }}</option>
                }
              </select>
            </label>
            @if (draft().weightProfile) {
              <p class="muted">
                Die Profile sind Hypothesen, keine wissenschaftlich festgelegten Gewichte. Jedes Gewicht darf um höchstens {{ tolerance }}
                Prozentpunkte vom Profil abweichen; zusammen 100 %.
              </p>
              <fieldset>
                <legend>Gewichte</legend>
                @for (domain of activeDomains(); track domain) {
                  <label class="row weight">
                    <span>{{ labels[domain] }} <small>({{ bounds(domain)[0] }}–{{ bounds(domain)[1] }} %)</small></span>
                    <input class="tk-input" type="number" inputmode="numeric" step="1" [attr.min]="bounds(domain)[0]" [attr.max]="bounds(domain)[1]"
                      [value]="draft().weights[domain] ?? ''" [attr.data-testid]="'competence-weight-' + domain" (input)="setWeight(domain, value($event))" />
                  </label>
                }
                <p class="muted" data-testid="competence-weight-sum">Summe: {{ sum() }} %</p>
              </fieldset>
              <label class="row">
                <span>Gesamtindex im Profil zeigen (nur bei ausreichender Datengrundlage, nie als Rangliste)</span>
                <input type="checkbox" data-testid="competence-index-enabled" [checked]="draft().indexEnabled" (change)="patch({ indexEnabled: checked($event) })" />
              </label>
            }
            @for (error of errors(); track error) {
              <p class="error" role="alert">{{ error }}</p>
            }
            @if (saved()) {
              <p class="muted" role="status">Gespeichert als Version {{ service.config().version }}.</p>
            }
            <div>
              <button tkButton type="button" variant="primary" data-testid="competence-save" [disabled]="busy() || !changed()" (click)="save()">
                {{ busy() ? 'Speichert …' : 'Als neue Version speichern' }}
              </button>
            </div>
            @if (service.history().length > 0) {
              <details>
                <summary>Alle Versionen · {{ service.history().length }}</summary>
                <ul class="history" data-testid="competence-history">
                  @for (entry of service.history(); track entry.version) {
                    <li>
                      Version {{ entry.version }} · {{ formatDate(entry.createdAt.slice(0, 10)) }} · {{ entry.by }}: {{ describe(entry) }}
                    </li>
                  }
                </ul>
              </details>
            }
          }
        </div>
      </tk-card>
    }
  `,
})
export class CompetenceSettingsCard {
  protected readonly service = inject(CompetenceService);
  protected readonly domains = COMPETENCE_DOMAINS;
  protected readonly labels = DOMAIN_LABELS;
  protected readonly profiles = WEIGHT_PROFILES;
  protected readonly tolerance = WEIGHT_TOLERANCE;
  protected readonly formatDate = formatDate;

  protected readonly draft = signal<ConfigDraft>(draftOf(this.service.config()));
  protected readonly errors = signal<readonly string[]>([]);
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly activeDomains = computed(() => COMPETENCE_DOMAINS.filter((domain) => this.draft().domains.includes(domain)));
  protected readonly sum = computed(() => this.activeDomains().reduce((total, domain) => total + (this.draft().weights[domain] ?? 0), 0));
  protected readonly changed = computed(() => JSON.stringify(this.normalized(this.draft())) !== JSON.stringify(this.normalized(draftOf(this.service.config()))));

  constructor() {
    // Laden, sobald die Rolle feststeht (nur Trainer).
    effect(() => {
      if (this.service.visible()) untracked(() => this.service.startConfigs());
    });
    // Neuer Stand aus der Cloud (auch nach dem eigenen Speichern) → Entwurf neu aufsetzen.
    effect(() => {
      const config = this.service.config();
      untracked(() => this.draft.set(draftOf(config)));
    });
  }

  protected bounds(domain: CompetenceDomain): readonly [number, number] {
    return weightBounds(this.draft().weightProfile ?? '', domain);
  }

  protected patch(change: Partial<ConfigDraft>): void {
    this.saved.set(false);
    this.errors.set([]);
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected toggleDomain(domain: CompetenceDomain, on: boolean): void {
    const domains = on ? [...this.draft().domains, domain] : this.draft().domains.filter((entry) => entry !== domain);
    const profile = this.draft().weightProfile;
    this.patch({ domains, weights: profile ? suggestedWeights(profile, domains) : {} });
  }

  protected chooseProfile(id: string): void {
    const profile = weightProfileById(id);
    if (!profile) {
      this.patch({ weightProfile: null, weights: {}, indexEnabled: false });
      return;
    }
    this.patch({ weightProfile: profile.id, weights: suggestedWeights(profile.id, this.draft().domains) });
  }

  protected setWeight(domain: CompetenceDomain, raw: string): void {
    const number = Number(raw);
    const weights = { ...this.draft().weights };
    if (raw.trim() && Number.isFinite(number)) weights[domain] = number;
    else delete weights[domain];
    this.patch({ weights });
  }

  protected describe(config: CompetenceConfig): string {
    const domains = config.domains.map((domain) => DOMAIN_LABELS[domain]).join(', ');
    if (!config.weightProfile) return `${domains}; kein Gesamtindex`;
    const weights = config.domains.map((domain) => `${DOMAIN_LABELS[domain]} ${config.weights[domain] ?? 0} %`).join(', ');
    return `${domains}; ${weightProfileById(config.weightProfile)?.label ?? config.weightProfile}: ${weights}; Index ${config.indexEnabled ? 'an' : 'aus'}`;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    const errors = validateConfigDraft(this.draft());
    if (errors.length > 0) {
      this.errors.set(errors);
      return;
    }
    this.busy.set(true);
    const result = await this.service.saveConfig(this.draft());
    this.busy.set(false);
    this.errors.set(result);
    this.saved.set(result.length === 0);
  }

  private normalized(draft: ConfigDraft): unknown {
    const domains = COMPETENCE_DOMAINS.filter((domain) => draft.domains.includes(domain));
    return { domains, weightProfile: draft.weightProfile, weights: domains.map((domain) => draft.weights[domain] ?? null), indexEnabled: draft.indexEnabled };
  }
}
