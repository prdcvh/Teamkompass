import { describe, expect, it } from 'vitest';
import type { WeatherSnapshot } from './weather/weather';
import {
  CHILD_MARGIN_DEGREES, CLOTHING_THRESHOLDS, RAIN_JACKET_FROM_PERCENT, WIND_PENALTY_DEGREES, WIND_PENALTY_FROM_KMH,
  clothingFor, clothingItems, clothingText, effectiveTemperature,
} from './clothing';

const snap = (felt: number | null, patch: Partial<WeatherSnapshot> = {}): WeatherSnapshot => ({
  time: '2026-10-17T18:00', temperature: felt ?? 10, apparentTemperature: felt, precipitationProbability: 0,
  precipitation: 0, windSpeed: 0, weatherCode: 1, ...patch,
});

// Wirksame Temperatur = gefühlt − 1 (Kinder-Zuschlag); Grenzen daher bei gefühlt 21 / 13 / 6.
describe('clothingFor', () => {
  it('warm: ab wirksam 20 °C kurze Hose und T-Shirt', () => {
    expect(clothingFor(snap(21))).toMatchObject({ top: 'tshirt', bottom: 'shorts', hatAndGloves: false });
    expect(clothingFor(snap(20.9))).toMatchObject({ top: 'longsleeve', bottom: 'shorts' });
  });
  it('mild: 12–19 °C kurze Hose plus Langarm', () => {
    expect(clothingFor(snap(13))).toMatchObject({ top: 'longsleeve', bottom: 'shorts' });
    expect(clothingFor(snap(12.9))).toMatchObject({ top: 'sweater', bottom: 'pants' });
  });
  it('kühl: 5–11 °C lange Hose plus Pulli, ohne Mütze', () => {
    expect(clothingFor(snap(6))).toMatchObject({ top: 'sweater', bottom: 'pants', hatAndGloves: false });
  });
  it('kalt: unter 5 °C zusätzlich Mütze und Handschuhe', () => {
    expect(clothingFor(snap(5.9))).toMatchObject({ top: 'sweater', bottom: 'pants', hatAndGloves: true });
    expect(clothingFor(snap(-8))).toMatchObject({ bottom: 'pants', hatAndGloves: true });
  });
  it('Regenjacke ab 50 %', () => {
    expect(clothingFor(snap(15, { precipitationProbability: 49 })).rainJacket).toBe(false);
    expect(clothingFor(snap(15, { precipitationProbability: 50 })).rainJacket).toBe(true);
    expect(clothingFor(snap(15, { precipitationProbability: null })).rainJacket).toBe(false);
  });
  it('nutzt gefühlte Temperatur, sonst Lufttemperatur', () => {
    expect(effectiveTemperature(snap(15, { temperature: 25 }))).toBe(14);
    expect(effectiveTemperature(snap(null, { temperature: 25 }))).toBe(24);
  });
  it('starker Wind zählt kälter (ab 30 km/h)', () => {
    expect(clothingFor(snap(21, { windSpeed: 29 })).top).toBe('tshirt');
    expect(clothingFor(snap(21, { windSpeed: 30 })).top).toBe('longsleeve');
    expect(clothingFor(snap(21, { windSpeed: null })).top).toBe('tshirt');
  });
});

describe('Text', () => {
  it('liefert die kopierbare Textversion', () => {
    const a = clothingFor(snap(8, { precipitationProbability: 80 }));
    expect(clothingItems(a)).toEqual(['lange Hose', 'Pulli', 'Regenjacke']);
    expect(clothingText(a)).toBe('Heute: lange Hose, Pulli und Regenjacke');
    expect(clothingText(clothingFor(snap(25)), 'Am Samstag')).toBe('Am Samstag: kurze Hose und T-Shirt');
    expect(clothingText(clothingFor(snap(0)))).toBe('Heute: lange Hose, Pulli, Mütze und Handschuhe');
  });
});

// docs/wetter-kleidung-erinnerung.md nennt diese Werte; ändert jemand sie, muss die Doku mit.
describe('Schwellenwerte', () => {
  it('entsprechen den dokumentierten Werten', () => {
    expect(CLOTHING_THRESHOLDS).toEqual({ warm: 20, mild: 12, cold: 5 });
    expect(RAIN_JACKET_FROM_PERCENT).toBe(50);
    expect(WIND_PENALTY_FROM_KMH).toBe(30);
    expect(WIND_PENALTY_DEGREES).toBe(1);
    expect(CHILD_MARGIN_DEGREES).toBe(1);
  });
});
