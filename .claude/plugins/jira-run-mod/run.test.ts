import { expect, mock, test } from 'claude-code/testing'

// Die Statuszeile zeigt, ob ein Run läuft; der Zustand selbst liegt im Mod
// (`jira-run-mod.run`) und wird hier über die Statuszeile beobachtet.
const SESSION = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const ANSWER = { durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

test('ein Run per /jira-run wird erkannt und mit dem Abschlussbericht beendet', async ($, on) => {
  const statuses: (string | undefined)[] = []
  mock.clock(on)
  on('ui.status', (_, e) => {
    statuses.push(e.text)

    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start(SESSION)

  await $.prompt.submit({ text: '/jira-run nur SCRUM-42', origin: { kind: 'composer' }, wait: false })
  expect(statuses).toEqual(['Run läuft'])

  // Ein Zwischenstand ist noch nicht das Ende.
  await $.turn.complete({ ...ANSWER, answer: 'SCRUM-42 ist in Überprüfung' })
  expect(statuses).toEqual(['Run läuft'])

  // Eine beiläufige Erwähnung im Plan beendet den Run nicht.
  await $.turn.complete({ ...ANSWER, answer: 'Plan: erst SCRUM-42, dann den Abschlussbericht schreiben.' })
  expect(statuses).toEqual(['Run läuft'])

  // Der Abschlussbericht der Hauptsitzung beendet den Run.
  await $.turn.complete({ ...ANSWER, answer: 'Fertig.\n\n## Abschlussbericht\nalles erledigt' })
  expect(statuses).toEqual(['Run läuft', undefined])
})

test('die Nachtschicht wird am geplanten Prompt erkannt', async ($, on) => {
  const statuses: (string | undefined)[] = []
  mock.clock(on)
  on('ui.status', (_, e) => {
    statuses.push(e.text)

    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start(SESSION)

  await $.prompt.submit({ text: 'Nachtschicht für die TeamKompass-App: arbeite Tickets aus dem aktiven Jira-Sprint ab.', origin: { kind: 'composer' }, wait: false })
  expect(statuses).toEqual(['Run läuft'])
})

test('ein gewöhnlicher Prompt startet keinen Run', async ($, on) => {
  const statuses: (string | undefined)[] = []
  mock.clock(on)
  on('ui.status', (_, e) => {
    statuses.push(e.text)

    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start(SESSION)

  await $.prompt.submit({ text: 'Wie spät ist es?', origin: { kind: 'composer' }, wait: false })
  expect(statuses).toEqual([])
})
