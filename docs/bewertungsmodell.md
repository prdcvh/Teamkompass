# Bewertungsmodell: Eventnoten und Entwicklungsraster (SCRUM-266)

**Rasterversion raster-1** · Stand 23.11.2026 · gilt für `angular/src/app/core/competence/`
(`COMPETENCE_FRAMEWORK_VERSION`). Folgeticket SCRUM-268 (Beobachtungsanker, mehrere Trainer) baut auf diesem
Datenmodell auf.

Kurzfassung:

| Thema | Entscheidung |
| --- | --- |
| Bisherige Eventnoten (Einsatz, Fehlerquote, Spielwirkung, Lernfähigkeit, 30/30/25/15) | bleiben **unverändert**, heißen in der App „Eventnoten (bisheriges Modell)“. Keine Migration, keine Umdeutung in neue Bereiche. |
| Neues Modell | **Entwicklungsraster** mit fünf Bereichen und je drei beobachtbaren Kriterien, versioniert im Code. |
| Skala | vier Häufigkeitsstufen („zeigt es noch selten“ … „zeigt es sicher, auch unter Druck“), keine Schulnoten. |
| Fehlende Daten | „nicht erhoben“ – nie 0, nie aus Eventnoten oder anderen Bereichen aufgefüllt. |
| Gewichte | nur für einen **optionalen** Gesamtindex; Vorgaben sind Hypothesen, Trainer passen sie innerhalb fester Grenzen an; jede Änderung ist eine neue, unveränderliche Version. |
| Gesamtindex | standardmäßig **aus**; nur bei ausreichender Abdeckung; zeigt immer Gewichte, Version und Datengrundlage. |
| Rangliste | **keine**. Kein Sortieren oder Vergleichen von Spielern nach Raster oder Index. |
| Sichtbarkeit | nur Trainer des Teams (Spieler, Eltern, Medizin, Scouts, Vereinsadmin: nichts). Erweiterung nur nach PO-Entscheidung. |

## 1. Warum ein zweites Modell

Die vier Eventnoten sind eine **Momentaufnahme je Termin**: Der Trainer gibt nach einem Training oder Spiel vier
Teilnoten, daraus wird mit festen Gewichten (30/30/25/15, `core/ratings/rating.ts`) eine Gesamtnote. Das ist praktisch
für die Rückmeldung zu einem Termin, aber kein validierter Talentindex:

- Die Felder mischen verschiedene Dinge (Einsatz = Verhalten, Fehlerquote = Ausführung, Spielwirkung = Ergebnis im
  Spiel, Lernfähigkeit = Entwicklung). Physis, psychologische Fähigkeiten und Sozialverhalten fehlen ganz.
- Die Gewichte sind eine Setzung der Alt-App, keine wissenschaftliche Vorgabe.
- Eine Gesamtnote verdeckt, *worin* sich ein Spieler entwickelt.

Die Talentforschung empfiehlt **mehrdimensionale Profile** statt einer Zahl, und für psychologische und soziale
Merkmale **beobachtbares Verhalten** statt Persönlichkeitsurteilen (u. a. Williams & Reilly 2000; Unnithan et al.
2012; Gledhill et al. 2017; Musculus & Lobinger 2018; zu Reifeeffekten Cumming et al. 2017). Die konkreten Kriterien
und Gewichte unten sind **fachliche Setzungen dieses Projekts**, keine aus diesen Quellen übernommenen,
validierten Werte.

## 2. Zwei getrennte Modelle

| | Eventnoten (bisheriges Modell) | Entwicklungsraster (neu) |
| --- | --- | --- |
| Kennung | `eventnoten-1` | `raster-1` |
| Wann | je Training/Spiel, beim Bewerten des Events | wann der Trainer etwas beobachtet, **freiwillig**, kein Pflichtschritt je Event |
| Was | 4 Teilnoten (Schulnoten 1–6 oder Stufen, SCRUM-188) | einzelne Kriterien, 4 Häufigkeitsstufen |
| Ergebnis | Gesamtnote je Event, Schnitte im Profil | Bereichsprofil über die Zeit, optional ein Index |
| Speicherort | `teams/{t}/events/{e}/ratings/{p}` (unverändert) | `teams/{t}/players/{p}/competenceObservations/{id}` |
| Sichtbar für | wie bisher (Trainer; Spieler/Eltern nach Freigabe SCRUM-115) | nur Trainer |

