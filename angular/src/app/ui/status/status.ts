import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Tone } from '../chip/chip';

/** Gemeinsames Status-Vokabular der Spieler-Ansichten (Figma: Status-Punkt + Text). */
const STATUS_TONES: Readonly<Record<string, Tone>> = {
  Fit: 'green',
  Unauffällig: 'green',
  Angeschlagen: 'amber',
  'Belastung anpassen': 'amber',
  Beobachten: 'blue',
  Verletzt: 'red',
  'Nicht einsetzen': 'red',
  Pause: 'neutral',
  Abwesend: 'neutral',
};

export function toneForStatus(label: string): Tone {
  return STATUS_TONES[label] ?? 'neutral';
}

@Component({
  selector: 'tk-status',
  template: '<span class="dot" aria-hidden="true"></span>{{ label() }}',
  styleUrl: './status.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-tone]': 'tone()' },
})
export class Status {
  readonly label = input.required<string>();
  protected readonly tone = computed(() => toneForStatus(this.label()));
}
