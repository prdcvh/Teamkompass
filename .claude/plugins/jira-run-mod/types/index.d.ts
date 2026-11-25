// Typvertrag des Run-Mods (SCRUM-239, erweitert in SCRUM-240 um das Live-Panel).
// Der gemeinsame Zustand liegt unter `$.state['jira-run-mod']`. Die Folge-Tickets
// (Hinweise und Statuszeile SCRUM-242, Token-Statistik SCRUM-243) lesen und
// schreiben nur hier.

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

/** Stand der Prüfungen (CI) eines PR; null = unbekannt. */
export type CiState = 'läuft' | 'grün' | 'rot'

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
  /** Id des Sub-Agenten, der das Ticket bearbeitet; null = keiner gestartet. */
  agentId: string | null
  /** true, solange der Sub-Agent läuft (belegt einen der 3 Slots). */
  agentRunning: boolean
  /** CI des PR; null = nicht bekannt oder kein PR. */
  ci: CiState | null
  /** true, wenn der PR noch ein Draft ist. */
  isDraft: boolean
  /** Warum das Ticket auf den PO wartet (Textauszug aus dem Ticketkommentar); null = kein Grund bekannt. */
  note: string | null
  /** Tokens, die der Sub-Agent dieses Tickets bisher verbraucht hat. */
  usedTokens: number
}

export type RunState = {
  source: RunSource
  /** Startzeit, Millisekunden seit 1970. */
  startedAt: number
  tickets: RunTicket[]
  /** Tokens der Hauptsitzung und von Sub-Agenten ohne Ticket; zusammen mit den Tickets der tatsächliche Verbrauch. */
  otherTokens: number
}

export type FinishedRun = RunState & { endedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'jira-run-mod': {
      /** Der laufende Run; null, solange keiner läuft. */
      run: Shaped<RunState | null>
      /** Der zuletzt beendete Run (für Panel und Statistik); null, wenn es noch keinen gab. */
      lastRun: Shaped<FinishedRun | null>
    }
  }
}
