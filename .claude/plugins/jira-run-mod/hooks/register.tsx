import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FinishedRun, RunSource, RunState } from '../types'
import {
  berlinClock,
  ciOf,
  formatTokens,
  isFinalReport,
  modelLabel,
  prNumberOf,
  runSourceOfPrompt,
  statusOfTransition,
  ticketKeys,
  waitNoteOf,
} from './detect'
import {
  addUsage,
  applyAgentEnd,
  applyCi,
  applyDraft,
  applyNote,
  applyPlan,
  applyPr,
  applySpawn,
  applyStatus,
  emptyRun,
  summarize,
  tokensOf,
  waitingReason,
} from './run-logic'
import type { PlanEntry } from './run-logic'

/** Der Run-Zustand an einer einzigen Stelle; Folge-Tickets lesen und ändern ihn hier. */
// `shape`: ein früher gespeicherter Zustand (SCRUM-239, ohne Panel-Felder) wird als leer gelesen.
export const run = atom({ plugin: 'jira-run-mod', key: 'run' } as const, null, { shape: 'run-2' })
export const lastRun = atom({ plugin: 'jira-run-mod', key: 'lastRun' } as const, null, { shape: 'run-2' })

const PANE = 'run-status'
const PLAN_TOOL = 'mcp__jira-run-mod__run_plan'

type Args = Record<string, unknown>

async function openPanel($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Run' })
}

async function start($: EngineInterface, source: RunSource) {
  if ((await read($, run)) !== null) return
  const startedAt = await $.clock.now()
  // Ein neuer Run beginnt immer mit einer leeren Tabelle.
  await update($, run, () => emptyRun(source, startedAt))
  $.ui.status('Run läuft')
  // Wo keine Fläche für das Panel da ist, bleibt `isPlaced` false: dann gelten die Zeilen im Chat (Skill, Schritt 5).
  await openPanel($)
}

/** Ändert den laufenden Run; ohne Run geschieht nichts. */
async function change($: EngineInterface, fn: (r: RunState) => RunState) {
  await update($, run, r => (r === null ? r : fn(r)))
}

/** Ein Aufruf des Atlassian-Connectors, auch über `executeWrite`/`discover` (Name + Eingaben). */
function jiraCall(e: Args): { name: string; args: Args } | null {
  const tool = String(e.tool)
  if (!tool.startsWith('mcp__Atlassian_MCP__')) return null
  const short = tool.slice('mcp__Atlassian_MCP__'.length)
  if (/^execute(Read|Write|Destructive)$/.test(short)) {
    return { name: String(e.name ?? ''), args: (e.inputs as Args | undefined) ?? {} }
  }

  return { name: short, args: e }
}

