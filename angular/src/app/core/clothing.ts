/** Kleidungsempfehlung nach Wetter (SCRUM-99). Reine Regeln, keine Abhängigkeit von Angular. */
import type { WeatherSnapshot } from './weather/weather';

/** Schwellenwerte in °C für die wirksame Temperatur (Annahme, mit dem PO abzustimmen). */
export const CLOTHING_THRESHOLDS = {
  /** Ab hier kurze Hose und T-Shirt. */
  warm: 20,
  /** Ab hier kurze Hose mit Langarmshirt; darunter lange Hose mit Pulli. */
  mild: 12,
  /** Darunter zusätzlich Mütze und Handschuhe. */
  cold: 5,
} as const;

/** Regenjacke ab dieser Niederschlagswahrscheinlichkeit in Prozent. */
export const RAIN_JACKET_FROM_PERCENT = 50;
/** Ab dieser Windgeschwindigkeit (km/h) fühlt es sich auf dem Platz kälter an. */
export const WIND_PENALTY_FROM_KMH = 30;
export const WIND_PENALTY_DEGREES = 1;
/** Kinder kühlen schneller aus: lieber eine Schicht mehr (entspricht 1 °C kälter). */
export const CHILD_MARGIN_DEGREES = 1;

export type TopKind = 'tshirt' | 'longsleeve' | 'sweater';
export type BottomKind = 'shorts' | 'pants';

export interface ClothingAdvice {
  readonly top: TopKind;
  readonly bottom: BottomKind;
  readonly rainJacket: boolean;
  /** Mütze und Handschuhe. */
  readonly hatAndGloves: boolean;
}

const TOP_LABEL: Record<TopKind, string> = { tshirt: 'T-Shirt', longsleeve: 'Langarmshirt', sweater: 'Pulli' };
const BOTTOM_LABEL: Record<BottomKind, string> = { shorts: 'kurze Hose', pants: 'lange Hose' };

/** Temperatur, nach der entschieden wird: gefühlte Temperatur (sonst Lufttemperatur), minus Wind- und Kinder-Zuschlag. */
export function effectiveTemperature(s: WeatherSnapshot): number {
  const felt = s.apparentTemperature ?? s.temperature;
  const wind = s.windSpeed !== null && s.windSpeed >= WIND_PENALTY_FROM_KMH ? WIND_PENALTY_DEGREES : 0;
  return felt - wind - CHILD_MARGIN_DEGREES;
}

export function clothingFor(s: WeatherSnapshot): ClothingAdvice {
  const t = effectiveTemperature(s);
  const { warm, mild, cold } = CLOTHING_THRESHOLDS;
  const top: TopKind = t >= warm ? 'tshirt' : t >= mild ? 'longsleeve' : 'sweater';
  const bottom: BottomKind = t >= mild ? 'shorts' : 'pants';
  const rainJacket = s.precipitationProbability !== null && s.precipitationProbability >= RAIN_JACKET_FROM_PERCENT;
  return { top, bottom, rainJacket, hatAndGloves: t < cold };
}

/** Teil-Texte der Empfehlung, z. B. `['lange Hose', 'Pulli', 'Regenjacke']`. */
export function clothingItems(a: ClothingAdvice): string[] {
  const items = [BOTTOM_LABEL[a.bottom], TOP_LABEL[a.top]];
  if (a.rainJacket) items.push('Regenjacke');
  if (a.hatAndGloves) items.push('Mütze', 'Handschuhe');
  return items;
}

/** Kopierbarer Text für die Team-Gruppe. */
export function clothingText(a: ClothingAdvice, dayLabel = 'Heute'): string {
  const items = clothingItems(a);
  const list = `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
  return `${dayLabel}: ${list}`;
}
