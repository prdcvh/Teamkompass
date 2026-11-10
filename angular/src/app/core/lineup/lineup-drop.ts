/**
 * Drag & Drop in der Aufstellung (SCRUM-286): Was passiert, wenn ein Spieler irgendwo abgelegt wird. Reine Logik auf
 * Basis von moveToZone/removeFromPitch/swapPlayers – dieselben Regeln wie beim Tippen/Auswählen im Dialog.
 */
import { type Assignments, moveToZone, removeFromPitch, swapPlayers, zoneOf } from './lineup';
import { MAX_ON_PITCH, ZONES, type Zone } from './pitch';

/** Wo der Spieler losgelassen wurde: auf einer Position (leer oder auf einem Spieler dort) oder auf der Bank/„Entfernen“. */
export type DropTarget = { readonly kind: 'zone'; readonly zone: Zone; readonly playerId: string | null } | { readonly kind: 'bench' };

/**
 * Neue Aufstellung nach dem Ablegen; null = nichts ändert sich (z. B. an dieselbe Stelle zurück), „voll“ = ein weiterer
 * Spieler hätte keinen Platz mehr.
 * - Bank: Der Spieler geht vom Feld.
 * - Auf einen anderen Spieler: Die beiden tauschen. Kommt der gezogene von der Bank, geht der verdrängte auf die Bank;
 *   sonst geht der verdrängte auf die alte Position des gezogenen.
 * - Auf eine Position: Der Spieler stellt sich dorthin. Ist das Feld voll und steht dort genau ein Spieler, tauschen sie.
 */
export function dropPlayer(assignments: Assignments, playerId: string, target: DropTarget, max: number = MAX_ON_PITCH): Assignments | 'voll' | null {
  const from = zoneOf(assignments, playerId);
  if (target.kind === 'bench') return from ? removeFromPitch(assignments, playerId) : null;
  const onto = target.playerId;
  if (onto && onto !== playerId && zoneOf(assignments, onto) === target.zone) return swapPlayers(assignments, playerId, onto);
  if (onto === playerId || from === target.zone) return null;
  const moved = moveToZone(assignments, playerId, target.zone, max);
  const occupants = assignments[target.zone];
  if (moved === 'voll' && occupants.length === 1) return swapPlayers(assignments, playerId, occupants[0]);
  return moved;
}

/** Schlüssel eines Ziels für die Hervorhebung und für `data-drop` im Template: „bench“, „zone:IV“ oder „player:IV:<id>“. */
export function dropKey(target: DropTarget): string {
  if (target.kind === 'bench') return 'bench';
  return target.playerId ? `player:${target.zone}:${target.playerId}` : `zone:${target.zone}`;
}

/** Gegenstück zu dropKey; null bei allem, was kein Ziel ist. */
export function parseDropKey(key: string | null | undefined): DropTarget | null {
  if (key === 'bench') return { kind: 'bench' };
  const [kind, zone, ...rest] = (key ?? '').split(':');
  if (!ZONES.includes(zone as Zone)) return null;
  if (kind === 'zone' && rest.length === 0) return { kind: 'zone', zone: zone as Zone, playerId: null };
  if (kind === 'player' && rest.length > 0 && rest.join(':')) return { kind: 'zone', zone: zone as Zone, playerId: rest.join(':') };
  return null;
}
