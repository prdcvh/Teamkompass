# Datenblatt Reife-Kompass (Entwurf)

> **Entwurf, keine Rechtsberatung.** Beschreibt, was die App beim Reife-Kompass (SCRUM-190), beim Bio-Banding
> (SCRUM-191) und mit den Zugriffs- und Widerrufsregeln aus SCRUM-252 tatsächlich tut. Die Texte für Eltern und
> Spieler (Abschnitt 7) sind **noch nicht freigegeben** und stehen nicht in der App.

## 1. Welche Daten

| Daten | Wo gespeichert | Art |
|---|---|---|
| Größe und Gewicht je Messung | `teams/{team}/players/{id}/measurements/{messung}` | Rohdaten, Gesundheitsdaten (wie bisher, SCRUM-68/245) |
| Größe von Mutter und Vater (optional, cm) | `teams/{team}/players/{id}/maturity/parents` | Rohdaten über Dritte |
| Häkchen „Eltern sind mit der Speicherung ihrer Größe einverstanden“ mit Nachweis (Tag, Konto des Trainers) | dasselbe Dokument (`parentsConsent`, `parentsConsentDate`, `parentsConsentBy`, `parentsConsentByUid`) | Einwilligungsvermerk |
| Geschlecht für die Formel (Junge/Mädchen, optional) | dasselbe Dokument (`sex`) | Rohdaten |
| Erwartete Erwachsenengröße, Reifestand in %, Einordnung früh/im Schnitt/spät, Verlauf | **nirgends** – wird bei jeder Anzeige neu gerechnet | Ableitung |
| Bio-Banding-Vorschlag (Gruppen nach Reifestand) | **nirgends** – einmal beim Aufklappen gerechnet, beim Verlassen der Seite verworfen | Ableitung |

Nicht erfasst und nicht nötig: Namen der Eltern, Pubertätsfragebogen oder andere intime Angaben.
Größe der Eltern und Geschlecht sind freiwillig; ohne sie gibt es einfach keinen Reifestand.

## 2. Zweck

Trainer (und, falls eingerichtet, die Medizin) sehen den ungefähren biologischen Reifestand von 12- bis
15-Jährigen, um Noten und Tests fairer zu lesen und Trainingsgruppen nach Reife (Bio-Banding) vorzuschlagen.
Der Reifestand **ändert keine Note, keine Punkte und keine Auswahl**: Er steht nur als Hinweis neben den Messwerten.
Keine Teilnahme (keine Elterngröße, Häkchen fehlt, Einwilligung widerrufen) bedeutet nur: kein Wert. Es gibt keinen
Abzug in Noten, Punkten, Rangliste oder Auswahlwerten – die Reife-Module werden von diesem Code gar nicht genutzt
(`tests/maturity-privacy.test.mjs` prüft das bei jedem Build).

## 3. Wer sieht was (Rollen- und Vereinsmatrix)

| | Größe der Eltern / Geschlecht | Reifestand (Profil) | Bio-Banding | Schreiben | Löschen |
|---|---|---|---|---|---|
| Trainer des Teams | ja | ja | ja | ja | ja |
| Medizin des Teams | ja (nicht bei Widerruf) | ja (nicht bei Widerruf) | ja (ohne widerrufene Spieler) | nein | nein |
| Spieler, Eltern | nein | nein | nein | nein | nein |
| Scout | nein | nein | nein (sieht keine Termine) | nein | nein |
| Vereinsadmin | nein | nein | nein | nein | nein |
| Trainer/Mitglieder anderer Teams, Fremde | nein | nein | nein | nein | nein |

Durchgesetzt in `firestore.rules` (`match /maturity/{docId}`), geprüft mit Emulator-Tests
`tests/rules/maturity.test.mjs` (Lesen, Listen, collectionGroup-Abfrage über alle Teams, Schreiben, Löschen je Rolle,
Vereinsadmin, Trainer anderer Teams, fremde Vereine, Widerruf) und `tests/rules/club-admin.test.mjs`.

- **Suche:** Die globale Suche (Strg/⌘ + K) durchsucht nur Namen von Spielern, Terminen und Gegnern – keine Reifedaten.
  Eine Abfrage über alle Teams (collectionGroup `maturity`) lehnen die Regeln für jeden ab.
