/**
 * Bewertungsskala je Team (SCRUM-188, Entscheidung des PO vom 02.11.2026):
 * - `grades`: Schulnoten 1–6 wie bisher (1 = sehr gut … 6 = ungenügend).
 * - `levels`: drei Kompetenzstufen für Kinder – „lernt es noch“, „kann es“, „kann es sicher“.
 *
 * Intern gibt es nur eine Zahlenskala: Eine Stufe wird als ihr Schulnoten-Gegenwert gespeichert
 * (lernt es noch = 4,5, kann es = 3, kann es sicher = 1,5). So rechnen Gesamtnote, Durchschnitte, Formkurve und
 * Kompetenzprofil unverändert mit denselben Funktionen; bei Schulnoten ändert sich keine einzige Zahl. Angezeigt wird
 * die Skala des Teams. Eine Bewertung, die mit Stufen vergeben wurde, trägt im Dokument zusätzlich `scale: 'levels'`,
 * damit sie auch nach einem Wechsel der Teamskala als Stufen lesbar bleibt (und alte Schulnoten als Schulnoten).
 * Ein Wechsel der Skala schreibt keine gespeicherte Bewertung um.
 *
 * Standard ohne gespeicherte Wahl: U6–U11 (G- bis E-Jugend) Stufen, sonst Schulnoten. Die bestehenden Teams (U14,
 * U15, U17, Hauptteam mit Bezeichnung U14) bleiben dadurch bei Schulnoten.
 */

export const RATING_SCALES = ['grades', 'levels'] as const;
export type RatingScale = (typeof RATING_SCALES)[number];

export const RATING_SCALE_LABELS: Readonly<Record<RatingScale, string>> = {
  grades: 'Schulnoten 1–6',
  levels: 'Kompetenzstufen (lernt es noch / kann es / kann es sicher)',
};

export interface ScaleOption {
  /** Gespeicherter Zahlenwert (Schulnoten-Gegenwert). */
  readonly value: number;
  /** Beschriftung im Formular und in der Anzeige. */
  readonly label: string;
  /** Kurzform für enge Stellen (Diagrammachse). */
  readonly short: string;
  /** Vorlesetext („Note 2“, „kann es“). */
  readonly aria: string;
}

/** Die drei Stufen in Lernreihenfolge (Formular von links nach rechts). */
export const LEVEL_OPTIONS: readonly ScaleOption[] = [
  { value: 4.5, label: 'lernt es noch', short: 'lernt', aria: 'lernt es noch' },
  { value: 3, label: 'kann es', short: 'kann', aria: 'kann es' },
  { value: 1.5, label: 'kann es sicher', short: 'sicher', aria: 'kann es sicher' },
];

export const GRADE_SCALE_OPTIONS: readonly ScaleOption[] = [1, 2, 3, 4, 5, 6].map((value) => ({
  value,
  label: String(value),
  short: String(value),
  aria: `Note ${value}`,
}));

export function isRatingScale(value: unknown): value is RatingScale {
  return RATING_SCALES.includes(value as RatingScale);
}

export function scaleOptions(scale: RatingScale): readonly ScaleOption[] {
  return scale === 'levels' ? LEVEL_OPTIONS : GRADE_SCALE_OPTIONS;
}

/** Ist `value` ein Wert, den man auf dieser Skala eingeben kann? */
export function isScaleValue(value: number, scale: RatingScale): boolean {
  return scaleOptions(scale).some((option) => option.value === value);
}

/**
 * Stufe zu einem (auch gemittelten) Wert: der nächstgelegene Stufenwert; genau in der Mitte gewinnt die bessere Stufe
 * (bis 2,25 „kann es sicher“, bis 3,75 „kann es“, darüber „lernt es noch“).
 */
export function levelFor(value: number): ScaleOption {
  if (value <= 2.25) return LEVEL_OPTIONS[2];
  if (value <= 3.75) return LEVEL_OPTIONS[1];
  return LEVEL_OPTIONS[0];
}

/** Anzeige eines Werts in der Skala: Schulnoten „2,3“, Stufen „kann es“; ohne Wert „–“. */
export function scoreLabel(value: number | null, scale: RatingScale): string {
  if (value === null) return '–';
  return scale === 'levels' ? levelFor(value).label : value.toFixed(1).replace('.', ',');
}

/** Kurzanzeige (Diagrammachse, Formkurve): Schulnoten „2,3“, Stufen „kann“. */
export function scoreShortLabel(value: number, scale: RatingScale): string {
  return scale === 'levels' ? levelFor(value).short : value.toFixed(1).replace('.', ',');
}

/** Jüngste und älteste Altersklasse, für die ohne Wahl des Trainers Stufen gelten (U6–U11). */
const LEVELS_FROM = 6;
const LEVELS_UNTIL = 11;

/** Standardskala zur Teambezeichnung: „U6“ … „U11“ (auch „U 9“, „u10“) → Stufen, alles andere → Schulnoten. */
export function defaultScaleForLabel(label: string): RatingScale {
  const match = /^\s*U\s*(\d{1,2})\b/i.exec(label);
  const age = match ? Number(match[1]) : NaN;
  return age >= LEVELS_FROM && age <= LEVELS_UNTIL ? 'levels' : 'grades';
}

/** Dokument `meta/settings` → gespeicherte Skala; null, wenn (noch) keine gewählt ist. */
export function storedRatingScale(doc: Readonly<Record<string, unknown>> | null): RatingScale | null {
  const raw = doc?.['ratingScale'];
  return isRatingScale(raw) ? raw : null;
}

export function docFromRatingScale(scale: RatingScale): Record<string, unknown> {
  return { ratingScale: scale };
}
