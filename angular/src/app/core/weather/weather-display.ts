/** Darstellung des Wetters (SCRUM-98): WMO-Code → Symbol/Beschreibung und die Texte für Anzeige und Screenreader. */
import type { WeatherSnapshot } from './weather';

export type WeatherKind = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm';

export function weatherKind(code: number | null): WeatherKind {
  if (code === null) return 'cloud';
  if (code <= 1) return 'sun';
  if (code <= 48) return 'cloud';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  return 'cloud';
}

export function weatherDescription(code: number | null): string {
  switch (weatherKind(code)) {
    case 'sun':
      return code === 1 ? 'Überwiegend klar' : 'Klar';
    case 'rain':
      return 'Regen';
    case 'snow':
      return 'Schnee';
    case 'storm':
      return 'Gewitter';
    default:
      return code === 45 || code === 48 ? 'Nebel' : 'Bewölkt';
  }
}

/** Sichtbarer Kurztext, z. B. „14 °C · 60 % Regen“. */
export function weatherSummary(s: WeatherSnapshot): string {
  const temp = `${Math.round(s.temperature)} °C`;
  return s.precipitationProbability === null ? temp : `${temp} · ${Math.round(s.precipitationProbability)} % Regen`;
}

/** Ausführlicher Text für Screenreader. */
export function weatherSpokenText(s: WeatherSnapshot): string {
  const rain = s.precipitationProbability === null ? '' : `, Regenwahrscheinlichkeit ${Math.round(s.precipitationProbability)} Prozent`;
  return `Wetter: ${weatherDescription(s.weatherCode)}, ${Math.round(s.temperature)} Grad Celsius${rain}`;
}
