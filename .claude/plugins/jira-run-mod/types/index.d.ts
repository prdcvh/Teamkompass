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
  /** Id des Sub-Agenten, der das Ticket bearbeitet; null = (noch) keiner. */
  agentId: string | null
  /** Der Sub-Agent hat sich zurückgemeldet. */
  agentDone: boolean
  /** Der PR ist ein Draft. */
  draft: boolean
  /** Wofür der PO gebraucht wird (Draft-PR oder Frage); null = nichts offen. */
  reason: string | null
  /** Stand der PR-Prüfungen (CI); null = unbekannt. */
  ci: 'läuft' | 'grün' | 'rot' | null
  /** Ergebnis der Kontrolle durch die Hauptsitzung (`run_check`): true bestanden, false Nacharbeit; null/fehlt = (noch) keine. */
  checkPassed?: boolean | null
  /** Bisher verbrauchte Tokens des Sub-Agenten (Eingabe + Ausgabe). */
  tokensActual: number
}

/**
 * Aktuelle Phase der Hauptsitzung für die Statuszeile (SCRUM-242); null = keine besondere
 * Phase (die Zeile ergibt sich dann aus Plan bzw. den aktiven Agenten).
 * `check`: Kontrolle eines Tickets (Werkzeug `run_check`), `merge`: Merge eines genehmigten PRs
 * (aus `merge_pull_request`), `plan`/`report`: Nachtplan bzw. Abschlussbericht (Werkzeug `run_phase`).
 */
export type RunPhase =
  | { kind: 'plan' }
  | { kind: 'report' }
  | { kind: 'check'; key: string }
  | { kind: 'merge'; key: string }

export type RunState = {
  source: RunSource
  /** Startzeit, Millisekunden seit 1970. */
  startedAt: number
  /** Letzte Änderung am Zustand, Millisekunden seit 1970 (Anzeige "Stand HH:MM"). */
  updatedAt: number
  tickets: RunTicket[]
  /** Phase für die Statuszeile; fehlt oder null = keine besondere. */
  phase?: RunPhase | null
}

export type FinishedRun = RunState & { endedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'jira-run-mod': {
      /** Der laufende Run; null, solange keiner läuft. */
      run: RunState | null
      /** Der zuletzt beendete Run (für Panel und Statistik); null, wenn es noch keinen gab. */
      lastRun: FinishedRun | null
      /** Der PO hat die Freigabe-Leiste über dem Eingabefeld mit „Später“ ausgeblendet (SCRUM-241). */
      approvalHidden: boolean
    }
  }
}
