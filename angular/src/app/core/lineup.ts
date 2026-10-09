/**
 * Startelf/Taktikboard: Positionszonen, Formationen und die reine Logik zum Aufstellen, Tauschen und Auswechseln.
 * Rechnet wie die bisherige App (outputs/team-manager/app.js: PITCH_ZONES, PITCH_BANDS, FORMATION_PRESETS,
 * assignFormationSlots, formationPreview, movePlayerToZone, swapPlayers, renderFormationPicker). Das Dokument
 * `teams/{teamId}/meta/lineup` hat dieselbe Form: `{ assignments: { <Zone>: [playerId, …] } }`.
 * Noten sind Schulnoten: kleiner ist besser.
 */
import { type Player } from './player';
import { parsePositions } from './player';
import { roundGrade } from './rating';

/** 14 feste Positionszonen (Mittelpunkt und Breite in Prozent des Spielfelds). */
export const PITCH_ZONES = {
  TW: { x: 50, y: 92, width: 16 },
  LV: { x: 17, y: 68, width: 20 },
  IV: { x: 50, y: 70, width: 54 },
  LIB: { x: 50, y: 79, width: 22 },
  RV: { x: 83, y: 68, width: 20 },
  DM: { x: 50, y: 54, width: 42 },
  ZM: { x: 50, y: 46, width: 60 },
  LM: { x: 17, y: 46, width: 20 },
  RM: { x: 83, y: 46, width: 20 },
  OM: { x: 50, y: 30, width: 66 },
  LA: { x: 19, y: 20, width: 24 },
  HS: { x: 50, y: 18, width: 30 },
  ST: { x: 50, y: 14, width: 46 },
  RA: { x: 81, y: 20, width: 24 },
} as const;

export type Zone = keyof typeof PITCH_ZONES;
export const ZONES = Object.keys(PITCH_ZONES) as Zone[];
export type Assignments = Readonly<Record<Zone, readonly string[]>>;

/** Bänder von hinten nach vorn; die Formationsbezeichnung entsteht immer aus der Summe je Band. */
export const PITCH_BANDS: readonly (readonly Zone[])[] = [
  ['LV', 'IV', 'LIB', 'RV'],
  ['DM'],
  ['LM', 'ZM', 'RM'],
  ['OM'],
  ['LA', 'HS', 'ST', 'RA'],
];

export type Preset = Readonly<Partial<Record<Zone, number>>>;

/** Formationsvorschläge als Anzahl Spieler je Zone (Torwart immer 1). */
export const FORMATION_PRESETS: readonly Preset[] = [
  { TW: 1, LV: 1, IV: 2, RV: 1, ZM: 3, LA: 1, ST: 1, RA: 1 },
  { TW: 1, LV: 1, IV: 2, RV: 1, DM: 2, OM: 3, ST: 1 },
  { TW: 1, LV: 1, IV: 2, RV: 1, LM: 1, ZM: 2, RM: 1, ST: 2 },
  { TW: 1, LV: 1, IV: 2, RV: 1, DM: 1, ZM: 2, OM: 1, ST: 2 },
  { TW: 1, LV: 1, IV: 2, RV: 1, DM: 1, LM: 1, ZM: 2, RM: 1, ST: 1 },
  { TW: 1, IV: 3, LM: 1, ZM: 3, RM: 1, ST: 2 },
  { TW: 1, IV: 3, LM: 1, ZM: 2, RM: 1, LA: 1, ST: 1, RA: 1 },
  { TW: 1, LV: 1, IV: 3, RV: 1, ZM: 3, ST: 2 },
  { TW: 1, LV: 1, IV: 2, RV: 1, LM: 1, ZM: 3, RM: 1, ST: 1 },
];

export const MAX_ON_PITCH = 11;
/** Spieler mit diesem Status sind für die automatische Aufstellung nicht verfügbar. */
export const UNAVAILABLE_STATUSES: readonly string[] = ['Verletzt', 'Gesperrt', 'Abwesend'];

