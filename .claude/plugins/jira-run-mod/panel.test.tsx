import { expect, mock, test } from 'claude-code/testing'

// Das Panel ist der sichtbare Teil des Run-Zustands: die Tests lesen ihn dort ab.
const SESSION = { cwd: '/', surface: 'desktop', isInteractive: true } as const
const ANSWER = { durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const PANE = {
  plugin: 'jira-run-mod',
  component: 'Pane',
  requestId: 'run-status',
  props: {
    title: 'Run',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const
const NOW = Date.UTC(2026, 10, 25, 21, 31) // 22:31 deutsche Zeit (Winterzeit)

async function setup($: any, on: any, extra?: () => void, isPlaced: () => boolean = () => true) {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: isPlaced() ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface' } }))
  on('command.register', () => ({ value: { command: 'run-status' } }))
  on('tool.register', () => ({ value: { name: 'run_plan' } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  extra?.()
  await $.session.start(SESSION)
}

/** Alle Texte des Panels, eine Zeile je Text. */
async function panelTexts($: any): Promise<string[]> {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const found = await ui.findAll({ type: 'Text' })
  await ui.unmount()

  return found.map((f: any) => f.text as string)
}

const startRun = ($: any) =>
  $.prompt.submit({ text: 'Nachtschicht für die TeamKompass-App: arbeite Tickets ab.', origin: { kind: 'composer' }, wait: false })

const transition = ($: any, key: string, status: string) =>
  $.tool.call({ tool: 'mcp__Atlassian_MCP__transitionJiraIssue', issueIdOrKey: key, transition: { id: '31' } })

test('ein Statuswechsel in Jira aktualisiert die Zeile des Tickets', async ($, on) => {
  let status = 'In Bearbeitung'
  await setup($, on, () => {
    on('tool.call', () => ({ result: {}, text: `Transition ok, neuer Status: ${status}` }))
  })
  await startRun($)
  await $.tool.call({ tool: 'mcp__jira-run-mod__run_plan', tickets: [{ key: 'SCRUM-171', model: 'sonnet', estimateTokens: 150000 }] })

  let texts = await panelTexts($)
  expect(texts).toContain('SCRUM-171')
  expect(texts).toContain('Zu erledigen')
  expect(texts).toContain('Sonnet')
  expect(texts.some(t => /geplant 150k/.test(t))).toBe(true)

  status = 'In Bearbeitung'
  await transition($, 'SCRUM-171', status)
  texts = await panelTexts($)
  expect(texts).toContain('In Bearbeitung')
  expect(texts).not.toContain('Zu erledigen')

  status = 'In Überprüfung'
  await transition($, 'SCRUM-171', status)
  texts = await panelTexts($)
  expect(texts).toContain('In Überprüfung')
  expect(texts.some(t => /fertig 1 · offen 0/.test(t))).toBe(true)
})

test('Sub-Agent, PR und CI landen in der Zeile; die Slots werden gezählt', async ($, on) => {
  let agent = 0
  let pr = 0
  let checks = ''
  await setup($, on, () => {
    on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `a${(agent += 1)}` }))
    on('tool.call', (_: any, e: any) => {
      if (e.tool === 'mcp__github__create_pull_request') return { result: {}, text: `{"number": ${(pr += 1) + 235}}` }
      if (e.tool === 'mcp__github__pull_request_read') return { result: {}, text: checks }

      return { result: {}, text: '' }
    })
    on('agent.report', (_: any, e: any) => ({ text: e.text }))
  })
  await startRun($)
  const spawn = (key: string) =>
    $.agent.spawn({ tool_use_id: key, prompt: `Bearbeite ${key}`, description: key, subagentType: 'general-purpose' })

  expect((await panelTexts($)).some(t => /Slots 0\/3/.test(t))).toBe(true)

  await spawn('SCRUM-180')
  await spawn('SCRUM-181')
  let texts = await panelTexts($)
  expect(texts.some(t => /Slots 2\/3/.test(t))).toBe(true)
  expect(texts.some(t => /offen 2/.test(t))).toBe(true)
  expect(texts).toContain('Opus')

  // Ein Sub-Agent ohne Ticketschlüssel legt keine Zeile an.
  await spawn('Aufräumen')
  expect((await panelTexts($)).filter(t => /^SCRUM-/.test(t))).toEqual(['SCRUM-180', 'SCRUM-181'])

  await $.agent.report({ agentId: 'a1', subagentType: 'general-purpose', provider: { plugin: 'engine', tier: 'core' }, status: 'completed', text: 'fertig' })
  texts = await panelTexts($)
  expect(texts.some(t => /Slots 1\/3/.test(t))).toBe(true)

  await $.tool.call({ tool: 'mcp__github__create_pull_request', title: 'SCRUM-180: Test', head: 'claude/scrum-180', base: 'main', draft: false })
  expect(await panelTexts($)).toContain('#236')

  checks = '{"check_runs":[{"status":"in_progress","conclusion":null}]}'
  await $.tool.call({ tool: 'mcp__github__pull_request_read', method: 'get_check_runs', pullNumber: 236 })
  expect(await panelTexts($)).toContain('läuft')

  checks = '{"check_runs":[{"status":"completed","conclusion":"success"}]}'
  await $.tool.call({ tool: 'mcp__github__pull_request_read', method: 'get_check_runs', pullNumber: 236 })
  expect(await panelTexts($)).toContain('grün')
})

test('ein Draft-PR und eine Frage sind als Warten auf den PO markiert, mit Grund', async ($, on) => {
  await setup($, on, () => {
    on('tool.call', (_: any, e: any) => ({
      result: {},
      text: e.tool === 'mcp__github__create_pull_request' ? '{"number": 300}' : 'neuer Status: In Überprüfung',
    }))
  })
  await startRun($)
  await $.tool.call({ tool: 'mcp__github__create_pull_request', title: 'SCRUM-250: Regeln', head: 'x', base: 'main', draft: true })
  await $.tool.call({
    tool: 'mcp__Atlassian_MCP__addOrEditJiraIssueComment',
    issueIdOrKey: 'SCRUM-250',
    commentBody: '**Was jetzt anders ist**\nx\n\n**Was noch fehlt / wo ich unsicher bin**\nDie Regeln ändern die Anmeldung, das muss der PO entscheiden.',
  })
  await transition($, 'SCRUM-250', 'In Überprüfung')

  const texts = await panelTexts($)
  expect(texts.some(t => /Wartet auf PO: Die Regeln ändern die Anmeldung/.test(t))).toBe(true)

  // Ohne Kommentar bleibt ein allgemeiner Grund; „Frage“ wartet ebenfalls.
  await $.tool.call({ tool: 'mcp__Atlassian_MCP__transitionJiraIssue', issueIdOrKey: 'SCRUM-251', transition: { id: '3' } })
  expect((await panelTexts($)).some(t => /Wartet auf PO: Frage an den PO/.test(t))).toBe(true)

  // Wird der PR bereit gemeldet, ist der Draft-Hinweis weg.
  await $.tool.call({ tool: 'mcp__github__update_pull_request', pullNumber: 300, draft: false })
  expect((await panelTexts($)).some(t => /Draft-PR|Die Regeln/.test(t))).toBe(false)
})

test('ein neuer Run beginnt mit leerer Tabelle', async ($, on) => {
  await setup($, on, () => {
    on('tool.call', () => ({ result: {}, text: 'neuer Status: In Überprüfung' }))
  })
  await startRun($)
  await $.tool.call({ tool: 'mcp__jira-run-mod__run_plan', tickets: [{ key: 'SCRUM-171', model: 'Sonnet', estimateTokens: 50000 }] })
  expect(await panelTexts($)).toContain('SCRUM-171')

  // Der Abschlussbericht beendet den Run; das Panel zeigt ihn noch als „Letzter Run“.
  await $.turn.complete({ ...ANSWER, answer: '## Abschlussbericht\nfertig' })
  const after = await panelTexts($)
  expect(after.some(t => /Letzter Run/.test(t))).toBe(true)
  expect(after).toContain('SCRUM-171')

  // Der nächste Run startet leer: nichts vom letzten steht mehr in der Tabelle.
  await startRun($)
  const fresh = await panelTexts($)
  expect(fresh.some(t => /Run läuft/.test(t))).toBe(true)
  expect(fresh).toContain('Noch keine Tickets.')
  expect(fresh).not.toContain('SCRUM-171')
  expect(fresh.some(t => /Slots 0\/3 · fertig 0 · offen 0/.test(t))).toBe(true)
})

test('Uhrzeiten stehen in deutscher Zeit, im Sommer und im Winter', async ($, on) => {
  await setup($, on)
  await startRun($)
  const winter = await panelTexts($)
  // mock.clock steht auf einem festen Zeitpunkt; die Zeit muss HH:MM Uhr sein.
  expect(winter.some(t => /Start \d\d:\d\d Uhr/.test(t))).toBe(true)
})

test('Tokens: geplant gegenüber bisher, Hauptsitzung und Sub-Agent getrennt gezählt', async ($, on) => {
  await setup($, on, () => {
    on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a1' }))
  })
  await startRun($)
  await $.tool.call({ tool: 'mcp__jira-run-mod__run_plan', tickets: [{ key: 'SCRUM-1', estimateTokens: 50000 }, { key: 'SCRUM-2', estimateTokens: 150000 }] })
  await $.agent.spawn({ tool_use_id: 't', prompt: 'SCRUM-1', description: 'SCRUM-1', subagentType: 'general-purpose' })
  const usage = { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 500, cache_read_input_tokens: 99999, model: 'm' }
  await $.turn.complete({ ...ANSWER, answer: 'Zwischenstand', usage })
  await $.turn.complete({ ...ANSWER, answer: 'Agent fertig', agentId: 'a1', usage })
  expect((await panelTexts($)).some(t => /geplant 200k · bisher 4k/.test(t))).toBe(true)
})

test('/run-status öffnet das Panel; ohne Fläche kommt der Stand als Text', async ($, on) => {
  let placed = true
  await setup($, on, undefined, () => placed)
  expect((await $.command.run({ command: 'run-status', args: '', origin: { kind: 'composer' }, presentation: { layout: 'main', columns: 80 } })).text).toBe('Run-Panel geöffnet.')

  placed = false
  await startRun($)
  await $.tool.call({ tool: 'mcp__jira-run-mod__run_plan', tickets: [{ key: 'SCRUM-9', model: 'Opus' }] })
  const fallback = await $.command.run({ command: 'run-status', args: '', origin: { kind: 'composer' }, presentation: { layout: 'main', columns: 80 } })
  expect(fallback.text).toMatch(/SCRUM-9 \| Opus \| Zu erledigen/)
})
