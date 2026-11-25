import type { CiState, RunState, RunTicket, TicketStatus } from '../types'

/** So viele Sub-Agenten laufen höchstens gleichzeitig (CLAUDE.md, „Parallele Tickets“). */
export const MAX_SLOTS = 3

export function newTicket(key: string, status: TicketStatus = 'In Bearbeitung'): RunTicket {
  return {
    key,
    status,
    model: null,
    pr: null,
    estimateTokens: null,
    agentId: null,
    agentRunning: false,
    ci: null,
    isDraft: false,
    note: null,
    usedTokens: 0,
  }
}

/** Ein neuer Run beginnt immer mit einer leeren Tabelle. */
export function emptyRun(source: RunState['source'], startedAt: number): RunState {
  return { source, startedAt, tickets: [], otherTokens: 0 }
}

/** Ändert das Ticket mit diesem Schlüssel; gibt es das noch nicht, wird es zuerst angelegt. */
export function withTicket(
  run: RunState,
  key: string,
  change: (t: RunTicket) => RunTicket,
  status?: TicketStatus,
): RunState {
  const found = run.tickets.some(t => t.key === key)
  const tickets = found ? run.tickets : [...run.tickets, newTicket(key, status)]

  return { ...run, tickets: tickets.map(t => (t.key === key ? change(t) : t)) }
}

export type PlanEntry = { key: string; model?: string | null; estimateTokens?: number | null }

/** Der Nachtplan: setzt Modell und Schätzung; neue Tickets starten als „Zu erledigen“. */
export function applyPlan(run: RunState, plan: PlanEntry[]): RunState {
  return plan.reduce(
    (r, p) =>
      withTicket(
        r,
        p.key,
        t => ({
          ...t,
          model: p.model ?? t.model,
          estimateTokens: p.estimateTokens ?? t.estimateTokens,
        }),
        'Zu erledigen',
      ),
    run,
  )
}

/** Ein Sub-Agent startet: er gehört dem ersten Ticket, das sein Auftrag nennt; weitere Tickets werden nur eingetragen. */
export function applySpawn(
  run: RunState,
  keys: string[],
  agentId: string | undefined,
  model: string | null,
): RunState {
  return keys.reduce(
    (r, key, i) =>
      withTicket(r, key, t => ({
        ...t,
        status: t.status === 'Zu erledigen' ? 'In Bearbeitung' : t.status,
        model: model ?? t.model,
        ...(i === 0 && agentId !== undefined ? { agentId, agentRunning: true } : {}),
      })),
    run,
  )
}

/** Der Sub-Agent hat seinen Bericht abgegeben (fertig, fehlgeschlagen oder gestoppt): der Slot ist frei. */
export function applyAgentEnd(run: RunState, agentId: string): RunState {
  return { ...run, tickets: run.tickets.map(t => (t.agentId === agentId ? { ...t, agentRunning: false } : t)) }
}

/** Jira-Statuswechsel auf ein Ticket des Runs. */
export function applyStatus(run: RunState, key: string, status: TicketStatus): RunState {
  return withTicket(run, key, t => ({ ...t, status }))
}

export function applyPr(run: RunState, key: string, pr: number, isDraft: boolean): RunState {
  return withTicket(run, key, t => ({ ...t, pr, isDraft, ci: null }))
}

export function applyDraft(run: RunState, pr: number, isDraft: boolean): RunState {
  return { ...run, tickets: run.tickets.map(t => (t.pr === pr ? { ...t, isDraft } : t)) }
}

export function applyCi(run: RunState, pr: number, ci: CiState): RunState {
  return { ...run, tickets: run.tickets.map(t => (t.pr === pr ? { ...t, ci } : t)) }
}

export function applyNote(run: RunState, key: string, note: string): RunState {
  return withTicket(run, key, t => ({ ...t, note }))
}

/** Verbrauch einer Runde: dem Ticket des Sub-Agenten gutgeschrieben, sonst „übrig“ (Hauptsitzung, Agent ohne Ticket). */
export function addUsage(run: RunState, agentId: string | undefined, tokens: number): RunState {
  const owner = agentId === undefined ? undefined : run.tickets.find(t => t.agentId === agentId)
  if (owner === undefined) return { ...run, otherTokens: run.otherTokens + tokens }

  return {
    ...run,
    tickets: run.tickets.map(t => (t === owner ? { ...t, usedTokens: t.usedTokens + tokens } : t)),
  }
}

/** Wartet das Ticket auf eine Entscheidung des PO? Grund als Text, sonst null. */
export function waitingReason(t: RunTicket): string | null {
  if (t.status === 'Frage') return t.note ?? 'Frage an den PO'
  if (t.pr !== null && t.isDraft && t.status !== 'Genehmigt' && t.status !== 'Erledigt') {
    return t.note ?? 'Draft-PR: PO muss entscheiden'
  }

  return null
}

export type RunSummary = {
  slots: number
  maxSlots: number
  done: number
  open: number
  planned: number
  used: number
}

/** Kopfzeile des Panels. „Fertig“: das Ticket ist in Überprüfung, genehmigt oder erledigt. */
export function summarize(run: RunState): RunSummary {
  const done = run.tickets.filter(
    t => t.status === 'In Überprüfung' || t.status === 'Genehmigt' || t.status === 'Erledigt',
  ).length

  return {
    slots: run.tickets.filter(t => t.agentRunning).length,
    maxSlots: MAX_SLOTS,
    done,
    open: run.tickets.length - done,
    planned: run.tickets.reduce((n, t) => n + (t.estimateTokens ?? 0), 0),
    used: run.otherTokens + run.tickets.reduce((n, t) => n + t.usedTokens, 0),
  }
}

/** Zählt eine Runde: Eingabe, Ausgabe und neu geschriebener Cache; das Lesen aus dem Cache bleibt draußen, es würde den Wert aufblähen. */
export function tokensOf(
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number } | undefined,
): number {
  return usage === undefined ? 0 : usage.input_tokens + usage.output_tokens + usage.cache_creation_input_tokens
}