/** Zeilen des Panels als Text (Rückfall für `/run-status`, wo kein Panel Platz hat). */
function textOf(r: RunState | FinishedRun | null, isFinished: boolean): string {
  if (r === null) return 'Es läuft kein Run.'
  const s = summarize(r)
  const head = [
    `${isFinished ? 'Letzter Run' : 'Run'} seit ${berlinClock(r.startedAt)} Uhr`,
    `Slots ${s.slots}/${s.maxSlots} · fertig ${s.done} · offen ${s.open}`,
    `Tokens: geplant ${formatTokens(s.planned)}, bisher ${formatTokens(s.used)}`,
  ]
  const rows = r.tickets.map(t => {
    const wait = waitingReason(t)

    return `${t.key} | ${t.model ?? '–'} | ${t.status}${t.agentRunning ? ' (Agent läuft)' : ''} | ${t.pr === null ? '–' : `#${t.pr}`} | ${t.ci ?? '–'}${wait === null ? '' : ` | WARTET AUF PO: ${wait}`}`
  })

  return [...head, ...(rows.length === 0 ? ['Noch keine Tickets.'] : rows)].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'run-status',
      description: 'Zeigt den Stand des Jira-Runs (Tickets, Status, PR, CI, Slots, Tokens) im Panel',
    })
    await $.tool.register({
      name: 'run_plan',
      description:
        'Meldet den Nachtplan an das Run-Panel: pro Ticket Schlüssel, Modell und Schätzung in Tokens. Einmal direkt nach dem Plan aufrufen; die weiteren Stände (Status, Sub-Agent, PR, CI) übernimmt das Panel selbst.',
      inputSchema: {
        type: 'object',
        properties: {
          tickets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', description: 'Jira-Schlüssel, z. B. SCRUM-171' },
                model: { type: 'string', description: 'Geplantes Modell, z. B. Sonnet oder Opus' },
                estimateTokens: { type: 'number', description: 'Schätzung in Tokens (S 50000, M 150000, L 400000)' },
              },
              required: ['key'],
            },
          },
        },
        required: ['tickets'],
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

  // /run-status öffnet das Panel; wo keins Platz hat, kommt der Stand als Text in den Chat.
  on('command.run', { command: 'run-status' }, async $ => {
    const placed = await openPanel($)
    if (placed.isPlaced) return { text: 'Run-Panel geöffnet.' }
    const current = await read($, run)
    const last = await read($, lastRun)

    return { text: current !== null ? textOf(current, false) : textOf(last, true) }
  })

  // Der Nachtplan als Werkzeug des Modells: Tickets, Modell, Schätzung.
  on('tool.run', { tool: PLAN_TOOL }, async ($, e) => {
    const given = (e as unknown as { tickets?: unknown }).tickets
    const plan: PlanEntry[] = (Array.isArray(given) ? given : []).flatMap((p: Args) => {
      const key = ticketKeys(String(p.key ?? ''))[0]
      if (key === undefined) return []
      const tokens = Number(p.estimateTokens)

      return [{ key, model: modelLabel(p.model as string | undefined), estimateTokens: Number.isFinite(tokens) ? tokens : null }]
    })
    if ((await read($, run)) === null) await start($, 'jira-run')
    await change($, r => applyPlan(r, plan))

    return { result: `Plan im Panel: ${plan.length} Tickets.` }
  })

  // Jeder Sub-Agent, der während eines Runs ein Ticket bearbeitet, trägt es ein.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if ((await read($, run)) !== null && started.deny === undefined) {
      const keys = ticketKeys(`${e.description} ${e.prompt}`)
      const model = modelLabel(started.model)
      // Das Panel darf den Start des Sub-Agenten nie stören.
      try {
        await change($, r => applySpawn(r, keys, started.agentId, model))
      } catch {
        // Zustand nicht erreichbar: der Agent läuft trotzdem.
      }
    }

    return started
  })

  // Der Sub-Agent hat seinen Bericht abgegeben: sein Slot ist frei.
  on('agent.report', async ($, e, next) => {
    await change($, r => applyAgentEnd(r, e.agentId))

    return next(e)
  })

  // Jira-Statuswechsel, Ticketkommentare, PRs und CI: der Stand wird aus den Aufrufen übernommen.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.result === undefined || ran.isError === true || (await read($, run)) === null) return ran
    const text = ran.text ?? ''
    const args = e as unknown as Args
    const jira = jiraCall(args)

    if (jira !== null && jira.name === 'transitionJiraIssue') {
      const key = ticketKeys(String(jira.args.issueIdOrKey ?? ''))[0]
      const status = statusOfTransition(text, jira.args)
      if (key !== undefined && status !== null) await change($, r => applyStatus(r, key, status))
    } else if (jira !== null && jira.name === 'addOrEditJiraIssueComment') {
      const key = ticketKeys(String(jira.args.issueIdOrKey ?? ''))[0]
      const note = waitNoteOf(String(jira.args.commentBody ?? jira.args.body ?? ''))
      if (key !== undefined && note !== null) await change($, r => applyNote(r, key, note))
    } else if (e.tool === 'mcp__github__create_pull_request') {
      const key = ticketKeys(`${String(args.title ?? '')} ${String(args.head ?? '')}`)[0]
      const pr = prNumberOf(text)
      if (key !== undefined && pr !== null) await change($, r => applyPr(r, key, pr, args.draft === true))
    } else if (e.tool === 'mcp__github__update_pull_request') {
      const pr = Number(args.pullNumber)
      if (typeof args.draft === 'boolean' && Number.isFinite(pr)) {
        const isDraft = args.draft
        await change($, r => applyDraft(r, pr, isDraft))
      }
    } else if (e.tool === 'mcp__github__pull_request_read' && args.method === 'get_check_runs') {
      const pr = Number(args.pullNumber)
      const ci = ciOf(text)
      if (ci !== null && Number.isFinite(pr)) await change($, r => applyCi(r, pr, ci))
    }

    return ran
  })

  // Verbrauch pro Runde; Ende: der Abschlussbericht der Hauptsitzung (nicht die Antwort eines Sub-Agenten).
  on('turn.complete', async ($, e, next) => {
    const tokens = tokensOf(e.usage)
    if (tokens > 0) await change($, r => addUsage(r, e.agentId, tokens))
    const current = await read($, run)
    if (current !== null && e.agentId === undefined && isFinalReport(e.answer)) {
      const endedAt = await $.clock.now()
      await update($, lastRun, () => ({ ...current, endedAt }))
      await update($, run, () => null)
      $.ui.status(undefined)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const current = await read($, run)
    const last = await read($, lastRun)
    const shown = current ?? last
    if (shown === null) return <Text dimColor>Es läuft kein Run. Er startet mit /jira-run oder der Nachtschicht.</Text>

    const s = summarize(shown)
    const isFinished = current === null
    const ended = isFinished && last !== null ? ` · Ende ${berlinClock(last.endedAt)} Uhr` : ''

    return (
      <Box flexDirection="column">
        <Text weight="bold">
          {isFinished ? 'Letzter Run' : 'Run läuft'} · Start {berlinClock(shown.startedAt)} Uhr{ended}
        </Text>
        <Text>
          Slots {s.slots}/{s.maxSlots} · fertig {s.done} · offen {s.open}
        </Text>
        <Text>
          Tokens: geplant {formatTokens(s.planned)} · bisher {formatTokens(s.used)}
        </Text>
        <Text> </Text>
        <Box flexDirection="row">
          <Box width={11}><Text dimColor>Ticket</Text></Box>
          <Box width={8}><Text dimColor>Modell</Text></Box>
          <Box flexGrow={1}><Text dimColor>Status</Text></Box>
          <Box width={6}><Text dimColor>PR</Text></Box>
          <Box width={6}><Text dimColor>CI</Text></Box>
        </Box>
        {shown.tickets.length === 0 && <Text dimColor>Noch keine Tickets.</Text>}
        {shown.tickets.map(t => {
          const wait = waitingReason(t)

          return (
            <Box flexDirection="column">
              <Box flexDirection="row">
                <Box width={11}><Text weight="bold">{t.key}</Text></Box>
                <Box width={8}><Text>{t.model ?? '–'}</Text></Box>
                <Box flexGrow={1}>
                  <Text>
                    {t.status}
                    {t.agentRunning ? ' · Agent läuft' : ''}
                  </Text>
                </Box>
                <Box width={6}><Text>{t.pr === null ? '–' : `#${t.pr}`}</Text></Box>
                <Box width={6}>
                  <Text color={t.ci === 'grün' ? 'text-success' : t.ci === 'rot' ? 'text-danger' : undefined}>
                    {t.ci ?? '–'}
                  </Text>
                </Box>
              </Box>
              {wait !== null && <Text color="text-warning">  Wartet auf PO: {wait}</Text>}
            </Box>
          )
        })}
      </Box>
    )
  })
}
