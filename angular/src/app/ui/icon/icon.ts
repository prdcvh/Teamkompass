import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Linien-Icons (24 × 24), eigene Zeichnung im Stil der Figma-Symbole. */
const ICONS = {
  grid: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  users: ['M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M3 19c0-3 2.7-5 6-5s6 2 6 5', 'M16 5.2a3 3 0 0 1 0 5.6', 'M17.5 14.3c2 .6 3.5 2.2 3.5 4.7'],
  calendar: ['M5 6h14v14H5z', 'M5 10h14', 'M9 3v4', 'M15 3v4'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6'],
  more: ['M6 12h.01', 'M12 12h.01', 'M18 12h.01'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 12h.01'],
  chart: ['M3 20h18', 'M6 20v-7', 'M12 20V6', 'M18 20v-10'],
  diamond: ['M12 3l9 9-9 9-9-9z'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  key: ['M8 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M11 12h9', 'M17 12v3', 'M20 12v2'],
  'user-plus': ['M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M3 20c0-3.5 3.2-6 7-6', 'M18 8v6', 'M15 11h6'],
  medical: ['M5 4h14v16H5z', 'M12 8v8', 'M8 12h8'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M5 20h14'],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  shield: ['M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z'],
  logout: ['M10 5H5v14h5', 'M15 8l4 4-4 4', 'M19 12H9'],
  'chevron-right': ['M9 6l6 6-6 6'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'tk-icon',
  template: `
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false">
      @for (d of paths(); track d) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styleUrl: './icon.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-icon]': 'name()' },
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly paths = computed(() => ICONS[this.name()]);
}