Es gibt **keine Umrechnung** zwischen beiden Modellen. „Einsatz“ wird nicht zu „Physis“, „Lernfähigkeit“ nicht zu
„Psychologische Fähigkeiten“. Alte Eventnoten bleiben Feld für Feld so lesbar und so berechnet wie heute. Im
Spielerprofil heißt die bisherige Karte „Eventnoten im Schnitt“ (vorher „Kompetenzprofil“), damit sie nicht mit dem
Raster verwechselt wird; Inhalt und Zahlen bleiben gleich.

## 3. Bereiche und Kriterien (raster-1)

Jedes Kriterium hat einen **Verhaltensanker**: was der Trainer sehen oder hören kann. Bewertet wird, wie oft der
Spieler das gezeigte Verhalten zeigt – nicht, was für ein „Typ“ er ist.

### Technik (`technique`)
- `technique.firstTouch` **Ballannahme und -mitnahme** – nimmt den Ball so an, dass die nächste Aktion sofort möglich
  ist (Ball in Bewegungsrichtung, nicht unter dem Körper).
- `technique.passing` **Passspiel** – der Pass kommt auf den richtigen Fuß oder in den Lauf, mit passendem Tempo.
- `technique.dribbling` **Ballführung und 1 gegen 1** – führt den Ball eng, wechselt unter Gegnerdruck die Richtung.

### Taktik und Entscheidung (`tactics`)
- `tactics.scanning` **Umschauen vor dem Ballkontakt** – schaut sich vor der Annahme um (Schulterblick).
- `tactics.decision` **Entscheidung mit Ball** – wählt Pass, Dribbling oder Abschluss passend zur Situation
  (z. B. sieht den freien Mitspieler).
- `tactics.offBall` **Verhalten ohne Ball** – bietet sich an bzw. steht beim Verteidigen richtig (Abstände, Absichern).

### Physis (`physical`)
- `physical.speed` **Antritt und Tempo** – startet schnell in freie Räume und auf freie Bälle.
- `physical.coordination` **Koordination und Körperkontrolle** – bremst, dreht und landet kontrolliert, bleibt im
  Zweikampf stabil.
- `physical.endurance` **Intensität über die Dauer** – hält die Laufbereitschaft bis zum Ende von Übung oder Spiel.

Physis im Raster ist **beobachtete Bewegung**, keine Messung. Feldtests und Messwerte (SCRUM-263) bleiben eigene Daten
und fließen nicht ein. Hinweis in der App: Unterschiede in der körperlichen Reife (Reife-Kompass) verzerren gerade
diesen Bereich.

### Psychologische Entwicklungsfähigkeiten (`psychological`)
- `psychological.afterMistake` **Reaktion nach Fehlern** – ist nach einem Fehler oder Gegentor bei der nächsten
  Aktion wieder beteiligt (statt abzuwinken oder zu diskutieren).
- `psychological.focus` **Konzentration bei Aufgaben** – setzt eine Anweisung um, ohne dass sie wiederholt werden
  muss, und bleibt bei der Aufgabe.
- `psychological.feedback` **Umgang mit Rückmeldung** – probiert eine Korrektur in der nächsten Wiederholung aus
  oder fragt nach.

### Team- und Sozialverhalten (`social`)
- `social.communication` **Kommunikation im Spiel** – ruft an, gibt Kommandos („Hintermann“, „Zeit“), spricht sich ab.
- `social.support` **Unterstützung von Mitspielern** – muntert auf, hilft beim Auf- und Abbau, bezieht neue oder
  schwächere Mitspieler ein.
- `social.fairPlay` **Regeln und Fairplay** – hält Absprachen und Regeln ein (Pünktlichkeit, fair zu Gegner und
  Schiedsrichter).

**Keine automatischen Persönlichkeitslabels.** Die App erzeugt aus diesen Kriterien keine Typen, Etiketten oder
Wörter wie „mental stark“, „Führungsspieler“, „schwierig“. Sie zeigt nur das Kriterium, die Stufe, die Anzahl der
Beobachtungen und das Datum.

## 4. Skala

| Wert | Stufe | Verhaltensbeschreibung |
| --- | --- | --- |
| 1 | zeigt es noch selten | nur vereinzelt oder mit Hilfe |
| 2 | zeigt es manchmal | in einfachen Situationen, nicht verlässlich |
| 3 | zeigt es meistens | regelmäßig, auch bei leichtem Druck |
| 4 | zeigt es sicher | verlässlich, auch unter Druck und im Spiel |

