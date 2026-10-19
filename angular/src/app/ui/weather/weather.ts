import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { type TeamEvent, eventStart } from '../../core/events/event';
import { TEAM_HOME_SHORT_NAME, weatherLocation } from '../../core/team-settings/team-settings';
import { type WeatherSnapshot, WEATHER_ATTRIBUTION, berlinNow, withinHorizon } from '../../core/weather/weather';
import { weatherKind, weatherParts, weatherSpokenText } from '../../core/weather/weather-display';
import { WeatherService } from '../../core/weather/weather.service';
import { Clothing } from '../clothing/clothing';
import { Icon, type IconName } from '../icon/icon';

type State =
  | { readonly kind: 'hidden' | 'no-time' | 'loading' | 'unavailable' }
  | { readonly kind: 'ok'; readonly snapshot: WeatherSnapshot };

/**
 * Wettervorhersage für ein Event (SCRUM-98): Temperatur und Regenwahrscheinlichkeit zur Startzeit.
 * Zeigt nur kommende Events innerhalb des Vorhersagehorizonts; sonst nichts. Blockiert die Seite nie.
 */
@Component({
  selector: 'tk-weather',
  imports: [Icon, Clothing],
  template: `
    @switch (state().kind) {
      @case ('ok') {
        <span class="line" role="img" [attr.aria-label]="spoken()"
          ><tk-icon [name]="icon()" /><span aria-hidden="true"
            >@for (part of parts(); track $index) {@if ($index > 0) { · }<span class="part">{{ part }}</span>}</span
          >@if (usesHome()) {<span class="home" aria-hidden="true">· {{ homeName }}</span>}</span
        >
      }
      @case ('loading') {
        <span class="line muted" role="status">Wetter wird geladen …</span>
      }
      @case ('unavailable') {
        <span class="line muted" role="status">Wetter nicht verfügbar</span>
      }
      @case ('no-time') {
        <span class="line muted">Keine Startzeit für Wetter</span>
      }
    }
    @if (showClothing() && snapshot(); as snap) {
      <tk-clothing [snapshot]="snap" [dayLabel]="dayLabel()" />
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

  /** Zeigt zusätzlich die Kleidungsempfehlung (SCRUM-99), sobald das Wetter da ist. */
  readonly showClothing = input(false);

  private readonly service = inject(WeatherService);
  protected readonly homeName = TEAM_HOME_SHORT_NAME;
  /** Ohne gewählten Ort gilt der Standardort des Teams (SCRUM-153). */
  protected readonly usesHome = computed(() => this.event().locationCoords === null);
  private readonly coords = computed(() => weatherLocation(this.event().locationCoords));
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
    const c = this.coords();
    return t.relevant && t.iso ? `${c.lat}|${c.lon}|${t.iso}` : null;
  });

  protected readonly state = computed<State>(() => {
    const t = this.target();
    if (!t.relevant) return { kind: 'hidden' };
    if (!t.iso) return { kind: 'no-time' };
    const r = this.result();
    if (r === null || r.key !== this.key()) return { kind: 'loading' };
    return r.value === 'error' ? { kind: 'unavailable' } : { kind: 'ok', snapshot: r.value };
  });

  protected readonly snapshot = computed(() => {
    const s = this.state();
    return s.kind === 'ok' ? s.snapshot : null;
  });
  protected readonly dayLabel = computed(() => {
    const date = this.event().date;
    if (date === berlinNow(this.service.now()).date) return 'Heute';
    const [, m, d] = date.split('-');
    return `Am ${Number(d)}.${Number(m)}.`;
  });
  protected readonly parts = computed(() => {
    const s = this.snapshot();
    return s ? weatherParts(s) : [];
  });
  protected readonly spoken = computed(() => {
    const s = this.snapshot();
    if (!s) return '';
    return this.usesHome() ? `${weatherSpokenText(s)} (Standardort ${TEAM_HOME_SHORT_NAME})` : weatherSpokenText(s);
  });
  protected readonly icon = computed<IconName>(() => `weather-${weatherKind(this.snapshot()?.weatherCode ?? null)}`);

  constructor() {
    effect(() => {
      const key = this.key();
      const coords = this.coords();
      const iso = this.target().iso;
      const mine = ++this.token;
      if (key === null || iso === null) return;
      void this.service.forecast(coords, iso).then((res) => {
        if (mine !== this.token) return;
        this.result.set({ key, value: res.status === 'ok' ? res.snapshot : 'error' });
      });
    });
  }
}
