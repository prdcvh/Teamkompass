import type { RunState, StatEntry } from '../types'
import { fmtTokens } from './model'

/** Schlüssel im `$.store` des Plugins (JSON-Datei im Claude-Konfigurationsordner der Maschine). */
export const STORE_KEY = 'token-stats'
/** So viele Einträge bleiben höchstens (das `$.store` fasst insgesamt 4 MiB). */
export const MAX_ENTRIES = 500

const isEntry = (v: unknown): v is StatEntry => {
  const e = v as Partial<StatEntry> | null

  return (
    e !== null &&
    typeof e === 'object' &&
    typeof e.key === 'string' &&
    (e.size === 'S' || e.size === 'M' || e.size === 'L') &&
    typeof e.model === 'string' &&
    typeof e.estimateTokens === 'number' &&
    typeof e.actualTokens === 'number' &&
    typeof e.date === 'string'
  )
}

/** Liest gespeicherte Werte; alles, was kein gültiger Eintrag ist, fällt weg (neuer Code, alte Werte). */
export const parseEntries = (raw: unknown): StatEntry[] => (Array.isArray(raw) ? raw.filter(isEntry) : [])

/** Die Größe, deren Pauschalwert (S 50k, M 150k, L 400k) der Schätzung am nächsten liegt. */
export function sizeOfEstimate(estimate: number, sizes: Record<'S' | 'M' | 'L', number>): 'S' | 'M' | 'L' {
  const list = (['S', 'M', 'L'] as const).map(s => [s, Math.abs(sizes[s] - estimate)] as const)

  return list.reduce((best, x) => (x[1] < best[1] ? x : best))[0]
}

/**
 * Nimmt neue Einträge auf. Ein Ticket steht nur einmal drin (der neueste Wert gewinnt, z. B. nach Nacharbeit
 * in einem späteren Run); die ältesten fallen bei Überlauf weg.
 */
export function addEntries(old: StatEntry[], added: StatEntry[]): StatEntry[] {
  const keys = new Set(added.map(e => e.key))

  return [...old.filter(e => !keys.has(e.key)), ...added].slice(-MAX_ENTRIES)
}

export type Average = { size: 'S' | 'M' | 'L'; model: string; count: number; avgActual: number; avgEstimate: number }

/** Durchschnitt des tatsächlichen Verbrauchs je Größe und Modell. */
export function averages(entries: StatEntry[]): Average[] {
  const groups = new Map<string, StatEntry[]>()
  for (const e of entries) groups.set(`${e.size}|${e.model}`, [...(groups.get(`${e.size}|${e.model}`) ?? []), e])
  const rows = [...groups.values()].map(g => ({
    size: g[0]!.size,
    model: g[0]!.model,
    count: g.length,
    avgActual: Math.round(g.reduce((n, e) => n + e.actualTokens, 0) / g.length),
    avgEstimate: Math.round(g.reduce((n, e) => n + e.estimateTokens, 0) / g.length),
  }))

  return rows.sort((a, b) => a.size.localeCompare(b.size) || a.model.localeCompare(b.model))
}

/** Zeilen für den Nachtplan: "M mit Sonnet: im Schnitt 180k aus 6 Tickets (geschätzt war 150k)". */
export function averageLines(entries: StatEntry[]): string[] {
  const rows = averages(entries)
  if (rows.length === 0) return ['Noch keine gespeicherten Verbrauchswerte, es gelten die Pauschalwerte (S 50k, M 150k, L 400k).']

  return rows.map(
    a =>
      `${a.size} mit ${a.model}: im Schnitt ${fmtTokens(a.avgActual)} aus ${a.count} ${a.count === 1 ? 'Ticket' : 'Tickets'} (geschätzt war ${fmtTokens(a.avgEstimate)})`,
  )
}

/** Einträge für alle Tickets des Runs, für die Modell, Schätzung und ein Verbrauch bekannt sind. */
export function entriesOfRun(run: RunState, date: string, sizeOf: (estimate: number) => 'S' | 'M' | 'L'): StatEntry[] {
  return run.tickets.flatMap(t =>
    t.model !== null && t.estimateTokens !== null && t.tokensActual > 0
      ? [
          {
            key: t.key,
            size: t.size ?? sizeOf(t.estimateTokens),
            model: t.model,
            estimateTokens: t.estimateTokens,
            actualTokens: t.tokensActual,
            date,
          },
        ]
      : [],
  )
}

/** Zeilen für den Abschlussbericht: je Ticket geschätzt und tatsächlich. */
export function reportLines(run: RunState): string[] {
  return run.tickets.map(t => {
    const est = t.estimateTokens === null ? 'keine Schätzung' : `geschätzt ${fmtTokens(t.estimateTokens)}`
    const act = t.tokensActual > 0 ? `tatsächlich ${fmtTokens(t.tokensActual)}` : 'tatsächlich nicht gemessen'

    return `${t.key} (${t.size ?? '?'}, ${t.model ?? '–'}): ${est}, ${act}`
  })
}

export const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
