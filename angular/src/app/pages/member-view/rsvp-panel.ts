import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';
import { type TeamEvent, formatDate } from '../../core/events/event';
import { RSVP_REASON_MAX, type RsvpAnswer, type RsvpStatus } from '../../core/rsvp/rsvp';
import { RsvpService } from '../../core/rsvp/rsvp.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Chip, type Tone } from '../../ui/chip/chip';

/**
 * „Nächste Termine“ für Spieler und Eltern (SCRUM-205, wie SCRUM-175 in der bisherigen App): die nächsten 10 Termine
 * mit Zu-/Absage für den eigenen Spieler und einem freiwilligen Grund bei einer Absage. Für alle anderen Rollen
 * wird nichts angezeigt.
 */
@Component({
  selector: 'tk-rsvp-panel',
  imports: [Button, Card, Chip],
  template: `
    @if (rsvp.canAnswer()) {
      <tk-card>
        <section class="rsvp" aria-labelledby="rsvp-title">
          <h2 id="rsvp-title">Nächste Termine</h2>
          <p class="rsvp-hint">{{ parent() ? 'Sag für dein Kind zu oder ab.' : 'Sag dem Trainerteam, ob du dabei bist.' }}</p>
          @if (rsvp.error()) {
            <p class="rsvp-error" role="alert">{{ rsvp.error() }}</p>
          }
          @for (event of rsvp.upcoming(); track event.id) {
            <article class="rsvp-item" [attr.data-status]="status(event)">
              <div class="rsvp-head">
                <div class="rsvp-info">
                  <strong>{{ event.title || event.type }}</strong>
                  <small>{{ detail(event) }}</small>
                </div>
                <tk-chip [tone]="tone(event)">{{ pill(event) }}</tk-chip>
              </div>
              <form class="rsvp-form" (submit)="submit($event, event)">
                <label class="tk-label">
                  <span class="rsvp-label">Grund bei Absage (freiwillig, sieht nur das Trainerteam)</span>
                  <input
                    class="tk-input"
                    name="reason"
                    type="text"
                    [attr.maxlength]="reasonMax"
                    placeholder="z. B. Familienfeier"
                    [value]="reasonOf(event)"
                    [attr.aria-label]="'Grund bei Absage: ' + (event.title || event.type)"
                  />
                </label>
                <div class="rsvp-actions">
                  <button
                    tkButton
                    variant="primary"
                    type="submit"
                    value="yes"
                    [disabled]="rsvp.saving() !== null"
                    [attr.aria-pressed]="status(event) === 'yes'"
                    [attr.aria-label]="(parent() ? 'Zusagen: ' : 'Ich bin dabei: ') + (event.title || event.type)"
                  >{{ parent() ? 'Zusagen' : 'Ich bin dabei' }}</button>
                  <button
                    tkButton
                    type="submit"
                    value="no"
                    class="danger"
                    [disabled]="rsvp.saving() !== null"
                    [attr.aria-pressed]="status(event) === 'no'"
                    [attr.aria-label]="(parent() ? 'Absagen: ' : 'Ich kann nicht: ') + (event.title || event.type)"
                  >{{ parent() ? 'Absagen' : 'Ich kann nicht' }}</button>
                </div>
              </form>
            </article>
          } @empty {
            <p class="rsvp-hint">Keine anstehenden Termine.</p>
          }
        </section>
      </tk-card>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .rsvp {
      display: grid;
      gap: var(--tk-space-3);
    }
    h2,
    p {
      margin: 0;
    }
    h2 {
      font-size: var(--tk-text-lg, 18px);
    }
    .rsvp-hint,
    .rsvp-info small,
    .rsvp-label {
      color: var(--tk-muted);
      font-size: var(--tk-text-sm);
    }
    .rsvp-error {
      padding: var(--tk-space-3);
      color: var(--tk-red-dark);
      background: var(--tk-soft-red);
      border-radius: var(--tk-radius-md);
      font-size: var(--tk-text-sm);
      font-weight: 600;
    }
    .rsvp-item {
      display: grid;
      gap: var(--tk-space-2);
      padding-top: var(--tk-space-3);
      border-top: 1px solid var(--tk-line);
    }
    .rsvp-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--tk-space-2);
    }
    .rsvp-info {
      display: grid;
      gap: 2px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .rsvp-form {
      display: grid;
      gap: var(--tk-space-2);
    }
    .rsvp-form .tk-label {
      display: grid;
      gap: 4px;
    }
    .rsvp-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tk-space-2);
    }
    .rsvp-actions button {
      flex: 1 1 140px;
    }
    .rsvp-actions .danger {
      color: var(--tk-red);
    }
    .rsvp-actions button[aria-pressed='true'] {
      box-shadow: 0 0 0 2px var(--tk-ink) inset;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RsvpPanel {
  protected readonly rsvp = inject(RsvpService);
  private readonly session = inject(SessionService);

  protected readonly parent = computed(() => this.session.role() === 'parent');
  protected readonly reasonMax = RSVP_REASON_MAX;

  protected status(event: TeamEvent): RsvpStatus {
    return this.rsvp.own(event.id)?.status ?? 'open';
  }

  protected pill(event: TeamEvent): string {
    const status = this.status(event);
    return status === 'yes' ? 'Zugesagt' : status === 'no' ? 'Abgesagt' : 'Noch offen';
  }

  protected tone(event: TeamEvent): Tone {
    const status = this.status(event);
    return status === 'yes' ? 'green' : status === 'no' ? 'red' : 'amber';
  }

  protected reasonOf(event: TeamEvent): string {
    const own = this.rsvp.own(event.id);
    return own?.status === 'no' ? own.reason : '';
  }

  protected detail(event: TeamEvent): string {
    return [
      formatDate(event.date) + (event.startTime ? `, ${event.startTime} Uhr` : ''),
      event.type,
      event.opponent ? `vs. ${event.opponent}` : '',
      event.location,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  protected submit(domEvent: Event, event: TeamEvent): void {
    domEvent.preventDefault();
    const submitter = (domEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = submitter?.value as RsvpAnswer | undefined;
    if (status !== 'yes' && status !== 'no') return;
    const form = domEvent.target as HTMLFormElement;
    const reason = (form.elements.namedItem('reason') as HTMLInputElement | null)?.value ?? '';
    void this.rsvp.answer(event.id, status, reason);
  }
}
