import { expect, mock, test } from 'claude-code/testing'

// Die Freigabe-Leiste (SCRUM-241, Variante B): zeigt am Ende des Runs nur an, was auf den PO wartet,
// öffnet Tickets in Jira und merged nie.
const SESSION = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const FINAL = { durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const BAR = {
  plugin: 'jira-run-mod',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const
const TRANSITION = 'mcp__Atlassian_MCP__transitionJiraIssue'
const CREATE_PR = 'mcp__github__create_pull_request'
const MERGE_PR = 'mcp__github__merge_pull_request'

function engine(on: any) {
  const calls: string[] = []
  let pr = 235
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'run-status' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__jira-run-mod__run_plan' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [] }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('tool.call', (_: any, e: any) => {
    calls.push(e.tool)

    return { result: e.tool === CREATE_PR ? `{"number":${++pr}}` : 'ok' }
  })

  return calls
}

const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((n: any) => n.text as string).join('\n')

async function ticket($: any, key: string, opts: { draft?: boolean; passed?: boolean; status?: string } = {}) {
  await $.tool.call({ tool: TRANSITION, issueIdOrKey: key, transitionId: '21' })
  await $.tool.call({
    tool: CREATE_PR,
    owner: 'o',
    repo: 'r',
    title: `${key}: Test`,
    head: `claude/${key.toLowerCase()}`,
    base: 'main',
    draft: opts.draft === true,
    body: opts.draft === true ? 'PO-Entscheidung: neues Hosting-Ziel' : 'Text',
  })
  if (opts.passed !== undefined) await $.tool.call({ tool: 'mcp__jira-run-mod__run_check', key, passed: opts.passed })
  await $.tool.call({ tool: TRANSITION, issueIdOrKey: key, transitionId: opts.status ?? '31' })
}

async function finishedRun($: any) {
  await $.session.start(SESSION)
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  await ticket($, 'SCRUM-171', { passed: true })
  await ticket($, 'SCRUM-175', { passed: true })
  await ticket($, 'SCRUM-180', { passed: false })
  await ticket($, 'SCRUM-190', { draft: true })
  await ticket($, 'SCRUM-200')
  await $.turn.complete({ ...FINAL, answer: '## Abschlussbericht\nfertig' })
}

test('keine Leiste, solange der Run läuft', async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  await ticket($, 'SCRUM-171', { passed: true })
  const ui = await $.ui.mount(BAR)
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('nach dem Abschlussbericht: nur bestandene PRs, Drafts getrennt markiert, Knopf öffnet Jira', async ($, on) => {
  const calls = engine(on)
  await finishedRun($)
  const ui = await $.ui.mount(BAR)
  const text = await texts(ui)
  expect(text).toMatch(/2 PRs warten auf deine Freigabe in Jira/)
  expect(text).toMatch(/#236 \(SCRUM-171\)/)
  expect(text).toMatch(/#237 \(SCRUM-175\)/)
  // Kontrolle nicht bestanden oder nicht gemeldet: nicht in der Liste
  expect(text).not.toMatch(/SCRUM-180/)
  expect(text).not.toMatch(/SCRUM-200/)
  // Draft: eigener Abschnitt mit Grund, nicht unter den freigabebereiten
  expect(text).toMatch(/Wartet auf deine Entscheidung/)
  expect(text).toMatch(/\(SCRUM-190, Draft\): neues Hosting-Ziel/)
  expect(text).toMatch(/„Genehmigt“, merged der nächste Run/)
  expect(text).toMatch(/U15, U17 und das Hauptteam/)

  const hrefs = (await ui.findAll({ type: 'Link' })).map((n: any) => n.props.href)
  expect(hrefs).toEqual([
    'https://pascalrdcvh.atlassian.net/browse/SCRUM-171',
    'https://pascalrdcvh.atlassian.net/browse/SCRUM-175',
    'https://pascalrdcvh.atlassian.net/browse/SCRUM-190',
  ])
  // Die Leiste hat nur „Später“ und merged nie.
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.map((b: any) => b.props.label)).toEqual(['Später'])
  expect(calls.filter(c => c === MERGE_PR)).toEqual([])
  await ui.unmount()
})

test('Später blendet die Leiste aus, ohne etwas zu mergen', async ($, on) => {
  const calls = engine(on)
  await finishedRun($)
  let ui = await $.ui.mount(BAR)
  await ui.press({ key: 'later' })
  await ui.unmount()
  ui = await $.ui.mount(BAR)
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  expect(calls.filter(c => c === MERGE_PR)).toEqual([])
  await ui.unmount()
})

test('ein neuer Run blendet die Leiste aus', async ($, on) => {
  engine(on)
  await finishedRun($)
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  const ui = await $.ui.mount(BAR)
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('ein gemergter PR verschwindet aus der Leiste', async ($, on) => {
  engine(on)
  await finishedRun($)
  await $.tool.call({ tool: MERGE_PR, owner: 'o', repo: 'r', pullNumber: 236 })
  const ui = await $.ui.mount(BAR)
  const text = await texts(ui)
  expect(text).toMatch(/1 PR wartet auf deine Freigabe/)
  expect(text).not.toMatch(/SCRUM-171/)
  expect(text).toMatch(/SCRUM-175/)
  await ui.unmount()
})

test('ohne wartende Tickets keine Leiste', async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  await $.prompt.submit({ text: '/jira-run', origin: { kind: 'composer' }, wait: false })
  await ticket($, 'SCRUM-5', { passed: true, status: '41' })
  await $.turn.complete({ ...FINAL, answer: '## Abschlussbericht\nfertig' })
  const ui = await $.ui.mount(BAR)
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})
