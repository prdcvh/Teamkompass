import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/** Platzhalter für Bereiche, die noch nicht gebaut sind (kommen als eigene Tickets). */
@Component({
  selector: 'app-placeholder',
  template: `
    <p class="tk-eyebrow">TeamKompass</p>
    <h1>{{ title }}</h1>
    <p>Dieser Bereich wird noch gebaut.</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Placeholder {
  protected readonly title: string = inject(ActivatedRoute).snapshot.data['title'] ?? '';
}
