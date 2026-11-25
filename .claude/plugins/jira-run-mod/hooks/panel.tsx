import type { RunState } from '../types'
import { SLOTS, berlinTime, fmtTokens, summarize, waitingForPo } from './model'

type Els = { Box: any; Text: any }

/** Das Panel: oben die Zähler, darunter je Ticket eine Karte (schmal genug für Mobil). */
export function RunPanel({ Box, Text }: Els, state: RunState | (RunState & { endedAt: number }) | null, isOver: boolean) {
  if (state === null) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Kein Run aktiv. Das Panel füllt sich, sobald ein Run startet.</Text>
      </Box>
    )
  }
  const s = summarize(state)
  const ended = 'endedAt' in state ? state.endedAt : null

  return (
    <Box flexDirection="column">
      <Text bold>
        {isOver ? 'Letzter Run' : 'Run läuft'} · gestartet {berlinTime(state.startedAt)}
        {ended !== null ? ` · beendet ${berlinTime(ended)}` : ` · Stand ${berlinTime(state.updatedAt)}`}
      </Text>
      <Text>
        Slots {s.slotsBusy}/{SLOTS} · fertig {s.done} · offen {s.open}
      </Text>
      <Text>
        Tokens: geplant {fmtTokens(s.planned)} · bisher {fmtTokens(s.actual)}
      </Text>
      {state.tickets.length === 0 && <Text dimColor>Noch keine Tickets im Run.</Text>}
      {state.tickets.map(t => {
        const wait = waitingForPo(t)

        return (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>
              {t.key} · {t.model ?? '–'}
            </Text>
            <Text>
              {t.status} · PR {t.pr !== null ? `#${t.pr}${t.draft ? ' (Draft)' : ''}` : '–'} · CI {t.ci ?? '–'}
            </Text>
            {wait !== null && <Text color="yellow" bold>{`⚠ Wartet auf PO: ${wait}`}</Text>}
          </Box>
        )
      })}
    </Box>
  )
}
