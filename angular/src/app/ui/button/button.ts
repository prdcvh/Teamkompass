import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'neutral' | 'ghost';
export type ButtonSize = 'md' | 'sm';

/** Figma: "Button" (Primary rot, Neutral weiß mit Rahmen). Nutzung: <button tkButton variant="primary">. */
// Attribut-Selektor mit tk-Präfix: die Regel erlaubt für Komponenten nur Elemente.
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'button[tkButton], a[tkButton]',
  template: '<ng-content />',
  styleUrl: './button.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tk-button',
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
    '[attr.type]': 'typeAttr()',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('neutral');
  readonly size = input<ButtonSize>('md');
  /** Verhindert ungewollte Formular-Abschickungen; auf <a> wird kein type gesetzt. */
  readonly type = input<'button' | 'submit' | 'reset' | null>(null);

  protected readonly typeAttr = computed(() => this.type());
}
