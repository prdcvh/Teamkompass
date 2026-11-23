import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ALERT_LOG_DAYS, type AlertHint, type AlertLogEntry } from '../../core/alerts/alert-rules';
import { AlertsService } from '../../core/alerts/alerts.service';
import { formatDate } from '../../core/shared/dates';
import { Card } from '../card/card';

const shortDate = (iso: string) => formatDate(iso).slice(0, 6);

/**
 * Automatische Hinweise der Wenn-dann-Regeln (SCRUM-195): Hinweise von heute und darunter (aufklappbar) das Protokoll
 * der letzten 4 Wochen. Nur für Trainer (Startseite) und Medizin (Medizin-Ansicht); für alle anderen Rollen erscheint
 * nichts und es wird nichts geladen.
 */
@Component({
  selector: 'tk-alerts-panel',
  imports: [RouterLink, Card],
  templateUrl: './alerts-panel.html',
  styleUrl: './alerts-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertsPanel implements OnInit {
  protected readonly alerts = inject(AlertsService);
  protected readonly trainer = computed(() => this.alerts.audience() === 'trainer');
  protected readonly logDays = ALERT_LOG_DAYS;

  protected readonly hints = computed(() => this.alerts.result().hints.map((hint) => ({ ...hint, sinceText: this.sinceText(hint), link: this.link(hint) })));
  protected readonly log = computed(() => this.alerts.result().log.map((entry) => ({ ...entry, when: this.whenText(entry) })));

  ngOnInit(): void {
    this.alerts.start();
  }

  private sinceText(hint: AlertHint): string {
    return hint.sinceBefore ? `seit über ${ALERT_LOG_DAYS} Tagen` : `seit ${shortDate(hint.since)}`;
  }

  private whenText(entry: AlertLogEntry): string {
    const start = entry.sinceBefore ? `vor dem ${shortDate(entry.date)}` : shortDate(entry.date);
    if (entry.active) return `${start} · läuft noch`;
    return entry.until === entry.date ? start : `${start} – ${shortDate(entry.until)}`;
  }

  /** Trainer: direkt zum Spielerprofil bzw. zum Termin. Medizin wählt den Spieler oben in ihrer Ansicht. */
  private link(hint: AlertHint): string | null {
    if (!this.trainer()) return null;
    if (hint.playerId) return `/profile/${hint.playerId}`;
    return hint.eventId ? `/events/${hint.eventId}` : null;
  }
}