export function emptyAssignments(): Assignments {
  return Object.fromEntries(ZONES.map((zone) => [zone, []])) as unknown as Assignments;
}

/** Dokument → Aufstellung: unbekannte Zonen und (bei bekanntem Kader) unbekannte Spieler fallen weg; Doppelte auch. */
export function normalizeLineup(doc: unknown, playerIds?: ReadonlySet<string>): Assignments {
  const raw = (doc as { assignments?: Record<string, unknown> } | null | undefined)?.assignments;
  const seen = new Set<string>();
  const result: Record<string, string[]> = {};
  for (const zone of ZONES) {
    const ids = Array.isArray(raw?.[zone]) ? (raw![zone] as unknown[]).filter((id): id is string => typeof id === 'string') : [];
    result[zone] = ids.filter((id) => {
      if (seen.has(id) || (playerIds && playerIds.size > 0 && !playerIds.has(id))) return false;
      seen.add(id);
      return true;
    });
  }
  return result as unknown as Assignments;
}

/** Aufstellung → Dokument. */
export function docFromLineup(assignments: Assignments): Record<string, unknown> {
  return { assignments: Object.fromEntries(ZONES.map((zone) => [zone, [...assignments[zone]]])) };
}

export function lineupIsEmpty(assignments: Assignments): boolean {
  return ZONES.every((zone) => assignments[zone].length === 0);
}

export function onPitchCount(assignments: Assignments): number {
  return ZONES.reduce((sum, zone) => sum + assignments[zone].length, 0);
}

export function onPitchIds(assignments: Assignments): Set<string> {
  return new Set(ZONES.flatMap((zone) => assignments[zone]));
}

export function zoneOf(assignments: Assignments, playerId: string): Zone | null {
  return ZONES.find((zone) => assignments[zone].includes(playerId)) ?? null;
}

/** „4-3-3“ aus der Anzahl je Band (leere Bänder entfallen); ohne Spieler „Keine Aufstellung“. */
export function formationName(assignments: Assignments): string {
  const parts = PITCH_BANDS.map((zones) => zones.reduce((sum, zone) => sum + assignments[zone].length, 0)).filter((count) => count > 0);
  return parts.length ? parts.join('-') : 'Keine Aufstellung';
}

export function presetName(preset: Preset): string {
  return PITCH_BANDS.map((zones) => zones.reduce((sum, zone) => sum + (preset[zone] ?? 0), 0))
    .filter((count) => count > 0)
    .join('-');
}

/** Ein Spieler samt Durchschnittsnote (null = noch keine) und aktuellem Status. */
export interface Candidate {
  readonly player: Player;
  readonly grade: number | null;
  readonly status: string;
}

/** Verfügbare Spieler, beste Note zuerst (ohne Note zuletzt), dann Rückennummer. */
export function eligibleCandidates(entries: readonly Candidate[]): Candidate[] {
  return entries
    .filter((entry) => !UNAVAILABLE_STATUSES.includes(entry.status))
    .sort((a, b) => (a.grade ?? 9) - (b.grade ?? 9) || a.player.number - b.player.number);
}

interface Slot {
  readonly zone: Zone;
}

export function expandPreset(preset: Preset): Slot[] {
  return Object.entries(preset).flatMap(([zone, count]) => Array.from({ length: count ?? 0 }, () => ({ zone: zone as Zone })));
}

function popcount(mask: number): number {
  let count = 0;
  for (let value = mask; value; value >>= 1) count += value & 1;
  return count;
}

export interface SlotAssignment {
  readonly slot: Slot;
  readonly candidate: Candidate | null;
}

/**
 * Wählt aus den verfügbaren Spielern die beste Gesamtelf für die Plätze: jeder Spieler besetzt höchstens einen Platz,
 * und nur in einer Zone, die exakt in seinen Positionen steht. Optimiert (Bitmasken-DP) zuerst auf möglichst wenige
 * offene Plätze, danach auf den besten Notendurchschnitt.
 */
