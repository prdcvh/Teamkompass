import type { RunSource } from '../types'

/** Start durch `/jira-run` oder durch den Prompt der geplanten Nachtschicht. */
export function runSourceOfPrompt(text: string): RunSource | null {
  if (/^\s*\/jira-run\b/.test(text)) return 'jira-run'
  if (/TeamKompass Nachtschicht/i.test(text)) return 'nachtschicht'

  return null
}

/** Ende des Runs: der Abschlussbericht der Hauptsitzung. */
export function isFinalReport(answer: string): boolean {
  return /abschlussbericht/i.test(answer)
}

/** Ticket-Schlüssel (SCRUM-123), die in einem Text vorkommen, ohne Duplikate. */
export function ticketKeys(text: string): string[] {
  return [...new Set(text.match(/\bSCRUM-\d+\b/g) ?? [])]
}
