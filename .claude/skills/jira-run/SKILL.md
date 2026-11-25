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

**Run-Mod (SCRUM-239, Panel SCRUM-240).** Das Plugin `.claude/plugins/jira-run-mod/`
wird über `.claude/settings.json` in jeder Sitzung geladen. Es erkennt den Start
eines Runs (dieser Skill oder der Nachtschicht-Prompt) und sein Ende (der
Abschlussbericht der Hauptsitzung) und öffnet beim Start das Panel „Run“ neben
dem Chat (jederzeit auch mit `/run-status`). Das Panel zeigt pro Ticket Modell,
Jira-Status, PR und CI, darüber belegte Slots (x/3), fertig/offen und geplante
gegenüber bisher verbrauchten Tokens, alles in deutscher Zeit. Es pflegt sich
selbst: Statuswechsel (`transitionJiraIssue`), Sub-Agent-Start und -Ende, neue
PRs (`create_pull_request`), CI-Abfragen (`get_check_runs`) und Tokens je Runde
übernimmt es aus den Aufrufen. Tickets, die auf den PO warten (Status „Frage“
oder Draft-PR), sind gelb markiert; als Grund steht der Abschnitt „Was noch
fehlt / wo ich unsicher bin“ deines letzten Ticketkommentars.

Das Panel braucht genau einen Handgriff von dir: der Nachtplan ist Chattext, den
der Mod nicht zuverlässig lesen kann. Rufe deshalb nach dem Plan (Schritt 3)
einmal das Werkzeug `mcp__jira-run-mod__run_plan` auf, mit `tickets` als Liste
aus `key`, `model` (z. B. `Sonnet`) und `estimateTokens` (S 50000, M 150000,
L 400000). Das ersetzt den Plan im Chat nicht, es füttert nur das Panel mit den
Schätzungen.

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
2a. **Genehmigte Tickets zuerst mergen.** Suche in Jira ausdrücklich nach
   `status = Genehmigt` (der Status zählt als „fertig“, eine Suche nach
   offenen Tickets findet ihn nicht) und merge diese PRs sofort, siehe
   „Mergen“ unten. Das geschieht vor dem Plan und auch später im Run, sobald
   ein Ticket in „Genehmigt“ auftaucht.
3. **Plan hier ins Fenster.** Den Nachtplan (Tickets, Schätzung, Modell,
   Reihenfolge, was parallel läuft, was nicht reinpasst oder auf den PO
   wartet) schreibst du direkt hier in den Chat. **Keine Push-Nachricht**:
   Push-Nachrichten sind nur für den automatisch gestarteten Nacht-Run da.
   Danach den Plan mit `mcp__jira-run-mod__run_plan` ans Panel melden (siehe
   oben) und sofort loslegen, der PO bestätigt den Plan nicht.
4. **Arbeiten.** Sub-Agenten (Agent-Tool, `isolation: "worktree"`,
   `run_in_background: true`) wie im Regelwerk. Diese Sitzung steuert und
   kontrolliert nur.
5. **Updates hier im Fenster.** Bei jeder Ticket-Verschiebung in Jira eine
   kurze Zeile hier, z. B. „SCRUM-171 → In Überprüfung (PR #236)“. Kein
   `send_message`, keine Push-Nachricht. Diese Zeilen bleiben auch mit Panel
   bestehen: Wo keine Fläche für das Panel da ist (z. B. ein Fenster ohne
   Platz daneben), sind sie der Rückfall; `/run-status` gibt den Stand dort
   als Text aus.
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

## Mergen: sofort bei „Genehmigt“ (PO, 2026-11-23)

Ein Ticket im Status „Genehmigt“ hat der PO freigegeben. Sein PR wird sofort
gemergt, egal zu welcher Tageszeit und ohne Rückfrage, einen nach dem anderen:
den aktuellen `main` in den PR holen, `npm run verify` laufen lassen und
prüfen, dass CI grün ist; dann mergen und das Ticket in Jira auf „Erledigt“
setzen. Eine Zeile hier im Fenster dazu („SCRUM-258 → Erledigt, PR #339
gemergt“).

Nicht mergen, sondern dem PO sagen, was fehlt: Konflikt, der sich nicht sauber
lösen lässt, rotes `npm run verify` oder rote CI, PR noch Draft oder mit
offenen blockierenden Review-Kommentaren, PR gehört nicht zu diesem Ticket.

Tickets, die nicht auf „Genehmigt“ stehen (z. B. „In Überprüfung“), werden nie
gemergt; der PO gibt sie in Jira frei.