Größer ist besser (anders als bei Schulnoten). Angezeigt werden die Wörter; Zahlen nur im Index mit Erklärung.
Eine Stufe beschreibt den **Stand zum Beobachtungstag**, kein festes Merkmal.

## 5. Beobachtung (Datenmodell)

Eine Beobachtung = **ein Kriterium, ein Spieler, ein Tag, eine bewertende Person**. Dokument
`teams/{teamId}/players/{playerId}/competenceObservations/{id}`:

| Feld | Inhalt |
| --- | --- |
| `playerId` | = Pfad (für spätere Abfragen, wie bei Förderplänen) |
| `framework` | Rasterversion, z. B. `raster-1` |
| `criterionId` | z. B. `tactics.scanning` |
| `value` | 1–4 (Skala oben) |
| `date` | Beobachtungstag `JJJJ-MM-TT` (nicht in der Zukunft) |
| `occasion` | Anlass: `training`, `match`, `test`, `other` |
| `eventId` | optional: der Termin, an dem beobachtet wurde, sonst `null` |
| `position` | optional: Position, auf der beobachtet wurde, sonst `null` |
| `source` | Quelle; heute nur `trainer` |
| `note` | optional, kurze Notiz (max. 300 Zeichen) |
| `by`, `byUid` | Name und Konto der bewertenden Person |
| `createdAt` | Zeitpunkt des Speicherns |

- Beobachtungen werden **nie geändert**, nur angelegt oder gelöscht (Fehleintrag löschen und neu anlegen). So bleibt
  der Verlauf nachvollziehbar.
- **SCRUM-268** kann darauf aufsetzen: mehrere Trainer = mehrere Dokumente mit verschiedenem `byUid` am selben Tag und
  Kriterium; weitere Quellen (z. B. Selbsteinschätzung) = neuer Wert für `source`; genauere Anker = neue Rasterversion.
  Diese Version baut **keine** Logik für Uneinigkeit; das Profil mittelt einfach alle Beobachtungen.
- Ein Kriterium oder eine Rasterversion, die der Katalog nicht kennt, wird nicht verworfen, sondern nur nicht ins
  aktuelle Profil gerechnet.

## 6. Profil statt Momentaufnahme

- **Kriterium:** Mittel der **letzten drei** Beobachtungen der letzten **365 Tage**.
- **Bereich:** Mittel der beobachteten Kriterien dieses Bereichs. Dazu die **Abdeckung** (beobachtete Kriterien / alle
  Kriterien des Bereichs), die Zahl der Beobachtungen und der letzte Beobachtungstag.
- **Nicht erhoben:** Bereich ohne Beobachtung im Zeitraum. Er bekommt keinen Wert, auch nicht 0, und zählt in keinem
  Mittel mit. Bereiche, die das Team abgeschaltet hat, heißen „in diesem Team nicht erhoben“.
- **Momentaufnahme:** Stammen alle Beobachtungen von einem einzigen Tag, sagt die App das ausdrücklich („Bisher nur
  eine Momentaufnahme“) und zeigt keinen Index.

## 7. Team-Konfiguration und Gewichte

Je Team eine Folge **unveränderlicher Versionen** `teams/{teamId}/competenceConfigs/v{n}`:

| Feld | Inhalt |
| --- | --- |
| `version` | 1, 2, 3 … (Dokument-ID `v{version}`) |
| `framework` | Rasterversion |
| `domains` | erhobene Bereiche (mindestens einer) |
| `weightProfile` | gewähltes Gewichtsprofil oder `null` |
| `weights` | Gewicht je erhobenem Bereich in Prozent, Summe 100 (leer ohne Profil) |
| `indexEnabled` | Gesamtindex anzeigen ja/nein |
| `createdAt`, `by`, `byUid` | wann und von wem gespeichert |

Ohne gespeicherte Version gilt **Version 0**: alle fünf Bereiche, kein Gewichtsprofil, kein Index. Jede Änderung in
den Einstellungen legt eine neue Version an; ältere werden nie überschrieben oder gelöscht. Damit ist jederzeit
rekonstruierbar, mit welchen Gewichten ein Index an einem Tag gerechnet wurde. Die Einstellungen zeigen die Liste aller
Versionen.

**Gewichtsprofile (Hypothesen, nicht wissenschaftlich validiert):**

| Profil | Technik | Taktik | Physis | Psych. | Sozial |
| --- | --- | --- | --- | --- | --- |
| `balanced` Ausgewogen | 20 | 20 | 20 | 20 | 20 |
| `foundation` Hypothese Grundlagenbereich (bis U13) | 30 | 20 | 10 | 20 | 20 |
| `buildup` Hypothese Aufbaubereich (U14–U19) | 25 | 25 | 15 | 20 | 15 |

