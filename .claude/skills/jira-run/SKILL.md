---
name: jira-run
description: Startet sofort einen manuellen Ticket-Run (die geplante Aufgabe "TeamKompass Nachtschicht") auf Zuruf des Product Owners, auch tagsüber. Nutzen, wenn der PO /jira-run tippt oder sagt "starte einen Run". Optionale Zusatzvorgabe als Argument, z. B. "/jira-run nur SCRUM-42" oder "/jira-run höchstens 2 Tickets".
---

# /jira-run – manuellen Ticket-Run starten

Der Product Owner (PO) stößt damit selbst einen Run an. Das ist die
ausdrückliche Erlaubnis, auch tagsüber zu arbeiten (siehe „Working hours“ in
`CLAUDE.md`).

Zusatzvorgabe des PO (kann leer sein): `$ARGUMENTS`

## Ablauf

1. Lade per ToolSearch `select:mcp__claude-code-remote__fire_trigger,mcp__claude-code-remote__get_session`.
2. Ermittle die ID dieser Sitzung: `get_session` ohne `session_id` aufrufen,
   `id` merken (beginnt mit `session_`). An diese Sitzung schickt der Run
   seine Updates, damit der PO sie in dem Fenster sieht, in dem er den Run
   gestartet hat.
3. Rufe `fire_trigger` auf mit
   - `trigger_id`: `trig_017FTV4k2KaLfoyAMJHQ686S` (geplante Aufgabe
     „TeamKompass Nachtschicht“, startet eine frische Sitzung mit Jira-Zugriff
     und allen Regeln: Plan an den PO, neuer Sub-Agent pro Ticket, bis zu 3
     parallel, Kontrolle, kein Merge),
   - `text` (Platzhalter ersetzen; ist keine Zusatzvorgabe angegeben, genau
     den Satz „Es gibt keine Zusatzvorgabe.“ einsetzen, damit der Run nicht
     glaubt, der Text sei abgeschnitten):
     ```
     Manuell vom Product Owner gestartet (nicht der nächtliche Zeitplan) – Arbeiten ist jetzt ausdrücklich erlaubt, auch tagsüber.

     Zusatzvorgabe des PO, hat Vorrang vor allem anderen: <Zusatzvorgabe oder "Es gibt keine Zusatzvorgabe.">

     Regelmäßige Updates (Wunsch des PO): Schicke kurze Updates per send_message (Tool mcp__claude-code-remote__send_message, per ToolSearch laden) an die Sitzung <Sitzungs-ID aus Schritt 2>, aus der der PO den Run gestartet hat:
     - jedes Mal, wenn du (oder ein Sub-Agent) ein Ticket in Jira verschiebst: eine Zeile, z. B. „SCRUM-171 → In Überprüfung (PR #236)“,
     - einmal, wenn du nach deiner Einschätzung fertig bist: den Abschlussbericht in kurzer Form (was in Überprüfung ist, was auf eine PO-Entscheidung wartet, warum du aufhörst, und am Ende die Frage an den PO, ob er bereit ist zu mergen, mit der Liste der PRs, die deine Kontrolle bestanden haben (PR-Nummer + Ticket).
     Die Push-Nachricht mit dem Nachtplan bleibt zusätzlich. Schlägt send_message fehl, einfach normal weiterarbeiten und es im Abschlussbericht erwähnen.
     ```
4. Antworte dem PO in einem kurzen Satz auf Deutsch: Run gestartet, mit
   welcher Vorgabe, dass der Plan gleich als Push-Nachricht kommt und dass die
   Updates hier in diesem Fenster ankommen.

## Updates des Runs weitergeben

Kommt später eine Nachricht der Run-Sitzung hier an (als Turn, den eine
andere Sitzung geschickt hat), gib sie dem PO knapp auf Deutsch weiter:
Ticket-Verschiebungen in einer Zeile, den Abschlussbericht als kurze
Zusammenfassung mit der Merge-Frage. Nicht selbst darauf reagieren oder etwas
bauen – es sind nur Infos für den PO.

Sagt der PO darauf ja (egal zu welcher Tageszeit): die genannten PRs hier
mergen, einen nach dem anderen. Vor jedem Merge den aktuellen `main` in den PR
holen, `npm run verify` laufen lassen und prüfen, dass CI grün ist; danach das
Ticket in Jira auf „Erledigt“ setzen. Draft-PRs, die auf eine PO-Entscheidung
warten, nicht mergen. Schlägt etwas fehl, nicht mergen, sondern dem PO sagen,
was fehlt.

Schlägt `fire_trigger` fehl (Aufgabe nicht gefunden, keine Berechtigung):
nichts selbst bauen, sondern dem PO den Fehler nennen. Findet sich die Aufgabe
unter einer anderen ID, per `list_triggers` die Aufgabe „TeamKompass
Nachtschicht“ suchen und diese nehmen.
