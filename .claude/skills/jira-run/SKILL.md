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
   Modellwahl, höchstens 3 parallel im Worktree, Kontrolle, Kontingent, kein
   Merge während des Runs. Findet sich die Aufgabe unter der ID nicht, per
   `list_triggers` nach „TeamKompass Nachtschicht“ suchen. Diesen Prompt
   befolgst du, zusammen mit `CLAUDE.md`, mit den Abweichungen unten.
2. **Jira verbinden.** Lade die Jira-Tools des Atlassian-Connectors per
   ToolSearch (z. B. `searchJiraIssuesUsingJql`). Meldet ToolSearch, dass der
   Server noch verbindet, mehrmals nachfassen statt sofort aufzugeben. Ist
   Jira nach einigen Minuten immer noch nicht da: nichts bauen, dem PO hier
   Bescheid geben.
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
   warum du aufhörst, Plan gegenüber dem tatsächlichen Verlauf. Am Ende die
   Frage „Bist du bereit, diese PRs zu mergen?“ mit der Liste der PRs, die
   deine Kontrolle bestanden haben (PR-Nummer + Ticket). Keine
   Push-Nachricht.

Uhrzeiten nennst du dem PO immer in deutscher Zeit (Europe/Berlin), nicht in
UTC.

## Mergen nach dem Ja des PO

Sagt der PO ja (egal zu welcher Tageszeit): die genannten PRs hier mergen,
einen nach dem anderen. Vor jedem Merge den aktuellen `main` in den PR holen,
`npm run verify` laufen lassen und prüfen, dass CI grün ist; danach das Ticket
in Jira auf „Erledigt“ setzen. Draft-PRs, die auf eine PO-Entscheidung warten,
nicht mergen. Schlägt etwas fehl, nicht mergen, sondern dem PO sagen, was
fehlt.
