---
name: jira-run
description: Startet sofort einen manuellen Ticket-Run auf Zuruf des Product Owners, auch tagsüber – direkt in dieser Sitzung (dem Fenster, in dem der PO den Befehl gibt). Nutzen, wenn der PO /jira-run tippt oder sagt "starte einen Run". Optionale Zusatzvorgabe als Argument, z. B. "/jira-run nur SCRUM-42" oder "/jira-run höchstens 2 Tickets".
---

# /jira-run – manuellen Ticket-Run starten

Der Product Owner (PO) stößt damit selbst einen Run an. Das ist die
ausdrückliche Erlaubnis, auch tagsüber zu arbeiten (siehe „Working hours“ in
`CLAUDE.md`).

Zusatzvorgabe des PO (kann leer sein): `$ARGUMENTS`

**Der Run läuft immer in dieser Sitzung**, also in dem Fenster, in dem der PO
den Befehl gegeben hat (Entscheidung des PO vom 2026-10-22). Keine neue Sitzung
per `fire_trigger` starten: Frisch gestartete Sitzungen bekamen oft keine
Verbindung zu Jira, und der PO sieht hier direkt, was passiert.

## Ablauf

1. **Regeln laden.** Lade per ToolSearch
   `select:mcp__claude-code-remote__get_trigger` und lies mit `get_trigger`
   die geplante Aufgabe `trig_017FTV4k2KaLfoyAMJHQ686S` („TeamKompass
   Nachtschicht“). Ihr Prompt (`derived_state.prompt`) enthält das komplette
   Regelwerk für den Run: Nachtplan, ein neuer Sub-Agent pro Ticket,
   Modellwahl, höchstens 3 parallel im Worktree, Kontrolle, Kontingent, Merge
   nur für Tickets im Status „Genehmigt“. Findet sich die Aufgabe unter der ID nicht, per
   `list_triggers` nach „TeamKompass Nachtschicht“ suchen. Diesen Prompt
   befolgst du, zusammen mit `CLAUDE.md`, mit den Abweichungen unten.
2. **Jira verbinden.** Lade die Jira-Tools des Atlassian-Connectors per
   ToolSearch (z. B. `searchJiraIssuesUsingJql`). Meldet ToolSearch, dass der
   Server noch verbindet, mehrmals nachfassen statt sofort aufzugeben. Ist
   Jira nach einigen Minuten immer noch nicht da: nichts bauen, dem PO hier
   Bescheid geben.
2a. **Jeder Run beginnt damit, alles aus „Genehmigt“ zu mergen** (PO,
   2026-11-24). Suche in Jira ausdrücklich nach `status = Genehmigt` (der
   Status zählt als „fertig“, eine Suche nach offenen Tickets findet ihn
   nicht) und merge alle diese PRs sofort, siehe „Mergen“ unten. Das
   geschieht vor dem Plan und vor jeder Ticketarbeit, und auch später im Run,
   sobald ein Ticket in „Genehmigt“ auftaucht.
3. **Plan hier ins Fenster.** Den Nachtplan (Tickets, Schätzung, Modell,
   Reihenfolge, was parallel läuft, was nicht reinpasst oder auf den PO
   wartet) schreibst du direkt hier in den Chat. **Keine Push-Nachricht**:
   Push-Nachrichten sind nur für den automatisch gestarteten Nacht-Run da.
   Danach sofort loslegen, der PO bestätigt den Plan nicht.
4. **Arbeiten.** Sub-Agenten (Agent-Tool, `isolation: "worktree"`,
   `run_in_background: true`) wie im Regelwerk. Diese Sitzung steuert und
   kontrolliert nur.
5. **Updates hier im Fenster.** Bei jeder Ticket-Verschiebung in Jira eine
   kurze Zeile hier, z. B. „SCRUM-171 → In Überprüfung (PR #236)“. Kein
   `send_message`, keine Push-Nachricht.
6. **Abschlussbericht hier im Fenster**, wie im Regelwerk unter „Zum
   Schluss“: was in Überprüfung ist, was auf eine PO-Entscheidung wartet,
   warum du aufhörst, Plan gegenüber dem tatsächlichen Verlauf. Nenne, was
   wegen „Genehmigt“ gemergt wurde, und liste die PRs, die deine Kontrolle
   bestanden haben und in Jira noch auf „Genehmigt“ warten (PR-Nummer +
   Ticket). Keine Frage „Bist du bereit zu mergen?“ mehr. Fragen an den PO
   gehören als Kommentar ins Ticket, das Ticket geht in den Status „Frage“.
   Keine Push-Nachricht.

Uhrzeiten nennst du dem PO immer in deutscher Zeit (Europe/Berlin), nicht in
UTC.

## Mergen: sofort bei „Genehmigt“ (PO, 2026-11-23, ergänzt 2026-11-24)

Ein Ticket im Status „Genehmigt“ hat der PO freigegeben. Sein PR wird sofort
gemergt, egal zu welcher Tageszeit und ohne Rückfrage, einen nach dem anderen:
den aktuellen `main` in den PR holen, `npm run verify` laufen lassen und
prüfen, dass CI grün ist; dann mergen und das Ticket in Jira auf „Erledigt“
setzen. Eine Zeile hier im Fenster dazu („SCRUM-258 → Erledigt, PR #339
gemergt“).

Ein Draft ist kein Hinderungsgrund: „Genehmigt“ ist die Freigabe des PO, auch
für PRs, die wegen einer Regel-/Login-Änderung oder einer anderen
PO-Entscheidung Draft geblieben sind. Solche PRs auf „Ready for review“ stellen
und dann mergen.

Nicht mergen, sondern dem PO sagen, was fehlt: Konflikt, der sich nicht sauber
lösen lässt, rotes `npm run verify` oder rote CI, offene blockierende
Review-Kommentare, PR gehört nicht zu diesem Ticket.

Tickets, die nicht auf „Genehmigt“ stehen (z. B. „In Überprüfung“), werden nie
gemergt; der PO gibt sie in Jira frei.
