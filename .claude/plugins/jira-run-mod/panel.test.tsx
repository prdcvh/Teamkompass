import { expect, mock, test } from 'claude-code/testing'

import { berlinTime, ciOfChecks, statusOfTransition } from './hooks/model'

// Das Run-Status-Panel (SCRUM-240): Zeilen, Slot-Zähler, leere Tabelle bei neuem Run.
const SESSION = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const PANE = {
  plugin: 'jira-run-mod',
  component: 'Pane',
  requestId: 'run-status',
  props: {
    title: 'Run-Status',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const
const FINAL = { durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const TRANSITION = 'mcp__Atlassian_MCP__transitionJiraIssue'
const CREATE_PR = 'mcp__github__create_pull_request'

/** Alles, was unter dem Mod der Motor tut. */
function engine(on: any, opts: { placed?: boolean; agents?: Record<string, unknown>[] } = {}) {
  let nextAgent = 0
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'run-status' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__jira-run-mod__run_plan' } }))
  on('ui.open', () => ({ value: { isPlaced: opts.placed ?? true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.list', () => ({ value: opts.agents ?? [] }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('agent.report', () => ({}))
  on('agent.spawn', (_: any, e: any) => ({ model: e.model ?? 'claude-sonnet-5-5', agentId: `a${++nextAgent}` }))
  on('tool.call', (_: any, e: any) => ({
    result: e.tool === 'mcp__github__create_pull_request' ? '{"number":236,"html_url":"https://github.com/x/y/pull/236"}' : 'ok',
  }))
}

const rows = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((n: any) => n.text as string)

test('Statuswechsel in Jira aktualisiert die Zeile des Tickets', async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  await $.tool.call({ tool: 'mcp__jira-run-mod__run_plan', tickets: [{ key: 'SCRUM-171', size: 'S', model: 'sonnet' }] })

  await $.tool.call({ tool: TRANSITION, issueIdOrKey: 'SCRUM-171', transitionId: '21' })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await rows(ui)).join('\n')).toMatch(/SCRUM-171 · Sonnet\nIn Bearbeitung · PR – · CI –/)
  await ui.unmount()

  await $.tool.call({ tool: TRANSITION, issueIdOrKey: 'SCRUM-171', transitionId: '31' })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const text = (await rows(ui)).join('\n')
  expect(text).toMatch(/In Überprüfung · PR – · CI –/)
  expect(text).toMatch(/fertig 1 · offen 0/)
  expect(text).toMatch(/geplant 50k/)
  await ui.unmount()
})

test('Slot-Zähler: belegt, solange der Sub-Agent arbeitet; PR und Draft-Grund werden markiert', async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  await $.agent.spawn({ prompt: 'Bearbeite SCRUM-1', description: 'SCRUM-1 Test', model: 'sonnet' })
  await $.agent.spawn({ prompt: 'Bearbeite SCRUM-2', description: 'SCRUM-2 Test', model: 'opus' })

  let ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect((await rows(ui)).join('\n')).toMatch(/Slots 2\/3 · fertig 0 · offen 2/)
  expect((await rows(ui)).join('\n')).toMatch(/SCRUM-2 · Opus/)
  await ui.unmount()

  await $.tool.call({
    tool: CREATE_PR,
    owner: 'o',
    repo: 'r',
    title: 'SCRUM-1: Test',
    head: 'claude/scrum-1',
    base: 'main',
    draft: true,
    body: 'Text\nPO-Entscheidung: neuer Hosting-Eintrag',
  })
  await $.turn.complete({ ...FINAL, agentId: 'a1', answer: 'fertig' })

  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const text = (await rows(ui)).join('\n')
  expect(text).toMatch(/Slots 1\/3 · fertig 0 · offen 2/)
  expect(text).toMatch(/PR #236 \(Draft\)/)
  expect(text).toMatch(/Wartet auf PO: neuer Hosting-Eintrag/)
  await ui.unmount()
})

test('ein neuer Run beginnt mit leerer Tabelle', async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  await $.tool.call({ tool: TRANSITION, issueIdOrKey: 'SCRUM-7', transitionId: '21' })
  await $.turn.complete({ ...FINAL, answer: '## Abschlussbericht\nfertig' })

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await rows(ui)).join('\n')).toMatch(/Letzter Run/)
  expect((await rows(ui)).join('\n')).toMatch(/SCRUM-7/)
  await ui.unmount()

  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const text = (await rows(ui)).join('\n')
  expect(text).toMatch(/Run läuft/)
  expect(text).toMatch(/Noch keine Tickets im Run/)
  expect(text).not.toMatch(/SCRUM-7/)
  expect(text).toMatch(/Slots 0\/3 · fertig 0 · offen 0/)
  await ui.unmount()
})

test('/run-status öffnet das Panel, ohne Fläche kommen die Zeilen als Text', async ($, on) => {
  engine(on, { placed: false })
  await $.session.start(SESSION)
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  await $.tool.call({ tool: TRANSITION, issueIdOrKey: 'SCRUM-9', transitionId: '3' })

  const out = await $.command.run({ command: 'run-status', args: '', origin: { kind: 'composer' }, presentation: 'text' } as any)
  expect(JSON.stringify(out)).toMatch(/SCRUM-9 \| – \| Frage/)
  expect(JSON.stringify(out)).toMatch(/WARTET AUF PO/)
})

test('Uhrzeiten sind deutsche Zeit, mit Sommer- und Winterzeit', () => {
  expect(berlinTime(Date.UTC(2026, 10, 25, 21, 30))).toBe('22:30') // Winter: UTC+1
  expect(berlinTime(Date.UTC(2026, 6, 1, 20, 30))).toBe('22:30') // Sommer: UTC+2
  expect(berlinTime(Date.UTC(2026, 2, 29, 0, 59))).toBe('01:59') // kurz vor der Umstellung
  expect(berlinTime(Date.UTC(2026, 2, 29, 1, 0))).toBe('03:00')
})

test('Statuswechsel und CI werden aus den Aufrufen gelesen', () => {
  expect(statusOfTransition({ transitionId: '31' })).toBe('In Überprüfung')
  expect(statusOfTransition({ transitionName: 'Genehmigt' })).toBe('Genehmigt')
  expect(statusOfTransition({ transitionId: '999' })).toBeNull()
  expect(ciOfChecks('{"check_runs":[{"status":"completed","conclusion":"success"}]}')).toBe('grün')
  expect(ciOfChecks('{"check_runs":[{"status":"in_progress","conclusion":null}]}')).toBe('läuft')
  expect(ciOfChecks('{"check_runs":[{"status":"completed","conclusion":"failure"}]}')).toBe('rot')
})
