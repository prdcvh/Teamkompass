import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RunPhase, RunSource, RunState, RunTicket } from '../types'
import { isFinalReport, primaryTicketKey, runSourceOfPrompt } from './detect'
import {
  SIZE_TOKENS,
  approvalOf,
  asText,
  berlinTime,
  ciOfChecks,
  jiraCall,
  landedStatus,
  modelLabel,
  patchTicket,
  poReasonOf,
  prNumberOf,
  statusLine,
  statusOfTransition,
  toastAgentDone,
  toastMoved,
  toastRework,
  textRows,
  ticketOfAgent,
  ticketOfPr,
} from './model'
import { ApprovalBar } from './bar'
import { RunPanel } from './panel'

/** Der Run-Zustand an einer einzigen Stelle; Folge-Tickets lesen und ändern ihn hier. */
export const run = atom({ plugin: 'jira-run-mod', key: 'run' } as const, null)
export const lastRun = atom({ plugin: 'jira-run-mod', key: 'lastRun' } as const, null)

export const approvalHidden = atom({ plugin: 'jira-run-mod', key: 'approvalHidden' } as const, false)

export const PANE = 'run-status'
const PANE_TITLE = 'Run-Status'
/** Das Werkzeug, mit dem die Hauptsitzung den Nachtplan meldet (siehe `.claude/skills/jira-run/SKILL.md`). */
export const PLAN_TOOL = 'mcp__jira-run-mod__run_plan'
/** Phase der Hauptsitzung (Plan, Abschlussbericht) und Kontrolle eines Tickets (Beginn/Ergebnis), siehe SKILL.md. */
export const PHASE_TOOL = 'mcp__jira-run-mod__run_phase'
export const CHECK_TOOL = 'mcp__jira-run-mod__run_check'

type PlanEntry = { key?: string; size?: 'S' | 'M' | 'L'; estimateTokens?: number; model?: string; reason?: string }

/** Ändert den laufenden Run (falls einer läuft) und stempelt die Zeit. */
async function change($: EngineInterface, fn: (r: RunState, now: number) => RunState) {
  const now = await $.clock.now()
  await update($, run, r => (r === null ? r : fn(r, now)))
  await refreshStatus($)
}

/** Die Statuszeile folgt dem Run-Zustand; ohne Run ist sie leer. */
async function refreshStatus($: EngineInterface) {
  $.ui.status(statusLine(await read($, run)))
}

const setPhase = (phase: RunPhase | null) => (r: RunState, now: number): RunState => ({ ...r, phase, updatedAt: now })

/** Die Kontrolle eines Tickets beginnt (passed fehlt) oder ist zu Ende (passed true/false). */
async function applyCheck($: EngineInterface, key: string, passed: boolean | undefined): Promise<string> {
  if ((await read($, run)) === null) await start($, 'jira-run')
  if (passed === undefined) {
    await change($, setPhase({ kind: 'check', key }))

    return `Kontrolle ${key} läuft.`
  }
  await change($, (r, now) => patchTicket(setPhase(null)(r, now), key, { checkPassed: passed }, now))
  if (!passed) $.ui.toast(toastRework(key))

  return passed ? `Kontrolle ${key} bestanden.` : `Kontrolle ${key} nicht bestanden: Nacharbeit nötig.`
}

async function openPane($: EngineInterface): Promise<boolean> {
  const opened = await $.ui.open({ id: PANE, title: PANE_TITLE })

  return opened.isPlaced
}

async function start($: EngineInterface, source: RunSource) {
  if ((await read($, run)) !== null) return
  const startedAt = await $.clock.now()
  // Ein neuer Run beginnt immer mit leerer Tabelle.
  await update($, run, () => ({ source, startedAt, updatedAt: startedAt, tickets: [] }))
  await update($, approvalHidden, () => false)
  await refreshStatus($)
  // Ohne Fläche für das Panel bleiben die Zeilen im Chat (Schritt 5 des Skills) der Rückfall.
  if (!(await openPane($))) $.ui.toast('Run-Status: kein Platz für das Panel, die Zeilen im Chat gelten.')
}