- **Exporte:** Weder die Datensicherung (JSON) noch das Profil-PDF noch die Spielerkarte enthalten die Größe der Eltern,
  das Geschlecht oder den Reifestand (bewusst, Datensparsamkeit). Folge: Nach dem Einspielen einer Sicherung fehlen
  diese Angaben und müssen neu erfasst werden. Messwerte sind wie bisher in der Sicherung.
- **Zwischenspeicher:** Die Angaben liegen wie alle Teamdaten im Offline-Speicher des Geräts (IndexedDB) und werden
  beim Abmelden gelöscht. Der Reifestand und der Bio-Banding-Vorschlag liegen nur im Arbeitsspeicher.
- **Fremde Vereine:** Speichern nur mit dokumentierter Einwilligung des Spielers (wie alle Gesundheitsdaten, SCRUM-245).
  Die Sonderregeln für eigene/fremde Vereine sind unverändert.

## 4. Einverständnis der Eltern

- Die Größe von Mutter und Vater ist eine Angabe über Dritte. Die Felder sind gesperrt, bis das Häkchen „Eltern sind
  mit der Speicherung ihrer Größe einverstanden“ gesetzt ist (PO-Entscheidung zu SCRUM-190).
- Setzt ein Trainer das Häkchen neu, speichert die App Tag und Trainer-Konto als Nachweis (wie beim Einwilligungsvermerk
  des Spielers). Bleibt das Häkchen gesetzt, bleibt der Nachweis unverändert – auch ein anderer Trainer kann ihn nicht
  überschreiben. Einträge von vor SCRUM-252 haben keinen Nachweis und zeigen „ohne Datum eingetragen“.
- Häkchen weg + Speichern: Die Größen der Eltern und der Nachweis werden gelöscht (Regeln erzwingen das).
- Das Häkchen ist nur ein Vermerk. Die eigentliche Einwilligung (unterschrieben) liegt beim Verein. Ein Häkchen allein
  erfüllt nicht alle rechtlichen Voraussetzungen.
- Es gibt **keinen** Schalter „ab 16 entscheidet der Spieler allein“. Wer einwilligt, regelt der Einwilligungstext
  (derzeit: unter 16 die Eltern, ab 16 Spieler und Eltern gemeinsam) – rechtlich zu prüfen (Abschnitt 7).

## 5. Widerruf

Einwilligung des Spielers auf „widerrufen“ (Logik aus SCRUM-245):

- **Keine neue Berechnung:** Die App rechnet für diesen Spieler keinen Reifestand mehr – weder im Profil noch im
  Bio-Banding. Die Karte zeigt stattdessen einen Hinweis; das Formular ist weg. Alle Ansichten rechnen über dieselbe
  Funktion (`maturityInputsForCalculation` in `angular/src/app/core/records/maturity.ts`), es gibt keinen Umweg.
- **Keine neuen Elterngrößen:** Die Regeln lehnen das Speichern von Größen der Eltern ab, solange die Einwilligung
  widerrufen ist (auch im selben Schreibvorgang wie der Widerruf). Leeren und Löschen geht.
- **Sperre:** Medizin liest die Angaben nicht mehr (Spieler, Eltern, Scouts nie).
- **Trainer:** sieht die Angaben weiter und bekommt sie in der Aufgabe „Gesundheitsdaten prüfen und löschen“ (im
  Profil bei der Einwilligung) mit dem Knopf „Angaben löschen“. Gelöscht wird nur nach Rückfrage, **nie automatisch**.
- Einverständnis der **Eltern** zurückgenommen (Häkchen weg): ab dem Speichern keine Größen und keine Berechnung mehr.

## 6. Löschen, Korrigieren, Speicherdauer

- Weil keine Ableitung gespeichert wird, gibt es nichts, was nach dem Löschen oder Korrigieren von Rohdaten veraltet
  stehen bleibt: Messung gelöscht oder geändert, Größe der Eltern geändert oder gelöscht → der Reifestand wird beim
  nächsten Anzeigen neu gerechnet bzw. verschwindet (Unit-Tests in `maturity.spec.ts`, `maturity-card.spec.ts`,
  `bio-banding.spec.ts`).
- Spieler löschen löscht das Dokument `maturity/parents` mit (seit SCRUM-190).
- Speicherdauer: wie Gesundheitsdaten (Datenschutzerklärung Abschnitt 6, Frist vom Verein festzulegen, Platzhalter).
  Eine automatische Löschfrist gibt es nicht.

### Offline-Grenzen

- Änderungen offline (z. B. Messung löschen) wirken auf dem eigenen Gerät sofort; andere Geräte sehen sie nach der
  Wiederverbindung (Echtzeit-Abo).