export function assignFormationSlots(slots: readonly Slot[], candidates: readonly Candidate[]): SlotAssignment[] {
  const fullMask = (1 << slots.length) - 1;
  const eligibility = candidates.map((entry) => {
    const positions = parsePositions(entry.player.positions);
    return slots.reduce((bits, slot, index) => (positions.includes(slot.zone) ? bits | (1 << index) : bits), 0);
  });

  let dp: number[] = new Array<number>(fullMask + 1).fill(Infinity);
  let parent: ({ prevMask: number; playerIndex: number; slotIndex: number } | null)[] = new Array(fullMask + 1).fill(null);
  dp[0] = 0;

  candidates.forEach((entry, playerIndex) => {
    const bits = eligibility[playerIndex];
    if (!bits) return;
    const grade = entry.grade ?? 9;
    const nextDp = dp.slice();
    const nextParent = parent.slice();
    for (let mask = 0; mask <= fullMask; mask += 1) {
      if (!Number.isFinite(dp[mask])) continue;
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const bit = 1 << slotIndex;
        if (!(bits & bit) || mask & bit) continue;
        const newMask = mask | bit;
        if (dp[mask] + grade < nextDp[newMask]) {
          nextDp[newMask] = dp[mask] + grade;
          nextParent[newMask] = { prevMask: mask, playerIndex, slotIndex };
        }
      }
    }
    dp = nextDp;
    parent = nextParent;
  });

  let bestMask = 0;
  for (let mask = 0; mask <= fullMask; mask += 1) {
    if (!Number.isFinite(dp[mask])) continue;
    if (popcount(mask) > popcount(bestMask) || (popcount(mask) === popcount(bestMask) && dp[mask] < dp[bestMask])) bestMask = mask;
  }

  const slotCandidate: (Candidate | null)[] = new Array<Candidate | null>(slots.length).fill(null);
  for (let mask = bestMask; mask; ) {
    const step = parent[mask];
    if (!step) break;
    slotCandidate[step.slotIndex] = candidates[step.playerIndex];
    mask = step.prevMask;
  }
  return slots.map((slot, index) => ({ slot, candidate: slotCandidate[index] }));
}

export interface FormationPreview {
  readonly assigned: readonly SlotAssignment[];
  /** Mittel der Durchschnittsnoten der besetzten Plätze; null, wenn keiner eine Note hat. */
  readonly grade: number | null;
  readonly filled: number;
  readonly total: number;
}

export function formationPreview(preset: Preset, candidates: readonly Candidate[]): FormationPreview {
  const assigned = assignFormationSlots(expandPreset(preset), candidates);
  const grades = assigned.map(({ candidate }) => candidate?.grade ?? null).filter((grade): grade is number => grade !== null && grade > 0);
  return {
    assigned,
    grade: grades.length ? roundGrade(grades.reduce((sum, value) => sum + value, 0) / grades.length) : null,
    filled: assigned.filter((item) => item.candidate).length,
    total: assigned.length,
  };
}

export function assignmentsFromPreview(assigned: readonly SlotAssignment[]): Assignments {
  const result: Record<string, string[]> = Object.fromEntries(ZONES.map((zone) => [zone, [] as string[]]));
  for (const { slot, candidate } of assigned) if (candidate) result[slot.zone].push(candidate.player.id);
  return result as unknown as Assignments;
}

/** Vorschläge für alle Formationen; „empfohlen“ ist die beste vollständig besetzbare (sonst die am besten besetzte). */
export function formationOptions(candidates: readonly Candidate[]): { name: string; preview: FormationPreview; recommended: boolean }[] {
  const previews = FORMATION_PRESETS.map((preset) => formationPreview(preset, candidates));
  const complete = previews.filter((preview) => preview.filled === preview.total);
  const pool = complete.length ? complete : previews;
  const bestFilled = Math.max(...pool.map((preview) => preview.filled));
  const bestGrade = pool.reduce<number | null>(
    (best, preview) => (preview.filled === bestFilled && preview.grade !== null && (best === null || preview.grade < best) ? preview.grade : best),
    null,
  );
  const recommended = previews.findIndex((preview) => preview.filled === bestFilled && preview.grade === bestGrade);
  return previews.map((preview, index) => ({ name: presetName(FORMATION_PRESETS[index]), preview, recommended: index === recommended }));
}

