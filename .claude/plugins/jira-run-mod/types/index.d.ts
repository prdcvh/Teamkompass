// Typvertrag des Run-Mods (SCRUM-239). Der gemeinsame Zustand liegt unter
// `$.state['jira-run-mod']`. Die Folge-Tickets (Panel SCRUM-240, Hinweise und
// Statuszeile SCRUM-242, Token-Statistik SCRUM-243) lesen und schreiben nur hier.

/** Womit der Run gestartet wurde. */
export type RunSource = 'jira-run' | 'nachtschicht'

/** Jira-Status eines Tickets im Run (Namen wie im Workflow, siehe CLAUDE.md). */
export type TicketStatus =
  | 'Zu erledigen'
  | 'In Bearbeitung'
  | 'Frage'
  | 'In Überprüfung'
  | 'Genehmigt'
  | 'Erledigt'

export type RunTicket = {
  /** Jira-Schlüssel, z. B. SCRUM-239. */
  key: string
  status: TicketStatus
  /** Modell des Sub-Agenten, z. B. "Sonnet" oder "Opus"; null = noch nicht bekannt. */
  model: string | null
  /** Pull-Request-Nummer; null = noch kein PR. */
  pr: number | null
  /** Schätzung aus dem Nachtplan in Tokens (S ≈ 50k, M ≈ 150k, L ≈ 400k); null = keine. */
  estimateTokens: number | null
}

export type RunState = {
  source: RunSource
  /** Startzeit, Millisekunden seit 1970. */
  startedAt: number
  tickets: RunTicket[]
}

export type FinishedRun = RunState & { endedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'jira-run-mod': {
      /** Der laufende Run; null, solange keiner läuft. */
      run: RunState | null
      /** Der zuletzt beendete Run (für Panel und Statistik); null, wenn es noch keinen gab. */
      lastRun: FinishedRun | null
    }
  }
}
