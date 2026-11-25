import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RunSource, RunTicket } from '../types'
import { isFinalReport, runSourceOfPrompt, ticketKeys } from './detect'

/** Der Run-Zustand an einer einzigen Stelle; Folge-Tickets lesen und ändern ihn hier. */
export const run = atom({ plugin: 'jira-run-mod', key: 'run' } as const, null)
export const lastRun = atom({ plugin: 'jira-run-mod', key: 'lastRun' } as const, null)

const newTicket = (key: string): RunTicket => ({
  key,
  status: 'In Bearbeitung',
  model: null,
  pr: null,
  estimateTokens: null,
})

async function start($: EngineInterface, source: RunSource) {
  if ((await read($, run)) !== null) return
  const startedAt = await $.clock.now()
  await update($, run, () => ({ source, startedAt, tickets: [] }))
  $.ui.status('Run läuft')
}

export const register: Register = on => {
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

  // Jeder Sub-Agent, der während eines Runs ein Ticket bearbeitet, trägt es ein.
  on('agent.spawn', async ($, e, next) => {
    if ((await read($, run)) !== null) {
      const keys = ticketKeys(`${e.description ?? ''} ${e.prompt}`)
      await update($, run, r =>
        r === null
          ? r
          : {
              ...r,
              tickets: [
                ...r.tickets,
                ...keys.filter(k => !r.tickets.some(t => t.key === k)).map(newTicket),
              ],
            },
      )
    }

    return next(e)
  })

  // Ende: der Abschlussbericht der Hauptsitzung (nicht die Antwort eines Sub-Agenten).
  on('turn.complete', async ($, e, next) => {
    const current = await read($, run)
    if (current !== null && e.agentId === undefined && isFinalReport(e.answer)) {
      const endedAt = await $.clock.now()
      await update($, lastRun, () => ({ ...current, endedAt }))
      await update($, run, () => null)
      $.ui.status(undefined)
    }

    return next(e)
  })
}
