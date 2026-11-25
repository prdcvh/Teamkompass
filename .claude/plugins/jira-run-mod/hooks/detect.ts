import type { CiState, RunSource, TicketStatus } from '../types'

/** Start durch `/jira-run` oder durch den Prompt der geplanten Nachtschicht. */
export function runSourceOfPrompt(text: string): RunSource | null {
  if (/^\s*\/jira-run\b/.test(text)) return 'jira-run'
  if (/^\s*Nachtschicht für die TeamKompass-App/i.test(text)) return 'nachtschicht'
  if (/^\s*TeamKompass Nachtschicht/i.test(text)) return 'nachtschicht'

  return null
}

/** Ende des Runs: der Abschlussbericht der Hauptsitzung, erkennbar an einer Zeile oder Überschrift, die damit beginnt. */
export function isFinalReport(answer: string): boolean {
  return /^\s*(#+\s*)?[*_]*Abschlussbericht/im.test(answer)
}

/** Ticket-Schlüssel (SCRUM-123), die in einem Text vorkommen, ohne Duplikate. */
export function ticketKeys(text: string): string[] {
  return [...new Set(text.match(/\bSCRUM-\d+\b/g) ?? [])]
}

const STATUSES: readonly TicketStatus[] = [
  'Zu erledigen',
  'In Bearbeitung',
  'Frage',
  'In Überprüfung',
  'Genehmigt',
  'Erledigt',
]

/** Jira-Status, der in einem Text vorkommt (Ergebnis oder Eingabe eines Statuswechsels); der letzte Treffer zählt. */
export function statusIn(text: string): TicketStatus | null {
  const lower = text.toLowerCase()
  let best: TicketStatus | null = null
  let at = -1
  for (const s of STATUSES) {
    const i = lower.lastIndexOf(s.toLowerCase())
    if (i > at) {
      at = i
      best = s
    }
  }

  return best
}

/** Jira-Statuswechsel: zuerst der Name im Aufruf, dann Übergang 3 (laut Workflow „Frage“), sonst der Status im Ergebnis. */
export function statusOfTransition(result: string, input: unknown): TicketStatus | null {
  const t = (input as { transition?: { id?: unknown; name?: unknown } } | null)?.transition
  if (t?.name !== undefined) {
    const named = statusIn(String(t.name))
    if (named !== null) return named
  }
  if (t?.id !== undefined && String(t.id) === '3') return 'Frage'

  return statusIn(result)
}

/** PR-Nummer aus dem Ergebnis von „PR anlegen“ (Link mit /pull/123 oder JSON mit number). */
export function prNumberOf(text: string): number | null {
  const m = /\/pull\/(\d+)/.exec(text) ?? /"number"\s*:\s*(\d+)/.exec(text)

  return m === null ? null : Number(m[1])
}

/** Stand der CI aus dem Ergebnis von get_check_runs; null, wenn nichts Eindeutiges drinsteht. */
export function ciOf(text: string): CiState | null {
  if (/"conclusion"\s*:\s*"(failure|timed_out|cancelled|action_required)"/.test(text)) return 'rot'
  if (/"status"\s*:\s*"(in_progress|queued|pending|waiting)"|"conclusion"\s*:\s*null/.test(text)) return 'läuft'
  if (/"conclusion"\s*:\s*"success"/.test(text)) return 'grün'

  return null
}

/** Der Teil „Was noch fehlt / wo ich unsicher bin“ eines Ticketkommentars, gekürzt; null, wenn es ihn nicht gibt. */
export function waitNoteOf(comment: string): string | null {
  const m = /Was noch fehlt[^\n]*\n+([\s\S]*)$/i.exec(comment)
  if (m === null) return null
  const text = m[1]!
    .replace(/\n+(\*\*|#+)[\s\S]*$/, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text === '') return null

  return text.length > 140 ? `${text.slice(0, 139)}…` : text
}

/** „sonnet“ → „Sonnet“, „claude-opus-5-5“ → „Opus“; Unbekanntes bleibt, leer = null. */
export function modelLabel(model: string | undefined | null): string | null {
  if (model === undefined || model === null || model.trim() === '') return null
  const m = /(opus|sonnet|haiku)/i.exec(model)
  if (m === null) return model

  return m[1]![0]!.toUpperCase() + m[1]!.slice(1).toLowerCase()
}

/** 150000 → „150k“, 1250000 → „1,25M“. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${String(Math.round(n / 10_000) / 100).replace('.', ',')}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`

  return String(n)
}

/** Tag des Monats (1–31), auf den der letzte Sonntag fällt (month 0-basiert). */
function lastSunday(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0))

  return last.getUTCDate() - last.getUTCDay()
}

/** Versatz von Europe/Berlin zu UTC in Stunden: Sommerzeit vom letzten Sonntag im März bis zum letzten im Oktober, jeweils 01:00 UTC. */
export function berlinOffsetHours(ms: number): 1 | 2 {
  const year = new Date(ms).getUTCFullYear()
  const from = Date.UTC(year, 2, lastSunday(year, 2), 1)
  const to = Date.UTC(year, 9, lastSunday(year, 9), 1)

  return ms >= from && ms < to ? 2 : 1
}

/** Uhrzeit in deutscher Zeit, z. B. „22:31“. */
export function berlinClock(ms: number): string {
  const d = new Date(ms + berlinOffsetHours(ms) * 3_600_000)
  const two = (n: number) => String(n).padStart(2, '0')

  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`
}
