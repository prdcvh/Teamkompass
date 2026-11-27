import { expect, mock, test } from 'claude-code/testing'

import { addEntries, averageLines, averages } from './hooks/stats'

// Token-Statistik über Sitzungen (SCRUM-243).
const SESSION = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const FINAL = { durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const PLAN = 'mcp__jira-run-mod__run_plan'
const STATS = 'mcp__jira-run-mod__run_stats'
const PHASE = 'mcp__jira-run-mod__run_phase'

const entry = (key: string, size: 'S' | 'M' | 'L', model: string, estimateTokens: number, actualTokens: number) => ({
  key,
  size,
  model,
  estimateTokens,
  actualTokens,
  date: '2026-11-20',
})

function engine(on: any, store: Record<string, unknown>, usage: number[] = []) {
  let nextAgent = 0
  mock.clock(on, { now: Date.UTC(2026, 10, 25, 22, 0) })
  // Eigener Speicher statt mock.store, damit der Test lesen kann, was geschrieben wurde.
  on('store.get', (_: any, e: any) => ({ value: store[e.key] }))
  on('store.set', (_: any, e: any) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))

    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'run-status' } }))
  on('tool.register', () => ({ value: { tool: 'x' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.list', () => ({
    value: [{ id: 'a1', usage: usage.map(n => ({ input_tokens: n, output_tokens: 0, cache_creation_input_tokens: 0 })) }],
  }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('agent.report', () => ({}))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `a${++nextAgent}` }))
  on('tool.call', () => ({ result: 'ok' }))
}

test('der Durchschnitt wird je Größe und Modell richtig berechnet', async () => {
  const entries = [
    entry('SCRUM-1', 'M', 'Sonnet', 150_000, 160_000),
    entry('SCRUM-2', 'M', 'Sonnet', 150_000, 200_000),
    entry('SCRUM-3', 'S', 'Sonnet', 50_000, 40_000),
    entry('SCRUM-4', 'M', 'Opus', 150_000, 300_000),
  ]
  const m = averages(entries).find(a => a.size === 'M' && a.model === 'Sonnet')
  expect(m).toEqual({ size: 'M', model: 'Sonnet', count: 2, avgActual: 180_000, avgEstimate: 150_000 })
  expect(averageLines(entries)).toContain('M mit Sonnet: im Schnitt 180k aus 2 Tickets (geschätzt war 150k)')
  // Ein Ticket steht nur einmal drin; der neuere Wert gewinnt.
  expect(addEntries(entries, [entry('SCRUM-1', 'M', 'Sonnet', 150_000, 100_000)]).filter(e => e.key === 'SCRUM-1')).toEqual([
    entry('SCRUM-1', 'M', 'Sonnet', 150_000, 100_000),
  ])
})

test('ein Wert wird am Ende des Runs gespeichert, ohne Zugangsdaten oder Personenbezug', async ($, on) => {
  const store: Record<string, unknown> = {}
  engine(on, store, [100_000, 80_000])
  await $.session.start(SESSION)
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  await $.tool.call({ tool: PLAN, tickets: [{ key: 'SCRUM-9', size: 'M', model: 'Sonnet', reason: 'Name: geheim' }] })
  const { agentId } = await $.agent.spawn({ prompt: 'Bearbeite SCRUM-9', description: 'SCRUM-9 Test', model: 'sonnet' })
  await $.turn.complete({ ...FINAL, agentId, answer: 'fertig' })
  const report = await $.tool.call({ tool: PHASE, phase: 'report' })
  expect(report.result).toContain('SCRUM-9 (M, Sonnet): geschätzt 150k, tatsächlich 180k')
  await $.turn.complete({ ...FINAL, answer: '## Abschlussbericht\nfertig' })

  const saved = store['token-stats'] as Record<string, unknown>[]
  expect(saved).toEqual([entry('SCRUM-9', 'M', 'Sonnet', 150_000, 180_000)].map(e => ({ ...e, date: '2026-11-25' })))
  expect(Object.keys(saved[0]!).sort()).toEqual(['actualTokens', 'date', 'estimateTokens', 'key', 'model', 'size'])
})

test('eine neue Sitzung findet die alten Werte und liefert sie mit dem Plan', async ($, on) => {
  engine(on, {
    'token-stats': [
      entry('SCRUM-1', 'M', 'Sonnet', 150_000, 160_000),
      entry('SCRUM-2', 'M', 'Sonnet', 150_000, 200_000),
      { kaputt: true },
    ],
  })
  await $.session.start(SESSION)
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  const plan = await $.tool.call({ tool: PLAN, tickets: [{ key: 'SCRUM-10', size: 'M', model: 'Sonnet' }] })
  expect(plan.result).toContain('M mit Sonnet: im Schnitt 180k aus 2 Tickets')
  const stats = await $.tool.call({ tool: STATS })
  expect(stats.result).toContain('M mit Sonnet: im Schnitt 180k aus 2 Tickets')
})
