# Hinweis „Wachstum und Belastung gemeinsam ansehen“ (SCRUM-257)

Stand 20.11.2026. Freigabe durch den PO in SCRUM-257 (Kommentar vom 20.11.2026: Vorschlag ausarbeiten und direkt in
die Wenn-dann-Regeln aus SCRUM-195 einbauen; Trainerprüfung als eigene Notiz am Förderplan). Dieses Dokument legt
Auslöser, Ablauf, Wiederholungsschutz und die Trainerprüfung fest, **bevor** sie umgesetzt werden. Code:
`angular/src/app/core/alerts/growth-load-rule.ts`, Regel-ID `growthLoad`.

## 1. Grundsätze

- **Kein neuer Formelwert, kein Risikoscore.** Der Hinweis ist nur die Verknüpfung zweier Hinweise, die es schon gibt:
  dem Wachstumshinweis (SCRUM-157/254/305, Methodenversion 1.0 §6 in `reife-kompass-methoden.md`) und den
  Belastungshinweisen der Belastungsampel (SCRUM-137/176). Es gibt keine eigene Schwelle, keine Gewichtung und keine
  Prozentzahl.
- **Keine Einordnung, keine Sperre.** Der Hinweis lautet nur „gemeinsam ansehen“. Er setzt nie „verletzt“, „nicht
  einsetzen“, eine Diagnose oder eine Trainingssperre. Belastung, Teilnahme, Status und Verfügbarkeit ändert die App
  nie selbst; eine Maßnahme dokumentiert der Trainer (Abschnitt 5).
- **Ein Mechanismus.** Der Hinweis ist eine weitere Vorlage der Wenn-dann-Regeln (SCRUM-195): gleiche Anzeige auf der
  Startseite, gleiches Protokoll, gleicher Schalter in den Teameinstellungen, gleiche neutrale E-Mail ohne
  Gesundheitsdetails. Es gibt keinen zweiten Hinweis- oder Nachrichtenweg.
- **Wer ihn sieht:** nur Trainer (er braucht Bewertungen für die Belastung; Medizin liest keine Bewertungen).
  Spieler, Eltern, Scouts und Vereinsadmin nie.

## 2. Auslöser

Für einen Spieler an einem Tag T schlägt die Regel an, wenn **alle** Bedingungen gelten:

1. Die Einwilligung des Spielers ist **nicht widerrufen** (SCRUM-245/252). Bei Widerruf wird nichts berechnet.
2. Es gibt am Tag T einen **aktuellen Wachstumshinweis** nach der bestehenden Regel (`analyzeGrowth`,
   `growthHintLevel`): jüngste gültige Größenmessung höchstens **90 Tage** alt, Vergleichsmessung **90 bis 365 Tage**
   davor, Rate gültig (kein Rückgang, kein Ausreißer, keine markierte Messung) und mindestens **0,6 cm/Monat**
   (Kemper et al. 2015, wie die Belastungsampel). Ein veralteter Wachstumshinweis (älter als 90 Tage) zählt nicht.
3. An mindestens einem Tag **zwischen der jüngsten Messung und T** zeigte die Belastungsampel einen
   **Belastungshinweis**: „Belastungsspitze“ (mit beiden Schutzregeln gegen Fehlalarme) oder „Zwei sehr harte
   Einheiten innerhalb von 48 Stunden“. Andere Gründe der Ampel (Wiedereinstieg, Rückkehr nach Verletzung,
   Wachstum selbst) lösen nicht aus – sonst würde ein einzelner Formelwert genügen.
4. Für genau diese Messdaten ist noch **keine Trainerprüfung** mit Datum bis T dokumentiert (Abschnitt 5).

Das Befinden (SCRUM-138) ist **kein Auslöser**. Es steht im Hinweis als Zusatzangabe (Schnitt der letzten 28 Tage);
fehlt es, heißt es „keine Angaben“, ist es nicht lesbar, „nicht freigegeben oder nicht lesbar“ – nie „unauffällig“.

## 3. Messqualität zuerst

