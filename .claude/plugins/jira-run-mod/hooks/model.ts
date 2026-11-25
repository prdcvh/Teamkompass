import type { RunState, RunTicket, TicketStatus } from '../types'

/** So viele Sub-Agenten laufen höchstens gleichzeitig (CLAUDE.md, "Parallel tickets"). */
export const SLOTS = 3

/** Grobe Schätzung je Größe, wie im Nachtplan (CLAUDE.md, "Night plan first"). */
export const SIZE_TOKENS = { S: 50_000, M: 150_000, L: 400_000 } as const

const STATUSES: TicketStatus[] = ['Zu erledigen', 'In Bearbeitung', 'Frage', 'In Überprüfung', 'Genehmigt', 'Erledigt']

/** Transition-IDs des Jira-Workflows im Projekt SCRUM. */
const TRANSITION_IDS: Record<string, TicketStatus> = {
  '11': 'Zu erledigen',
  '21': 'In Bearbeitung',
  '31': 'In Überprüfung',
  '41': 'Erledigt',
  '2': 'Genehmigt',
  '3': 'Frage',
}

export const isStatus = (s: unknown): s is TicketStatus => STATUSES.includes(s as TicketStatus)

export const newTicket = (key: string): RunTicket => ({
  key,
  status: 'Zu erledigen',
  model: null,
  pr: null,
  estimateTokens: null,
  agentId: null,
  agentDone: false,
  draft: false,
  reason: null,
  ci: null,
  tokensActual: 0,
})

/** Ändert ein Ticket (legt es an, wenn es fehlt) und stempelt die Änderungszeit. */
export function patchTicket(run: RunState, key: string, patch: Partial<RunTicket>, now: number): RunState {
  const exists = run.tickets.some(t => t.key === key)
  const tickets = exists ? run.tickets : [...run.tickets, newTicket(key)]

  return { ...run, updatedAt: now, tickets: tickets.map(t => (t.key === key ? { ...t, ...patch } : t)) }
}

export const ticketOfPr = (run: RunState, pr: number) => run.tickets.find(t => t.pr === pr)
export const ticketOfAgent = (run: RunState, agentId: string) => run.tickets.find(t => t.agentId === agentId)

/** Welche Jira-Operation ein Tool-Aufruf ist (direkt oder über `executeWrite`) und mit welchen Argumenten. */
export function jiraCall(e: Record<string, unknown>): { op: string; args: Record<string, unknown> } | null {
  const tool = typeof e.tool === 'string' ? e.tool : ''
  if (!tool.startsWith('mcp__')) return null
  const suffix = tool.split('__').pop() ?? ''
  if (/^execute/.test(suffix) && typeof e.name === 'string') {
    const inputs = e.inputs

    return { op: e.name, args: inputs !== null && typeof inputs === 'object' ? (inputs as Record<string, unknown>) : {} }
  }

  return { op: suffix, args: e }
}

/** Ziel-Status eines Statuswechsel-Aufrufs (`transitionJiraIssue`): aus der Transition-ID oder ihrem Namen. */
export function statusOfTransition(args: Record<string, unknown>): TicketStatus | null {
  const id = args.transitionId
  if (typeof id === 'string' || typeof id === 'number') return TRANSITION_IDS[String(id)] ?? null
  const name = args.transitionName

  return isStatus(name) ? name : null
}

/** Status, in dem das Ticket laut Antwort gelandet ist ("status":{…"name":"…"}), falls erkennbar. */
export function landedStatus(text: string): TicketStatus | null {
  const m = /"status":\s*\{[^{}]*?"name":\s*"([^"]+)"/.exec(text.replace(/\\"/g, '"'))

  return m && isStatus(m[1]) ? m[1] : null
}

export const asText = (v: unknown): string => (typeof v === 'string' ? v : (JSON.stringify(v ?? '') ?? ''))

