import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { breakNotice } from '../../core/planning/breaks';
import { BreaksStore } from '../../core/planning/breaks-store';
import { todayIso } from '../../core/shared/dates';

/**
 * Dezenter Einzeiler zur laufenden oder nächsten Pause (SCRUM-150), z. B. „Winterpause bis 10.01.“ oder „Ab 27.10.
 * Herbstferien (bis 07.11.)“. Für Trainer und Spieler; ohne laufende oder nahe Pause (oder wenn die Pausen nicht gelesen
 * werden konnten) erscheint nichts. Zeigt nur Name und Zeitraum, nie etwas aus der Planung.
 */
@Component({
  selector: 'tk-break-notice',
  template: `@if (text(); as notice) {
    <p class="break-notice" data-testid="break-notice">{{ notice }}</p>
  }`,
  styleUrl: './break-notice.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreakNotice implements OnInit {
  private readonly store = inject(BreaksStore);
  protected readonly text = computed(() => (this.store.load() === 'ready' ? breakNotice(this.store.breaks(), todayIso()) : null));

  ngOnInit(): void {
    this.store.start();
  }
}