/**
 * Aufstellung, die ein leeres Board anzeigt: die empfohlene Formation (vollständig besetzbar und bester Notenschnitt,
 * sonst die am besten besetzte). Ohne bewertete Spieler bleibt das Board leer. Die bisherige App wählte hier nur nach
 * dem Notenschnitt und zeigte dadurch teils kaum besetzte Formationen; die Empfehlung der Formationsauswahl ist stimmiger.
 */
export function suggestedLineup(candidates: readonly Candidate[]): Assignments {
  const recommended = formationOptions(candidates).find((option) => option.recommended);
  return recommended && recommended.preview.filled > 0 && recommended.preview.grade !== null
    ? assignmentsFromPreview(recommended.preview.assigned)
    : emptyAssignments();
}

function without(assignments: Assignments, ids: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(ZONES.map((zone) => [zone, assignments[zone].filter((id) => !ids.includes(id))]));
}

/** Stellt den Spieler in die Zone (und nimmt ihn aus der bisherigen); „voll“, wenn er neu dazukäme und schon 11 stehen. */
export function moveToZone(assignments: Assignments, playerId: string, zone: Zone): Assignments | 'voll' {
  if (zoneOf(assignments, playerId) === null && onPitchCount(assignments) >= MAX_ON_PITCH) return 'voll';
  const next = without(assignments, [playerId]);
  next[zone].push(playerId);
  return next as unknown as Assignments;
}

export function removeFromPitch(assignments: Assignments, playerId: string): Assignments {
  return without(assignments, [playerId]) as unknown as Assignments;
}

/** Tauscht zwei Spieler; kommt einer von der Bank, geht der andere dafür auf die Bank (normale Einwechslung). */
export function swapPlayers(assignments: Assignments, a: string, b: string): Assignments {
  if (a === b) return assignments;
  const zoneA = zoneOf(assignments, a);
  const zoneB = zoneOf(assignments, b);
  const next = without(assignments, [a, b]);
  if (zoneB) next[zoneB].push(a);
  if (zoneA) next[zoneA].push(b);
  return next as unknown as Assignments;
}

/** Spieler auf der Bank: beste Note zuerst, noch unbewertete danach nach Rückennummer. */
export function benchOf(assignments: Assignments, entries: readonly Candidate[]): Candidate[] {
  const onPitch = onPitchIds(assignments);
  return entries
    .filter((entry) => !onPitch.has(entry.player.id))
    .sort((a, b) => {
      if (a.grade !== null && b.grade !== null && a.grade !== b.grade) return a.grade - b.grade;
      if (a.grade !== null && b.grade === null) return -1;
      if (a.grade === null && b.grade !== null) return 1;
      return a.player.number - b.player.number;
    });
}

/** Mannschaftsnote der Startelf (Mittel der Durchschnittsnoten); null ohne Noten. */
export function lineupGrade(assignments: Assignments, entries: readonly Candidate[]): number | null {
  const onPitch = onPitchIds(assignments);
  const grades = entries.filter((entry) => onPitch.has(entry.player.id) && entry.grade !== null).map((entry) => entry.grade as number);
  return grades.length ? roundGrade(grades.reduce((sum, value) => sum + value, 0) / grades.length) : null;
}

/** Steht der Spieler in einer Zone, die nicht zu seinen Positionen gehört? */
export function outOfPosition(player: Player, zone: Zone): boolean {
  return !parsePositions(player.positions).includes(zone);
}
