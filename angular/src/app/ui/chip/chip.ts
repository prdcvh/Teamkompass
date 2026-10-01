import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type Tone = 'neutral' | 'red' | 'green' | 'amber' | 'blue';

/** Figma: "Chip" (Pille, z. B. „Ø 2,1“ oder Position). */
@Component({
  selector: 'tk-chip',
  template: '<ng-content />',
  styleUrl: './chip.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-tone]': 'tone()' },
})
export class Chip {
  readonly tone = input<Tone>('neutral');
}