Trainer dürfen jedes Gewicht um höchstens **±10 Prozentpunkte** gegenüber dem Profil verändern (nie unter 0). Die
Gewichte der erhobenen Bereiche müssen zusammen 100 ergeben. Ist ein Bereich abgeschaltet, schlägt die App die übrigen
Gewichte anteilig hochgerechnet vor. Positionsprofile sind in raster-1 bewusst nicht enthalten; sie wären ein weiteres
Profil derselben Form.

## 8. Optionaler Gesamtindex

Nur wenn das Team ihn eingeschaltet **und** ein Gewichtsprofil gewählt hat, und nur bei **ausreichender Abdeckung**:

1. Jeder Bereich mit Gewicht > 0 hat mindestens **2 von 3** Kriterien beobachtet.
2. Die Beobachtungen stammen von mindestens **2 verschiedenen Tagen**.

Sonst zeigt die App „Kein Gesamtindex“ mit dem Grund (z. B. „Physis: erst 1 von 3 Kriterien beobachtet“). Der Index
ist das gewichtete Mittel der Bereichswerte (1–4) und steht nie allein: daneben stehen immer Gewichte, Version der
Konfiguration, Rasterversion und Datengrundlage (Zahl der Beobachtungen, Zeitraum). Er wird nie gespeichert,
nie in Listen gezeigt und nie zum Sortieren benutzt.

**Keine Reihung Minderjähriger nach „Talent“:** Es gibt keine Kaderliste, Tabelle oder Funktion, die Spieler nach
Raster oder Index ordnet oder vergleicht. Raster und Index erscheinen nur im Profil des einzelnen Spielers.

## 9. Rollen, Sichtbarkeit, Datenschutz

- **Lesen und Schreiben:** nur Trainer des Teams (Firestore-Regeln, Emulator-Tests `tests/rules/competence.test.mjs`).
  Spieler, Eltern, Medizin, Scouts, Vereinsadmin, andere Teams: kein Zugriff.
- **Anlegen nur mit dem eigenen Konto** (`byUid`), nur bekannte Felder und Werte; **ändern nie**; Beobachtungen
  löschen dürfen Trainer, Konfigurationsversionen niemand.
- **Widerrufene Einwilligung** (SCRUM-245): keine neuen Beobachtungen. Vorhandene bleiben, bis der Trainer sie löscht.
- **Spieler löschen** löscht auch alle Beobachtungen.
- Ob Spieler oder Eltern ihr Raster später sehen sollen, entscheidet der PO (offene Frage, siehe Ticket).

## 10. Was mit den Altnoten passiert

Nichts. Keine Migration, keine Umbenennung von Feldern, keine neue Berechnung. Die Karte heißt im Profil
„Eventnoten im Schnitt“ und trägt den Zusatz „bisheriges Modell“. Berichte (PDF, Saisonbericht) bleiben unverändert.

## 11. Versionierung

- Jede inhaltliche Änderung an Bereichen, Kriterien, Ankern, Skala oder Gewichtsprofilen ergibt eine neue
  Rasterversion (`raster-2` …). Alte Beobachtungen behalten ihre Version und werden nicht umgedeutet.
- `COMPETENCE_FRAMEWORK_VERSION` im Code und die Versionsangabe oben müssen gleich sein
  (`tests/bewertungsmodell.test.mjs`).

## 12. Quellen (Hintergrund, nicht Quelle der Werte)

Bibliografische Angaben ohne Einsicht in die Originale in dieser Sitzung; vor einer Veröffentlichung prüfen.


- Williams, A. M. & Reilly, T. (2000). Talent identification and development in soccer. *J Sports Sci* 18(9):657–667.
- Unnithan, V. et al. (2012). Talent identification in youth soccer. *J Sports Sci* 30(15):1719–1726.
- Gledhill, A., Harwood, C. & Forsdyke, D. (2017). Psychosocial factors associated with talent development in
  football: A systematic review. *Psychol Sport Exerc* 31:93–112.
- Musculus, L. & Lobinger, B. H. (2018). Psychological characteristics in talented soccer players – recommendations on
  how to improve coaches' assessment. *Front Psychol* 9:41.
- Cumming, S. P. et al. (2017). Bio-banding in sport. *Strength Cond J* 39(2):34–47.
