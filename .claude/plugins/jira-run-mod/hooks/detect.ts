import type { RunSource } from '../types'

/** Start durch `/jira-run` oder durch den Prompt der geplanten Nachtschicht. */
export function runSourceOfPrompt(text: string): RunSource | null {
  if (/^\s*\/jira-run\b/.test(text)) return 'jira-run'
  if (/^\s*Nachtschicht für die TeamKompass-App/i.test(text)) return 'nachtschicht'
  if (/^\s*TeamKompass Nachtschicht/i.test(text)) return 'nachtschicht'

  return null
}

/** Ende des Runs: der Abschlussbericht der Hauptsitzung, erkennbar an einer Zeile oder Überschrift, die damit beginnt. */
export function isFinalReport(answer: string): boolean {
  return /^\s*(#+\s*)?[*_]*Abschlussbericht/im.test(answer)
}

/** Ticket-Schlüssel (SCRUM-123), die in einem Text vorkommen, ohne Duplikate. */
export function ticketKeys(text: string): string[] {
  return [...new Set(text.match(/\bSCRUM-\d+\b/g) ?? [])]
}

/** Das Ticket, an dem ein Sub-Agent arbeitet: der erste Schlüssel der Beschreibung, sonst des Prompts. */
export function primaryTicketKey(description: string | undefined, prompt: string): string | null {
  return ticketKeys(description ?? "")[0] ?? ticketKeys(prompt)[0] ?? null
}