Ist die jüngste oder die Vergleichsmessung **nicht dokumentiert** (ohne Qualitätskennzeichen aus SCRUM-253), lautet der
Hinweis zuerst **„Messung prüfen“** (mit den betroffenen Messtagen). Erst wenn beide Messungen als geprüft gelten,
wird daraus „Wachstum und Belastung gemeinsam ansehen“ mit der Möglichkeit, die Prüfung zu dokumentieren. Als
auffällig markierte Messungen zählen wie bisher gar nicht.

## 4. Ablauf und Wiederholungsschutz

- **Ein Hinweis je Messpaar.** Kennung = Spieler + Vergleichsmessung + jüngste Messung (jeweils Kennung, Datum, Größe).
  Gleiche Daten ergeben immer dieselbe Kennung und damit **denselben** Hinweis, nie einen zweiten identischen.
- **Bleibt stehen, bis er erledigt ist:** Hat die Belastungsampel einmal angeschlagen, bleibt der Hinweis auch dann
  bestehen, wenn die Belastungsspitze wieder abklingt – er soll ja geprüft werden. Er endet, sobald eines eintritt:
  - der Trainer dokumentiert die Prüfung (ab dem Datum der Prüfung);
  - **Ablaufdatum:** der Wachstumshinweis ist nicht mehr aktuell, also **90 Tage nach der jüngsten gültigen
    Größenmessung** (das Datum steht im Hinweis);
  - die Messdaten ändern sich (Korrektur, Löschen, Markierung als auffällig): dann gilt die alte Kennung nicht mehr.
    Ergibt die korrigierte Messung weiter einen Wachstums- und Belastungshinweis, entsteht ein neuer Hinweis mit neuer
    Kennung (die Daten sind ja andere), sonst keiner;
  - die Einwilligung wird widerrufen.
- Eine neue Messung ergibt ein neues Messpaar und damit, falls die Bedingungen wieder gelten, einen neuen Hinweis.
- Das Protokoll der letzten 28 Tage wird wie bei allen Regeln aus den Daten neu berechnet (nichts gespeichert).

## 5. Trainerprüfung als Notiz am Förderplan

- Der Trainer öffnet den Hinweis im Spielerprofil (Karte „Wachstum, Belastung und Befinden“) und dokumentiert:
  **Förderplan** (ein vorhandener Plan des Spielers), **Datum** der Prüfung (heute oder früher), **Maßnahme**
  (Freitext, höchstens 400 Zeichen). Der **Name** des prüfenden Trainers und sein Konto werden automatisch eingetragen.
- Gespeichert wird **ein eigenes Dokument** `teams/{team}/players/{id}/growthReviews/{prüfung}` mit genau diesen
  Feldern (plus Kennung des Hinweises und Spieler). Es liegt bewusst **nicht im Förderplan-Dokument**: Förderpläne
  lesen auch Spieler, Eltern (auch nach Widerruf) und der Vereinsadmin; die Prüfung beruht aber auf Gesundheitsdaten.
- Regeln (`firestore.rules`): lesen nur Trainer; anlegen nur Trainer, nur diese Felder, nur zu einem bestehenden
  Förderplan, nur mit dem eigenen Konto, nicht bei widerrufener Einwilligung, fremde Vereine nur mit dokumentierter
  Einwilligung; ändern nie (eine Notiz bleibt, wie sie ist); löschen Trainer.
- Widerruf: Die Notizen erscheinen in der Aufgabe „Gesundheitsdaten prüfen und löschen“; beim Löschen eines Spielers
  werden sie mitgelöscht. Sie sind nicht im Export und nicht in der Datensicherung.
- Die Maßnahme ist Text des Trainers. Die App leitet daraus nichts ab und ändert keine Belastung, Teilnahme oder
  Verfügbarkeit.

## 6. Bewusst nicht enthalten

- keine Schwelle für Befinden, keine Kombination mit Schmerzangaben, keine Pubertätsangaben;
- kein Reifestand (%PAH) und kein Bio-Banding als Auslöser (Reifedaten bleiben in ihren Ansichten);
- keine E-Mail mit Namen, Werten oder Regel – nur der neutrale Text aus SCRUM-195.
