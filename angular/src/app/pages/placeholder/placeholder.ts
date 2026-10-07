import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PLANNED_IN } from '../../core/navigation';

/** Platzhalter für Bereiche, die noch nicht gebaut sind (kommen als eigene Tickets). */
@Component({
  selector: 'app-placeholder',
  template: `
    <p class="tk-eyebrow">TeamKompass</p>
    <h1>{{ title }}</h1>
    <p>Dieser Bereich wird noch gebaut@if (ticket) { – er kommt mit {{ ticket }}}.</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Placeholder {
  private readonly route = inject(ActivatedRoute).snapshot;
  protected readonly title: string = this.route.data['title'] ?? '';
  protected readonly ticket: string | undefined = PLANNED_IN['/' + (this.route.routeConfig?.path ?? '')];
}
