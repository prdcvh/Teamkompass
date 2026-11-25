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

**Run-Mod (SCRUM-239).** Das Plugin `.claude/plugins/jira-run-mod/` wird über
`.claude/settings.json` in jeder Sitzung geladen. Es erkennt den Start eines
Runs (dieser Skill oder der Nachtschicht-Prompt) und sein Ende (der
Abschlussbericht der Hauptsitzung) und hält den Run-Zustand (Tickets, Status,
Modell, PR, Schätzung) an einer Stelle.

**Run-Status-Panel (SCRUM-240).** Das Panel neben dem Chat (Befehl
`/run-status`, öffnet sich beim Start von selbst) liest den Run-Zustand und
zeigt Ticketstand, belegte Slots, fertig/offen und Tokens (geplant gegenüber
bisher). Gepflegt wird es nicht von Hand, sondern aus Tool-Aufrufen:
Jira-`transitionJiraIssue` (Status), Agent-Start/-Ende (Slot, Modell, Tokens),
GitHub `create_pull_request` / `update_pull_request` (PR, Draft) und
`pull_request_read` mit `get_check_runs` (CI). Zwei Dinge musst du dafür tun:
- **Plan melden:** Direkt nach dem Plan (Schritt 3) einmal das Werkzeug
  `mcp__jira-run-mod__run_plan` aufrufen (per ToolSearch laden:
  `select:mcp__jira-run-mod__run_plan`) mit `tickets: [{ key, size: "S"|"M"|"L"
  oder estimateTokens, model, reason? }]`. Das ist die einzige Quelle für
  Schätzung und geplantes Modell; bei Planänderungen erneut aufrufen.
- **Grund für PO-Entscheidung:** Ein Draft-PR, der auf den PO wartet, bekommt
  in der PR-Beschreibung eine Zeile `PO-Entscheidung: <Grund>`; das Panel
  markiert das Ticket damit deutlich. Tickets im Status „Frage“ sind ebenfalls
  markiert.

Das Panel ersetzt die Zeilen im Chat nicht: Schritt 5 bleibt, denn wo keine
Fläche für ein Panel da ist (`/run-status` gibt dann den Stand als Text aus),
sind diese Zeilen der Rückfall.

**Hinweise und Statuszeile (SCRUM-242).** Derselbe Mod zeigt kurze Hinweise
(Toasts, deutsch) bei „SCRUM-171 fertig – PR #236“ (Sub-Agent meldet sich
zurück), „SCRUM-171 → In Überprüfung“ (Jira-Statuswechsel) und „SCRUM-171:
Nacharbeit nötig“ (Kontrolle nicht bestanden), dazu eine Statuszeile mit der
Phase: „Run: Plan“, „Run: 2/3 Agenten aktiv“, „Run: Kontrolle SCRUM-171“,
„Run: Merge SCRUM-171“, „Run: Abschlussbericht“; ohne Run ist sie leer. Der
Mod sendet nie eine Push-Nachricht. Agenten, Statuswechsel und Merge erkennt er
selbst (Merge am Aufruf `merge_pull_request`). Kontrolle und Abschlussbericht
lassen sich nicht sicher aus Tool-Aufrufen ablesen, deshalb meldest du sie
(Werkzeuge per ToolSearch laden: `select:mcp__jira-run-mod__run_check,mcp__jira-run-mod__run_phase`):
- **Kontrolle:** `mcp__jira-run-mod__run_check` mit `{ key }` zu Beginn der
  Kontrolle eines fertigen PRs, und mit `{ key, passed: true|false }` am Ende.
  `passed: false` zeigt den Hinweis „Nacharbeit nötig“.
- **Phase:** `mcp__jira-run-mod__run_phase` mit `{ phase: "report" }`, bevor du
  den Abschlussbericht schreibst (optional `{ phase: "plan" }` beim Planen).
Die frühere Phase „wartet auf Merge-Antwort“ gibt es nicht mehr: seit dem
23.11. gibt der PO in Jira mit „Genehmigt“ frei, am Ende steht keine Merge-Frage.

**Token-Statistik (SCRUM-243).** Der Mod hält je Ticket Größe (S/M/L), Modell,
geschätzte und tatsächliche Tokens (alle Sub-Agenten des Tickets, auch
Nacharbeit; die Kontrolle in der Hauptsitzung ist nicht je Ticket messbar und
steckt nicht drin) und Datum fest und speichert sie am Ende des Runs im
`$.store` des Mods (nur Zahlen, Modellname, Schlüssel, Datum). Achtung: Das ist
eine Datei im Claude-Konfigurationsordner *der Maschine*; in einem kurzlebigen
Cloud-Container ist sie nach dem Container weg (offene Frage an den PO, siehe
SCRUM-243). Du nutzt es so:
- **Nachtplan:** Die Antwort von `mcp__jira-run-mod__run_plan` enthält die
  Durchschnittswerte je Größe und Modell („M mit Sonnet: im Schnitt 180k aus 6
  Tickets (geschätzt war 150k)“). Mit `mcp__jira-run-mod__run_stats` (ohne
  Eingabe) holst du sie auch vor dem Plan. Schätze damit statt pauschal.
- **Abschlussbericht:** Die Antwort von `run_phase` mit `{ phase: "report" }`
  listet je Ticket „geschätzt … / tatsächlich …“. Diese Zeilen kommen in den
  Abschlussbericht.

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