- Ein Medizin-Gerät, das offline ist, kann nach einem Widerruf die zuletzt geladenen Angaben noch zeigen, bis es wieder
  online ist. Dann lehnt der Server das Abo ab, und die App löscht die Angaben aus dem Speicher der Seite (getestet in
  `maturity-card.spec.ts`, „Offline und Wiederverbindung“). Der Offline-Speicher des Geräts wird beim Abmelden geleert.
- Ein offline eingetragener Wert, den die Regeln später ablehnen (z. B. Größe nach Widerruf), wird bei der
  Wiederverbindung verworfen.

## 7. Voraussetzungen vor der Freigabe (fachlich/rechtlich)

Die folgenden Punkte sind **Umsetzungsvoraussetzung**, nicht erledigt:

1. **Rechtsgrundlage prüfen** (Verein/Datenschutzbeauftragter/Anwalt): Art. 6, 7, 8, 9 DSGVO – Größe/Gewicht und der
   daraus abgeleitete Reifestand als Gesundheitsdaten; Größe der Eltern als Daten Dritter (Einwilligung der Eltern
   selbst, nicht nur der Sorgeberechtigten des Spielers).
2. **Einwilligung Minderjähriger:** Wer willigt bei 12- bis 15-Jährigen (und darüber) wirksam ein? Kein pauschaler
   „ab 16 immer selbst“-Schalter in der App.
3. **Texte freigeben:** Der folgende Zusatz für den Einwilligungstext ist ein Vorschlag. Er steht **nicht** in der App
   und nicht im Ausdruck, bis der PO ihn nach Prüfung freigibt:

   > *Reife-Kompass (freiwillig):* Mit Ihrer Einwilligung speichern wir zusätzlich die Größe von Mutter und Vater.
   > Daraus und aus Größe und Gewicht schätzt die App, wie viel Prozent seiner erwarteten Erwachsenengröße Ihr Kind
   > erreicht hat. Das sieht nur das Trainerteam [und die Medizin]. Es dient nur dazu, Leistungen fairer einzuordnen
   > und Trainingsgruppen nach Reife zu bilden; Noten und Auswahl ändern sich dadurch nicht. Ohne diese Angaben
   > entsteht kein Nachteil. Sie können die Einwilligung jederzeit widerrufen; dann rechnen wir nichts mehr und löschen
   > die Angaben auf Wunsch.

4. **Speicherdauer festlegen** (Frist für Gesundheitsdaten in Datenschutzerklärung und Einwilligung).
5. **Datensicherung:** bestätigen, dass die Angaben bewusst nicht in der Sicherung sind (oder ein Ticket für die
   Aufnahme anlegen).

## 8. Neue Felder einhängen (z. B. SCRUM-253 Sitzhöhe, Messqualität)

- **Rohmesswerte** (Sitzhöhe, Wiederholungsmessungen, Messstation, Qualitätskennzeichen) gehören in die bestehenden
  Messwert-Dokumente `measurements/{messung}`. Dort gelten Lesen, Schreiben, Widerruf und die Sperre für fremde Vereine
  für **jedes** Feld automatisch – die Regeln prüfen dort keine Feldliste. Achtung: Messwerte sieht auch der Spieler
  bzw. die Eltern selbst (eigene Daten).
- **Reife-Angaben, die nur Trainer/Medizin sehen dürfen** (z. B. weitere Angaben über Dritte), gehören in
  `maturity/parents`. Dann die Feldliste `hasOnly([...])` in `firestore.rules` erweitern, die Lese-/Schreibtests in
  `tests/rules/maturity.test.mjs` ergänzen und `maturityInputsFromDoc`/`docFromMaturityInputs` anpassen. Der
  Widerrufs-Stopp greift über `maturityInputsForCalculation` automatisch.
- **Ableitungen** (Beinlänge, Reifestand nach Mirwald o. Ä.) nicht speichern, sondern wie der Reifestand bei der Anzeige
  rechnen und über `maturityInputsForCalculation` bzw. `maturityStopped` führen. Muss doch etwas gespeichert werden,
  nur unter `maturity/` (nicht in `measurements`, sonst sehen es Spieler/Eltern) und mit einem Weg, es beim Löschen
  oder Korrigieren der Rohdaten mitzulöschen.
- Jede neue Stelle, die Reife-Module nutzt, muss in `tests/maturity-privacy.test.mjs` bewusst freigegeben werden.
