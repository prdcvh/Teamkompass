# Beobachtungen mit Verhaltensankern (SCRUM-268)

**Ankerversion anker-1** · Stand 24.11.2026 · Code: `angular/src/app/core/observations/` (`ANCHOR_VERSION`).

Ziel: Trainereinschätzungen zu psychologischen und sozialen Fähigkeiten werden als **strukturierte Beobachtungen**
gespeichert und gezeigt – mit Verhaltensbeschreibung, Zeitraum, Zahl der Gelegenheiten, Beleg und Quelle – und nicht
als feste Persönlichkeitsurteile. Bezug: Ausarbeitung „Psychologie, Kommunikation und Führung“; PCDEQ2 nur als
methodischer Bezug (beobachtbares Verhalten, mehrere Perspektiven). Es wurden **keine Items aus geschützten
Fragebögen** übernommen; Kriterien und Anker sind eigene Formulierungen.

## 1. Kriterien und Anker

Vier Kriterien, je Stufe 1–5 eine Verhaltensbeschreibung mit Beispiel (vollständiger Text im Code,
`BEHAVIOR_CRITERIA`):

| Kriterium | Worauf der Trainer achtet |
| --- | --- |
| Konzentration nach Fehlern (`afterMistake`) | Was tut der Spieler in den nächsten Aktionen nach eigenem Fehler, Ballverlust, Gegentor? |
| Kommunikation (`communication`) | Was sagt/zeigt er Mitspielern im Spiel und in Übungen? |
| Verantwortungsübernahme (`responsibility`) | Übernimmt er Aufgaben, für die er zuständig ist oder die sonst niemand übernimmt? |
| Lernverhalten (`learning`) | Wie geht er mit Korrekturen und neuen Aufgaben um? |

Stufe 1 = Verhalten kaum gezeigt … Stufe 5 = regelmäßig, auch unter Druck und über die eigene Rolle hinaus. Eine Stufe
beschreibt das **beobachtete Verhalten im Zeitraum**, keine Eigenschaft der Person. Die App erzeugt keine Typen,
Etiketten, Diagnosen oder medizinischen Schlüsse und keine Rangliste.

## 2. Datenmodell

`teams/{teamId}/players/{playerId}/behaviorObservations/{id}`, ein Dokument je Kriterium und Einschätzung:

| Feld | Inhalt |
| --- | --- |
| `playerId` | = Pfad |
| `framework` | Ankerversion, `anker-1` |
| `criterionId` | Kriterium (Tabelle oben) |
| `value` | Stufe 1–5 |
| `date` | Tag der Einschätzung (setzt die App: heute) |
| `periodFrom`, `periodTo` | Beobachtungszeitraum, höchstens 365 Tage, Ende nicht nach `date` |
| `opportunities` | Zahl konkreter Beobachtungsgelegenheiten, 1–50 |
| `eventId` | optional: Termin als Beleg (muss existieren, liegt im Zeitraum), sonst `null` |
| `evidence` | optional: kurzes konkretes Beispiel, max. 300 Zeichen |
| `source` | Quelle, heute nur `trainer` |
| `by`, `byUid` | Name und Konto der bewertenden Person (eigenes Konto, von den Regeln geprüft) |
| `createdAt` | Zeitpunkt des Speicherns |

Einträge werden nie geändert, nur angelegt oder gelöscht. Feldnamen wie bei den Raster-Beobachtungen aus SCRUM-266
(`competenceObservations`, PR #352), damit sich beide Modelle später zusammenführen lassen (z. B. als neue
Rasterversion). Die beiden Sammlungen sind bewusst getrennt, solange SCRUM-266 nicht auf `main` ist.

## 3. Auswertung je Kriterium

- Es zählt je Trainer (`byUid`) die **jüngste** Einschätzung, deren Zeitraum in den letzten 365 Tagen endet. Ältere
  bleiben im Verlauf sichtbar.
- **Kein Mittelwert über Trainer.** Angezeigt werden die Einschätzungen jedes Trainers nebeneinander, dazu die Stufe
  (ein Trainer) bzw. die Spanne „Stufe 3–4“.
- **Güte (Ampel)**, keine statistischen Konfidenzintervalle:
  - *Widersprüchliche Einschätzung*: mindestens zwei Trainer liegen ≥ 2 Stufen auseinander. Beide Urteile bleiben
    stehen, es gibt keine Spanne als „Ergebnis“, nur den Hinweis, gemeinsam zu besprechen und weiter zu beobachten.
  - *Begrenzte Daten – unsicher*: zusammen weniger als 6 Beobachtungsgelegenheiten.
  - *Ausreichend beobachtet*: mindestens 6 Gelegenheiten (Faustregel des Projekts, keine statistische Sicherheit);
    bei nur einem Trainer steht dabei „eine Perspektive“.
  - *Noch nicht beobachtet*: keine Einschätzung im Zeitraum.

## 4. Altdaten

- Einträge in dieser Sammlung ohne Ankerversion, Zeitraum oder Gelegenheiten (oder mit fremder Version) bleiben
  lesbar und erscheinen unter „Historisch / unkalibriert“ mit Grund; sie zählen nicht zur Güte.
- Die bisherigen **Eventnoten** (Kompetenzprofil, Eventhistorie) bleiben unverändert und tragen im Trainerprofil den
  Hinweis „historisch/unkalibriert, ohne Verhaltensanker und Beobachtungszahl“. Keine Migration, keine Umrechnung.

## 5. Rollen und Rechte

| Rolle | Beobachtungen |
| --- | --- |
| Trainer | lesen, anlegen (eigenes Konto), löschen |
| Spieler (minderjährig), Eltern | kein Zugriff |
| Medizin, Scout | kein Zugriff (auch nicht über die Scout-Sicht `scoutProfiles`) |
| Vereinsadmin | kein Zugriff (abweichend vom sonstigen Mitlesen, wie bei Trainerprüfungen) |
| andere Teams, abgelaufene Zugänge | kein Zugriff |

- Widerrufene Einwilligung: keine neuen Einträge; vorhandene bleiben, bis der Trainer sie löscht.
- Spieler löschen löscht auch die Beobachtungen.
- Nicht in Berichten, Exporten, Scout-Sicht, Spieleransicht oder Team-/Vereinsübersichten.
- Emulator-Tests: `tests/rules/behavior-observations.test.mjs`.

## 6. Bewusst nicht gebaut

- **Selbsteinschätzung** (altersgerecht, getrennt): bräuchte Schreibrechte für Spieler/Eltern in einem neuen Pfad und
  eine Entscheidung, ob und wie Trainer und Spieler die Einschätzung des anderen sehen. Folgeticket.
- **Peer-Feedback**: erst nach eigener Datenschutz-/Schutzkonzeptprüfung.
- Sichtbarkeit für Spieler/Eltern: entscheidet der PO.
