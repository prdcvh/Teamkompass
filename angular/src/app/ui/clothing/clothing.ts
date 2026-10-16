import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { clothingFor, clothingItems, clothingText } from '../../core/clothing';
import type { WeatherSnapshot } from '../../core/weather/weather';

/**
 * Kleidungsempfehlung als Grafik und kopierbarer Text (SCRUM-99).
 * Inline-SVG (die CSP erlaubt nur `img-src 'self' data:`), Farben nur über `--tk-*`.
 */
@Component({
  selector: 'tk-clothing',
  template: `
    <div class="box">
      <svg class="figure" viewBox="0 0 120 190" role="img" [attr.aria-label]="alt()">
        <!-- Beine -->
        @if (advice().bottom === 'pants') {
          <path class="pants" d="M42 88 h36 l4 90 h-16 l-6 -60 l-6 60 h-16 z" />
        } @else {
          <path class="skin" d="M46 108 h10 l-1 66 h-8 z M64 108 h10 l-1 66 h-8 z" />
          <path class="shorts" d="M42 88 h36 l3 34 h-18 l-3 -14 l-3 14 h-18 z" />
        }
        <!-- Oberteil -->
        @if (advice().top === 'tshirt') {
          <path class="skin" d="M25 52 l-4 34 h10 l3 -26 z M95 52 l4 34 h-10 l-3 -26 z" />
          <path class="top" d="M40 44 h40 l16 14 l-8 14 l-8 -6 v36 h-40 v-36 l-8 6 l-8 -14 z" />
        } @else {
          <path class="top" [class.thick]="advice().top === 'sweater'"
            d="M40 44 h40 l16 14 l-6 40 h-10 l1 -26 l-1 24 v4 h-40 v-4 l-1 -24 l1 26 h-10 l-6 -40 z" />
        }
        <!-- Kopf, Mütze, Handschuhe -->
        <circle class="skin" cx="60" cy="26" r="13" />
        @if (advice().hatAndGloves) {
          <path class="hat" d="M46 24 a14 14 0 0 1 28 0 z" />
          <circle class="hat" cx="60" cy="8" r="3.5" />
          <circle class="hat" cx="22" cy="100" r="6" />
          <circle class="hat" cx="98" cy="100" r="6" />
        }
        <!-- Regenjacke: Tropfen über der Figur -->
        @if (advice().rainJacket) {
          <path class="jacket" d="M36 46 h48 l16 14 l-6 42 h-10 l-1 -20 v14 h-46 v-14 l-1 20 h-10 l-6 -42 z" />
          <path class="drop" d="M8 20 q4 8 0 12 q-4 -4 0 -12 z M108 8 q4 8 0 12 q-4 -4 0 -12 z M12 60 q4 8 0 12 q-4 -4 0 -12 z" />
        }
      </svg>
      <div class="info">
        <p class="text">{{ text() }}</p>
        <button type="button" class="copy" (click)="copy()">{{ copied() ? 'Kopiert' : 'Text kopieren' }}</button>
        <p class="hint">Empfehlung – der Trainer entscheidet.</p>
      </div>
    </div>
  `,
  styleUrl: './clothing.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Clothing {
  readonly snapshot = input.required<WeatherSnapshot>();
  /** Einleitung des kopierbaren Textes, z. B. „Heute“ oder „Am Samstag“. */
  readonly dayLabel = input('Heute');

  protected readonly copied = signal(false);
  protected readonly advice = computed(() => clothingFor(this.snapshot()));
  protected readonly text = computed(() => clothingText(this.advice(), this.dayLabel()));
  protected readonly alt = computed(() => `Kleidungsempfehlung: ${clothingItems(this.advice()).join(', ')}`);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.text());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false); // Der Text bleibt sichtbar und markierbar.
    }
  }
}