/** Der Nachtplan: Tickets, Größe/Schätzung, Modell, ggf. Grund für eine PO-Entscheidung. */
async function applyPlan($: EngineInterface, entries: PlanEntry[]): Promise<string> {
  if ((await read($, run)) === null) await start($, 'jira-run')
  let count = 0
  for (const p of entries) {
    if (typeof p.key !== 'string' || !/^SCRUM-\d+$/.test(p.key)) continue
    const key = p.key
    const patch: Partial<RunTicket> = {}
    if (typeof p.estimateTokens === 'number') patch.estimateTokens = p.estimateTokens
    else if (p.size !== undefined && p.size in SIZE_TOKENS) patch.estimateTokens = SIZE_TOKENS[p.size]
    const label = modelLabel(p.model)
    if (label !== null) patch.model = label
    if (typeof p.reason === 'string' && p.reason !== '') patch.reason = p.reason
    await change($, (r, now) => patchTicket(r, key, patch, now))
    count++
  }

  return `Plan übernommen: ${count} Tickets im Run-Status.`
}

async function onJira($: EngineInterface, op: string, args: Record<string, unknown>, result: string) {
  const key = typeof args.issueIdOrKey === 'string' ? (/SCRUM-\d+/.exec(args.issueIdOrKey)?.[0] ?? null) : null
  if (op === 'transitionJiraIssue' && key !== null) {
    // Die Antwort nennt den Status, in dem das Ticket gelandet ist; sonst gilt die gewählte Transition.
    const status = landedStatus(result) ?? statusOfTransition(args)
    if (status === null) return
    await change($, (r, now) => patchTicket(r, key, { status }, now))
    $.ui.toast(toastMoved(key, status))
  }
}

async function onGithub($: EngineInterface, op: string, args: Record<string, unknown>, result: string) {
  const body = typeof args.body === 'string' ? args.body : ''
  if (op === 'create_pull_request') {
    const text = `${asText(args.title)} ${asText(args.head)}`
    const key = /SCRUM-\d+/i.exec(text.replace(/scrum[-/](\d+)/gi, 'SCRUM-$1'))?.[0]?.toUpperCase()
    const pr = prNumberOf(result)
    if (key === undefined || pr === null) return
    const reason = poReasonOf(body)
    await change($, (r, now) =>
      patchTicket(r, key, { pr, draft: args.draft === true, ...(reason !== null ? { reason } : {}) }, now),
    )
  } else if (op === 'update_pull_request' && typeof args.pullNumber === 'number') {
    const number = args.pullNumber
    await change($, (r, now) => {
      const t = ticketOfPr(r, number)
      if (t === undefined) return r
      const reason = poReasonOf(body)
      const patch: Partial<RunTicket> = {}
      if (typeof args.draft === 'boolean') patch.draft = args.draft
      if (reason !== null) patch.reason = reason
      else if (args.draft === false) patch.reason = null

      return patchTicket(r, t.key, patch, now)
    })
  } else if (op === 'pull_request_read' && typeof args.pullNumber === 'number') {
    const number = args.pullNumber
    if (args.method !== 'get_check_runs' && args.method !== 'get_status') return
    const ci = ciOfChecks(result)
    if (ci === null) return
    await change($, (r, now) => {
      const t = ticketOfPr(r, number)

      return t === undefined ? r : patchTicket(r, t.key, { ci }, now)
    })
  }
}

/** Bisher verbrauchte Tokens (Eingabe + Ausgabe + geschriebener Cache) eines Sub-Agenten. */
async function tokensOf($: EngineInterface, agentId: string): Promise<number> {
  try {
    const agent = (await $.agent.list()).find(a => a.id === agentId)

    return (agent?.usage ?? []).reduce(
      (n, u) => n + u.input_tokens + u.output_tokens + u.cache_creation_input_tokens,
      0,
    )
  } catch {
    return 0
  }
}

