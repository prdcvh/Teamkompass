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

1. Lade per ToolSearch `select:mcp__claude-code-remote__fire_trigger`.
2. Rufe `fire_trigger` auf mit
   - `trigger_id`: `trig_017FTV4k2KaLfoyAMJHQ686S` (geplante Aufgabe
     „TeamKompass Nachtschicht“, startet eine frische Sitzung mit Jira-Zugriff
     und allen Regeln: Plan an den PO, neuer Sub-Agent pro Ticket, bis zu 3
     parallel, Kontrolle, kein Merge),
   - `text`:
     `Manuell vom Product Owner gestartet (nicht der nächtliche Zeitplan) – Arbeiten ist jetzt ausdrücklich erlaubt, auch tagsüber. Zusatzvorgabe des PO, hat Vorrang vor allem anderen: <Zusatzvorgabe oder "keine">`
3. Antworte dem PO in einem kurzen Satz auf Deutsch: Run gestartet, mit
   welcher Vorgabe, und dass der Plan gleich als Push-Nachricht kommt.

Schlägt `fire_trigger` fehl (Aufgabe nicht gefunden, keine Berechtigung):
nichts selbst bauen, sondern dem PO den Fehler nennen. Findet sich die Aufgabe
unter einer anderen ID, per `list_triggers` die Aufgabe „TeamKompass
Nachtschicht“ suchen und diese nehmen.
