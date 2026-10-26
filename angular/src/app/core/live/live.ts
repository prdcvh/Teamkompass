/**
 * Live-Modus (SCRUM-213): reine Logik für die Vollbildansicht, in der der Trainer auf dem Platz mit Plus/Minus Punkte vergibt.
 */
import { type Player } from '../player/player';
import { type Attendance } from '../ratings/rating';

/** Wählbare Schrittweiten; die erste ist der Standard. */
export const LIVE_STEPS = [1, 2, 5] as const;

/** Nächste Schrittweite im Kreis (1 → 2 → 5 → 1). */
export function nextStep(step: number): number {
  const index = LIVE_STEPS.findIndex((value) => value === step);
  return LIVE_STEPS[(index + 1) % LIVE_STEPS.length];
}

/** Punkte als Text mit echtem Minuszeichen (U+2212), damit negative Werte auch draußen sofort auffallen. */
export function pointsLabel(points: number): string {
  return points < 0 ? `−${Math.abs(points)}` : String(points);
}

/** Wer fehlt oder gehört nicht zum Kader dieses Events? Diese Spieler erscheinen gesammelt unter „Nicht da“. */
export function isAway(attendance: Attendance): boolean {
  return attendance === 'absent' || attendance === 'excluded';
}

export interface LiveRow {
  readonly id: string;
  /** Vorname bzw. Rufname; bei gleichem Vornamen mit Anfangsbuchstabe des Nachnamens. */
  readonly label: string;
}

/**
 * Feste Reihenfolge der Sitzung: alphabetisch nach vollem Namen (hängt nie von den Punkten ab, sodass nichts umspringt).
 * Namen: nur der Vorname; teilen sich mehrere Spieler des Kaders einen Vornamen, kommt der Anfangsbuchstabe des Nachnamens dazu.
 */
export function liveRows(players: readonly Pick<Player, 'id' | 'name'>[]): LiveRow[] {
  const counts = new Map<string, number>();
  for (const player of players) {
    const key = (player.name.trim().split(/\s+/)[0] ?? '').toLocaleLowerCase('de');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...players]
    .sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id))
    .map((player) => {
      const parts = player.name.trim().split(/\s+/);
      const given = parts[0] ?? '';
      const duplicate = (counts.get(given.toLocaleLowerCase('de')) ?? 0) > 1;
      const initial = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
      return { id: player.id, label: duplicate && initial ? `${given} ${initial.toLocaleUpperCase('de')}.` : given };
    });
}
