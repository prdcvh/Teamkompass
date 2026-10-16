import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { type TeamEvent, eventStart } from '../../core/events/event';
import { type WeatherSnapshot, WEATHER_ATTRIBUTION, berlinNow, withinHorizon } from '../../core/weather/weather';
import { weatherKind, weatherSpokenText, weatherSummary } from '../../core/weather/weather-display';
import { WeatherService } from '../../core/weather/weather.service';
import { Icon, type IconName } from '../icon/icon';

type State =
  | { readonly kind: 'hidden' | 'no-place' | 'no-time' | 'loading' | 'unavailable' }
  | { readonly kind: 'ok'; readonly snapshot: WeatherSnapshot };

/**
 * Wettervorhersage für ein Event (SCRUM-98): Temperatur und Regenwahrscheinlichkeit zur Startzeit.
 * Zeigt nur kommende Events innerhalb des Vorhersagehorizonts; sonst nichts. Blockiert die Seite nie.
 */
@Component({
  selector: 'tk-weather',
  imports: [Icon],
  template: `
    @switch (state().kind) {
      @case ('ok') {
        <span class="line" role="img" [attr.aria-label]="spoken()"
          ><tk-icon [name]="icon()" /><span aria-hidden="true">{{ summary() }}</span></span
        >
      }
      @case ('loading') {
        <span class="line muted" role="status">Wetter wird geladen …</span>
      }
      @case ('unavailable') {
        <span class="line muted" role="status">Wetter nicht verfügbar</span>
      }
      @case ('no-place') {
        <span class="line muted">Kein Ort für Wetter</span>
      }
      @case ('no-time') {
        <span class="line muted">Keine Startzeit für Wetter</span>
      }
    }
    @if (showSource() && state().kind === 'ok') {
      <a class="source" [href]="source.url" target="_blank" rel="noopener noreferrer">{{ source.text }}</a>
    }
  `,
  styleUrl: './weather.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-state]': 'state().kind', '[hidden]': "state().kind === 'hidden'" },
})
export class Weather {
  readonly event = input.required<TeamEvent>();
  /** Zeigt den Open-Meteo-Hinweis direkt am Wetter (sonst muss ihn die Seite einmal anzeigen). */
  readonly showSource = input(false);

  private readonly service = inject(WeatherService);
  protected readonly source = WEATHER_ATTRIBUTION;
  private readonly result = signal<{ readonly key: string; readonly value: WeatherSnapshot | 'error' } | null>(null);
  private token = 0;

  /** `relevant`: Event liegt in der Zukunft und im Vorhersagehorizont; `iso`: Zeitpunkt `YYYY-MM-DDTHH:MM`. */
  private readonly target = computed(() => {
    const ev = this.event();
    const now = this.service.now();
    const start = eventStart(ev);
    if (start === null) {
      return { relevant: ev.date >= berlinNow(now).date && withinHorizon(ev.date, now), iso: null };
    }
    return { relevant: start.getTime() > now.getTime() && withinHorizon(ev.date, now), iso: `${ev.date}T${ev.startTime}` };
  });

  private readonly key = computed(() => {
    const t = this.target();
    const c = this.event().locationCoords;
    return t.relevant && t.iso && c ? `${c.lat}|${c.lon}|${t.iso}` : null;
  });

  protected readonly state = computed<State>(() => {
    const t = this.target();
    if (!t.relevant) return { kind: 'hidden' };
    if (!this.event().locationCoords) return { kind: 'no-place' };
    if (!t.iso) return { kind: 'no-time' };
    const r = this.result();
    if (r === null || r.key !== this.key()) return { kind: 'loading' };
    return r.value === 'error' ? { kind: 'unavailable' } : { kind: 'ok', snapshot: r.value };
  });

  private readonly snapshot = computed(() => {
    const s = this.state();
    return s.kind === 'ok' ? s.snapshot : null;
  });
  protected readonly summary = computed(() => {
    const s = this.snapshot();
    return s ? weatherSummary(s) : '';
  });
  protected readonly spoken = computed(() => {
    const s = this.snapshot();
    return s ? weatherSpokenText(s) : '';
  });
  protected readonly icon = computed<IconName>(() => `weather-${weatherKind(this.snapshot()?.weatherCode ?? null)}`);

  constructor() {
    effect(() => {
      const key = this.key();
      const coords = this.event().locationCoords;
      const iso = this.target().iso;
      const mine = ++this.token;
      if (key === null || coords === null || iso === null) return;
      void this.service.forecast(coords, iso).then((res) => {
        if (mine !== this.token) return;
        this.result.set({ key, value: res.status === 'ok' ? res.snapshot : 'error' });
      });
    });
  }
}
