import { expect, mock, test } from 'claude-code/testing'

// Hinweise (Toasts) und Statuszeile während des Runs (SCRUM-242).
const SESSION = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const FINAL = { durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const TRANSITION = 'mcp__Atlassian_MCP__transitionJiraIssue'
const CREATE_PR = 'mcp__github__create_pull_request'
const MERGE = 'mcp__github__merge_pull_request'

function engine(on: any, toasts: string[], statuses: (string | undefined)[]) {
  let nextAgent = 0
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'run-status' } }))
  on('tool.register', () => ({ value: { tool: 'x' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', (_: any, e: any) => {
    statuses.push(e.text)

    return { value: undefined }
  })
  on('ui.toast', (_: any, e: any) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('agent.list', () => ({ value: [] }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('agent.report', () => ({}))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `a${++nextAgent}` }))
  on('tool.call', (_: any, e: any) => ({
    result: e.tool === CREATE_PR ? '{"number":236,"html_url":"https://github.com/x/y/pull/236"}' : 'ok',
  }))
}

async function begin($: any) {
  await $.session.start(SESSION)
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
}

test('Hinweis: Sub-Agent fertig mit PR-Nummer, nur einmal', async ($, on) => {
  const toasts: string[] = []
  engine(on, toasts, [])
  await begin($)
  const { agentId } = await $.agent.spawn({ prompt: 'Bearbeite SCRUM-171', description: 'SCRUM-171 Test', model: 'sonnet' })
  await $.tool.call({ tool: CREATE_PR, title: 'SCRUM-171: Test', head: 'claude/scrum-171', base: 'main' })
  await $.turn.complete({ ...FINAL, agentId, answer: 'fertig' })
  await $.turn.complete({ ...FINAL, agentId, answer: 'nochmal' })
  expect(toasts.filter(t => t.includes('fertig'))).toEqual(['SCRUM-171 fertig – PR #236'])
})

test('Hinweis: Ticket in Jira verschoben', async ($, on) => {
  const toasts: string[] = []
  engine(on, toasts, [])
  await begin($)
  await $.tool.call({ tool: TRANSITION, issueIdOrKey: 'SCRUM-171', transitionId: '31' })
  expect(toasts).toEqual(['SCRUM-171 → In Überprüfung'])
})

test('Hinweis: Kontrolle nicht bestanden, bestanden bleibt still', async ($, on) => {
  const toasts: string[] = []
  const statuses: (string | undefined)[] = []
  engine(on, toasts, statuses)
  await begin($)
  await $.tool.call({ tool: 'mcp__jira-run-mod__run_check', key: 'SCRUM-171' })
  expect(statuses.at(-1)).toBe('Run: Kontrolle SCRUM-171')
  await $.tool.call({ tool: 'mcp__jira-run-mod__run_check', key: 'SCRUM-171', passed: false })
  expect(toasts).toEqual(['SCRUM-171: Nacharbeit nötig'])
  await $.tool.call({ tool: 'mcp__jira-run-mod__run_check', key: 'SCRUM-172' })
  await $.tool.call({ tool: 'mcp__jira-run-mod__run_check', key: 'SCRUM-172', passed: true })
  expect(toasts).toEqual(['SCRUM-171: Nacharbeit nötig'])
})

test('Statuszeile: Plan, Agenten, Merge, Abschlussbericht und leer nach dem Run', async ($, on) => {
  const statuses: (string | undefined)[] = []
  engine(on, [], statuses)
  await $.session.start(SESSION)
  expect(statuses).toEqual([])
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  expect(statuses.at(-1)).toBe('Run: Plan')

  const a = await $.agent.spawn({ prompt: 'Bearbeite SCRUM-1', description: 'SCRUM-1 A', model: 'sonnet' })
  await $.agent.spawn({ prompt: 'Bearbeite SCRUM-2', description: 'SCRUM-2 B', model: 'sonnet' })
  await $.tool.call({ tool: CREATE_PR, title: 'SCRUM-1: A', head: 'claude/scrum-1', base: 'main' })
  expect(statuses.at(-1)).toBe('Run: 2/3 Agenten aktiv')
  await $.turn.complete({ ...FINAL, agentId: a.agentId, answer: 'fertig' })
  expect(statuses.at(-1)).toBe('Run: 1/3 Agenten aktiv')

  await $.tool.call({ tool: MERGE, owner: 'o', repo: 'r', pullNumber: 236 })
  expect(statuses).toContain('Run: Merge SCRUM-1')
  expect(statuses.at(-1)).toBe('Run: 1/3 Agenten aktiv')

  await $.tool.call({ tool: 'mcp__jira-run-mod__run_phase', phase: 'report' })
  expect(statuses.at(-1)).toBe('Run: Abschlussbericht')

  await $.turn.complete({ ...FINAL, answer: '## Abschlussbericht\nfertig' })
  expect(statuses.at(-1)).toBeUndefined()
})