export function prNumberOf(text: string): number | null {
  const m = /\/pull\/(\d+)/.exec(text) ?? /"number":\s*(\d+)/.exec(text.replace(/\\"/g, '"'))

  return m ? Number(m[1]) : null
}

/** CI-Stand aus der Antwort von `pull_request_read` / `get_check_runs`. */
export function ciOfChecks(text: string): RunTicket['ci'] {
  const t = text.replace(/\\"/g, '"')
  if (/"conclusion":\s*"(failure|timed_out|cancelled|action_required)"/.test(t)) return 'rot'
  if (/"status":\s*"(in_progress|queued|pending|waiting)"|"conclusion":\s*null/.test(t)) return 'läuft'
  if (/"conclusion":\s*"success"/.test(t)) return 'grün'

  return null
}

/** "Sonnet", "Opus" oder "Haiku" aus einem Modellnamen oder einer Modell-ID. */
export function modelLabel(model: string | null | undefined): string | null {
  const m = /(opus|sonnet|haiku)/i.exec(model ?? '')

  return m ? m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase() : null
}

/** Grund aus der PR-Beschreibung: eine Zeile "PO-Entscheidung: …". */
export function poReasonOf(body: string): string | null {
  const m = /^\W*PO-Entscheidung:\s*(.+)$/im.exec(body)

  return m ? m[1]!.trim() : null
}

/** Das Ticket wartet auf den PO: Frage, oder ein Draft-PR. Gibt den Grund zurück. */
export function waitingForPo(t: RunTicket): string | null {
  if (t.status === 'Frage') return t.reason ?? 'Frage an den PO (siehe Ticket)'
  if (t.draft && t.pr !== null && t.status !== 'Erledigt') return t.reason ?? 'Draft-PR, Grund steht im Ticket'

  return null
}

export type Summary = { slotsBusy: number; done: number; open: number; planned: number; actual: number }

/** Zähler über dem Panel. "Fertig" = Entwicklung abgeschlossen: In Überprüfung, Genehmigt oder Erledigt. */
export function summarize(run: RunState): Summary {
  const isDone = (t: RunTicket) => t.status === 'In Überprüfung' || t.status === 'Genehmigt' || t.status === 'Erledigt'

  return {
    slotsBusy: run.tickets.filter(t => t.agentId !== null && !t.agentDone).length,
    done: run.tickets.filter(isDone).length,
    open: run.tickets.filter(t => !isDone(t)).length,
    planned: run.tickets.reduce((n, t) => n + (t.estimateTokens ?? 0), 0),
    actual: run.tickets.reduce((n, t) => n + t.tokensActual, 0),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Letzter Sonntag eines Monats, 01:00 UTC (Beginn/Ende der EU-Sommerzeit), in ms. */
function lastSundayUtc(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0))

  return Date.UTC(year, month, lastDay.getUTCDate() - lastDay.getUTCDay(), 1)
}

/** Deutsche Uhrzeit (Europe/Berlin, Sommerzeit nach EU-Regel) als "HH:MM". */
export function berlinTime(ms: number): string {
  const year = new Date(ms).getUTCFullYear()
  const summer = ms >= lastSundayUtc(year, 2) && ms < lastSundayUtc(year, 9)
  const d = new Date(ms + (summer ? 2 : 1) * 3_600_000)

  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export const fmtTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

/** Dieselben Zeilen als reiner Text, für `/run-status` und überall, wo keine Fläche für das Panel da ist. */
export function textRows(run: RunState | null): string[] {
  if (run === null) return ['Kein Run aktiv.']
  const s = summarize(run)
  const head = `Stand ${berlinTime(run.updatedAt)} · Slots ${s.slotsBusy}/${SLOTS} · fertig ${s.done}, offen ${s.open} · Tokens geplant ${fmtTokens(s.planned)}, bisher ${fmtTokens(s.actual)}`
  const rows = run.tickets.map(t => {
    const wait = waitingForPo(t)

    return `${t.key} | ${t.model ?? '–'} | ${t.status} | ${t.pr !== null ? `#${t.pr}${t.draft ? ' (Draft)' : ''}` : '–'} | ${t.ci ?? '–'}${wait ? ` | WARTET AUF PO: ${wait}` : ''}`
  })

  return [head, ...(rows.length > 0 ? rows : ['Noch keine Tickets im Run.'])]
}

/** Toast, wenn ein Sub-Agent fertig ist: "SCRUM-171 fertig – PR #236". */
export const toastAgentDone = (key: string, pr: number | null) => `${key} fertig${pr !== null ? ` – PR #${pr}` : ''}`

/** Toast, wenn ein Ticket in Jira verschoben wird: "SCRUM-171 → In Überprüfung". */
export const toastMoved = (key: string, status: string) => `${key} → ${status}`

/** Toast, wenn eine Kontrolle nicht bestanden ist. */
export const toastRework = (key: string) => `${key}: Nacharbeit nötig`

/**
 * Die Statuszeile ("Run: Plan", "Run: 2/3 Agenten aktiv", "Run: Kontrolle SCRUM-171", "Run: Merge SCRUM-171",
 * "Run: Abschlussbericht"); ohne laufenden Run undefined, also leer.
 */
export function statusLine(run: RunState | null): string | undefined {
  if (run === null) return undefined
  const phase = run.phase ?? null
  if (phase?.kind === 'check') return `Run: Kontrolle ${phase.key}`
  if (phase?.kind === 'merge') return `Run: Merge ${phase.key}`
  if (phase?.kind === 'report') return 'Run: Abschlussbericht'
  const busy = summarize(run).slotsBusy
  if (busy > 0) return `Run: ${busy}/${SLOTS} Agenten aktiv`
  if (phase?.kind === 'plan' || !run.tickets.some(t => t.agentId !== null)) return 'Run: Plan'

  return 'Run: läuft'
}
