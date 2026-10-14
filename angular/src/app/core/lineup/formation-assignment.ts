/**
 * Automatische Aufstellung: verfügbare Spieler den Zonen einer Formation zuordnen, Vorschau und Vorschlag
 * (wie outputs/team-manager/app.js: assignFormationSlots, formationPreview, renderFormationPicker).
 * Noten sind Schulnoten: kleiner ist besser.
 */
import { type Player, parsePositions } from '../player/player';
import { roundGrade } from '../ratings/rating';
import { FORMATION_PRESETS, type Preset, UNAVAILABLE_STATUSES, ZONES, type Zone, presetName } from './pitch';
import { type Assignments, emptyAssignments } from './lineup';

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