async function agentFinished($: EngineInterface, agentId: string) {
  const current = await read($, run)
  const before = current === null ? undefined : ticketOfAgent(current, agentId)
  if (before === undefined) return
  // agent.report und turn.complete melden denselben Agenten: nur das erste Mal gibt einen Hinweis.
  if (!before.agentDone) $.ui.toast(toastAgentDone(before.key, before.pr))
  const tokensActual = await tokensOf($, agentId)
  await change($, (r, now) => {
    const t = ticketOfAgent(r, agentId)

    return t === undefined
      ? r
      : patchTicket(r, t.key, { agentDone: true, tokensActual: Math.max(tokensActual, t.tokensActual) }, now)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'run-status',
      description: 'Zeigt den Stand des Runs (Tickets, Slots, Tokens) in einem Panel neben dem Chat',
    })
    await $.tool.register({
      name: 'run_plan',
      description:
        'Meldet den Nachtplan an das Run-Status-Panel: je Ticket Schlüssel, Größe (S/M/L) oder Token-Schätzung, Modell und ggf. den Grund, warum der PO entscheiden muss. Einmal nach dem Plan aufrufen, bei Änderungen erneut.',
      inputSchema: {
        type: 'object',
        properties: {
          tickets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', description: 'Jira-Schlüssel, z. B. SCRUM-240' },
                size: { type: 'string', enum: ['S', 'M', 'L'] },
                estimateTokens: { type: 'number' },
                model: { type: 'string', description: 'Sonnet, Opus oder Haiku' },
                reason: { type: 'string', description: 'Wofür der PO gebraucht wird' },
              },
              required: ['key'],
            },
          },
        },
        required: ['tickets'],
      },
      isDeferred: false,
    })

    await $.tool.register({
      name: 'run_phase',
      description:
        'Meldet die Phase der Hauptsitzung an die Statuszeile: "plan" (Nachtplan wird erstellt) oder "report" (Abschlussbericht wird geschrieben). Kontrolle und Merge laufen über run_check bzw. werden am Merge erkannt.',
      inputSchema: {
        type: 'object',
        properties: { phase: { type: 'string', enum: ['plan', 'report'] } },
        required: ['phase'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'run_check',
      description:
        'Meldet die Kontrolle eines Tickets: ohne "passed" zu Beginn (Statuszeile "Run: Kontrolle SCRUM-xxx"), am Ende mit "passed" true/false; false zeigt den Hinweis "Nacharbeit nötig".',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Jira-Schlüssel, z. B. SCRUM-171' },
          passed: { type: 'boolean', description: 'Ergebnis; weglassen, wenn die Kontrolle beginnt' },
        },
        required: ['key'],
      },
      isDeferred: false,
    })

    return next(e)
  })

  // Start durch /jira-run: der Skill wird geladen.
  on('skill.prompt', { skill: 'jira-run' }, async ($, e, next) => {
    await start($, 'jira-run')

    return next(e)
  })

  // Start durch die Nachtschicht (geplanter Prompt) oder durch den getippten Befehl.
  on('prompt.submit', async ($, e, next) => {
    const source = runSourceOfPrompt(e.text)
    if (source !== null) await start($, source)

    return next(e)
  })

  on('command.run', { command: 'run-status' }, async $ => {
    const isPlaced = await openPane($)
    if (isPlaced) return { text: 'Run-Status geöffnet.' }
    const state = (await read($, run)) ?? (await read($, lastRun))

    return { text: textRows(state).join('\n') }
  })

  // Statuswechsel in Jira und PRs auf GitHub: das Panel liest sie aus den Tool-Aufrufen, niemand pflegt es.
  on('tool.call', async ($, e, next) => {
    if (e.tool === PLAN_TOOL) {
      const tickets = (e as { tickets?: unknown }).tickets

      return { result: await applyPlan($, Array.isArray(tickets) ? (tickets as PlanEntry[]) : []) }
    }
    if (e.tool === PHASE_TOOL) {
      const phase = (e as { phase?: unknown }).phase
      if (phase !== 'plan' && phase !== 'report') return { result: 'Unbekannte Phase (plan oder report).' }
      if ((await read($, run)) === null) await start($, 'jira-run')
      await change($, setPhase({ kind: phase }))

      return { result: `Phase gemeldet: ${phase}.` }
    }
    if (e.tool === CHECK_TOOL) {
      const { key, passed } = e as { key?: unknown; passed?: unknown }
      if (typeof key !== 'string' || !/^SCRUM-\d+$/.test(key)) return { result: 'Ungültiger Ticket-Schlüssel.' }

      return { result: await applyCheck($, key, typeof passed === 'boolean' ? passed : undefined) }
    }
    const call = jiraCall(e as Record<string, unknown>)
    if (call !== null && (await read($, run)) === null) {
      // Außerhalb eines Runs: wird ein PR der Freigabe-Leiste gemergt, verschwindet er aus ihr.
      const ran = await next(e)
      const pr = call.args.pullNumber
      if (call.op === 'merge_pull_request' && typeof pr === 'number' && ran.deny === undefined && ran.isError !== true) {
        await update($, lastRun, l =>
          l === null ? l : { ...l, tickets: l.tickets.map(t => (t.pr === pr ? { ...t, status: 'Erledigt' as const } : t)) },
        )
      }

      return ran
    }
    if (call === null) return next(e)

    // Beim Mergen genehmigter PRs zeigt die Statuszeile "Run: Merge SCRUM-xxx".
    const merging = call.op === 'merge_pull_request' && typeof call.args.pullNumber === 'number' ? call.args.pullNumber : null
    const mergeKey = merging === null ? undefined : ticketOfPr((await read($, run))!, merging)?.key
    if (mergeKey !== undefined) await change($, setPhase({ kind: 'merge', key: mergeKey }))
    const ran = await next(e)
    if (mergeKey !== undefined) await change($, setPhase(null))
    if (ran.deny !== undefined || ran.isError === true) return ran
    const result = asText(ran.result)
    await onJira($, call.op, call.args, result)
    await onGithub($, call.op, call.args, result)

    return ran
  })

  // Jeder Sub-Agent, der während eines Runs ein Ticket bearbeitet, belegt einen Platz.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const key = primaryTicketKey(e.description, e.prompt)
    if (started.deny === undefined && key !== null && (await read($, run)) !== null) {
      const model = modelLabel(e.model) ?? modelLabel(started.model)
      await change($, (r, now) => {
        const t = r.tickets.find(x => x.key === key)
        const status = t === undefined || t.status === 'Zu erledigen' ? 'In Bearbeitung' : t.status

        return patchTicket(
          r,
          key,
          { agentId: started.agentId ?? null, agentDone: false, status, ...(model !== null ? { model } : {}) },
          now,
        )
      })
    }

    return started
  })

  // Der Sub-Agent hat sich zurückgemeldet: sein Platz wird frei.
  on('agent.report', async ($, e, next) => {
    await agentFinished($, e.agentId)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) await agentFinished($, e.agentId)

    // Ende: der Abschlussbericht der Hauptsitzung (nicht die Antwort eines Sub-Agenten).
    const current = await read($, run)
    if (current !== null && e.agentId === undefined && isFinalReport(e.answer)) {
      const endedAt = await $.clock.now()
      await update($, lastRun, () => ({ ...current, endedAt, updatedAt: endedAt }))
      await update($, run, () => null)
      await update($, approvalHidden, () => false)
      await refreshStatus($)
    }

    return next(e)
  })

  // Freigabe-Leiste (SCRUM-241): nur Anzeige, öffnet das Ticket in Jira; gemergt wird hier nie.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, run)) !== null || (await read($, approvalHidden))) return next(e)
    const approval = approvalOf(await read($, lastRun))
    if (approval.ready.length === 0 && approval.decide.length === 0) return next(e)
    const { Box, Text, Button, Link } = $.ui.resolve(e)

    return ApprovalBar({ Box, Text, Button, Link }, approval, () => update($, approvalHidden, () => true))
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const running = await read($, run)
    const state = running ?? (await read($, lastRun))

    return RunPanel({ Box, Text }, state, running === null)
  })
}

export { berlinTime }
