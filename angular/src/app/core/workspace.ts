/**
 * Geräte-Einstellungen („Datenschutz & Nachvollziehbarkeit“): lokale Aufbewahrungsdauer und ein
 * Aktivitätsverlauf, der nur auf diesem Gerät liegt. Gleicher Speicherschlüssel und gleiche Form wie die
 * bisherige App (outputs/team-manager/next-level.js), damit beide Versionen auf demselben Gerät dieselben
 * Werte sehen.
 */
export const WORKSPACE_KEY = 'teamkompass-workspace-v1';
export const RETENTION_OPTIONS = [
  { days: 30, label: '30 Tage' },
  { days: 90, label: '90 Tage' },
  { days: 180, label: '180 Tage' },
  { days: 365, label: '1 Jahr' },
] as const;
export const DEFAULT_RETENTION_DAYS = 90;
export const MAX_ACTIVITIES = 100;

export interface Activity {
  readonly id: string;
  /** ISO-Zeitpunkt. */
  readonly at: string;
  readonly action: string;
}

export interface Workspace {
  readonly retentionDays: number;
  readonly activity: readonly Activity[];
}

export const DEFAULT_WORKSPACE: Workspace = { retentionDays: DEFAULT_RETENTION_DAYS, activity: [] };

/** Liest gespeicherte Einstellungen; fehlerhafte oder fremde Werte fallen auf die Standardwerte zurück. */
export function parseWorkspace(raw: string | null): Workspace {
  if (!raw) return DEFAULT_WORKSPACE;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return DEFAULT_WORKSPACE;
    const record = data as Record<string, unknown>;
    const days = Number(record['retentionDays']);
    const retentionDays = RETENTION_OPTIONS.some((option) => option.days === days) ? days : DEFAULT_RETENTION_DAYS;
    const activity = Array.isArray(record['activity'])
      ? record['activity']
          .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
          .filter((item) => typeof item['action'] === 'string' && typeof item['at'] === 'string')
          .map((item) => ({ id: typeof item['id'] === 'string' ? item['id'] : String(item['at']), at: String(item['at']), action: String(item['action']) }))
          .slice(0, MAX_ACTIVITIES)
      : [];
    return { retentionDays, activity };
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

/** Neuester Eintrag zuerst; der Verlauf behält höchstens `MAX_ACTIVITIES` Einträge. */
export function withActivity(workspace: Workspace, action: string, at: Date, id: string): Workspace {
  return { ...workspace, activity: [{ id, at: at.toISOString(), action }, ...workspace.activity].slice(0, MAX_ACTIVITIES) };
}

export function retentionLabel(days: number): string {
  return RETENTION_OPTIONS.find((option) => option.days === days)?.label ?? `${days} Tage`;
}
