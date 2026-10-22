# Datenschutzerklärung TeamKompass

> **ENTWURF, keine Rechtsberatung, vor Nutzung anwaltlich prüfen.** Platzhalter in eckigen Klammern sind vom Betreiber auszufüllen. Stand des Entwurfs: 22.10.2026.

Diese Datenschutzerklärung erklärt, wie bei der Nutzung der App und Website **TeamKompass** (Verwaltung von Mannschaften im Jugendfußball) personenbezogene Daten verarbeitet werden.

## 1. Wer ist verantwortlich?

TeamKompass wird von Vereinen für ihre Mannschaften genutzt. Es gibt zwei Rollen:

**a) Der Verein** (Ihre Mannschaft, z. B. [VEREIN]) ist **Verantwortlicher** für die Daten seiner Spieler, Eltern, Trainer und Betreuer in der App (Kader, Termine, Bewertungen, Abwesenheiten, Messwerte, Entwicklungspläne). Der Betreiber verarbeitet diese Daten **im Auftrag** des Vereins (Art. 28 DSGVO, Auftragsverarbeitungsvertrag). Für Fragen zu diesen Daten sowie zur Ausübung Ihrer Rechte wenden Sie sich bitte zuerst an Ihren Verein: [KONTAKT DES VEREINS – vom Verein auszufüllen].

**b) Der Betreiber von TeamKompass** ist **Verantwortlicher** für die Daten, die für den Betrieb des Dienstes selbst anfallen (Konto, Anmeldung, technische Protokolle, Vertragsabwicklung mit dem Verein):

[NAME / FIRMA DES BETREIBERS]
[ANSCHRIFT]
E-Mail: [KONTAKT-E-MAIL]
[Falls benannt: Datenschutzbeauftragter: [NAME, KONTAKT]]

## 2. Welche Daten werden verarbeitet?

### 2.1 Daten der Mannschaft (im Auftrag des Vereins)

| Daten | Zweck |
|---|---|
| Spielerprofil: Name, Positionen, Rückennummer, Geburtsdatum, Status (Fit / Angeschlagen / Verletzt / Pause), "verletzt bis/seit", Vermerk über eine erteilte Einwilligung (Status und Datum) | Kaderverwaltung, Planung |
| **Gesundheitsdaten:** Verletzungen (Verletzungsart als Freitext), Abwesenheiten mit Grund (z. B. Krankheit, Schule, Urlaub), Körpergröße und Gewicht, Belastungswerte je Termin | Verfügbarkeit, Belastungssteuerung, Entwicklung der Spieler |
| Leistungsdaten: Bewertungen je Termin (Einsatz, Technik, Taktik, Auffassungsgabe, Spielminuten, Tore, Vorlagen, Notizen), Entwicklungspläne, Statistiken, interne Trainer-Notizen | Förderung, Auswertung |
| Termine und Teamdaten: Trainings, Spiele, Ort, Ergebnis, Aufstellungen, Gegneranalysen | Organisation |

Gesundheitsdaten sind besondere Kategorien personenbezogener Daten (Art. 9 DSGVO) und betreffen hier Minderjährige. Sie werden nur auf Grundlage der Einwilligung der Sorgeberechtigten (und, soweit rechtlich erforderlich, des Jugendlichen) verarbeitet, die der Verein einholt (siehe Vorlage `einwilligung-eltern.md`). [Rechtsgrundlagen im Detail vom Verein bzw. Anwalt zu prüfen.]

### 2.2 Konto- und Zugangsdaten

- **Trainer:** E-Mail-Adresse und Passwort (Passwort nur als Hash durch Firebase Authentication).
- **Spieler und Eltern:** Zugang über einen vom Trainer erzeugten Einladungscode. Es wird eine anonyme Kennung (UID) für das Gerät erzeugt; es werden keine E-Mail-Adresse und kein Passwort erhoben. Der Zugang kann befristet oder vom Trainer gesperrt werden.
- **Rollen:** Trainer, Spieler, Eltern, Medizin-Zugang, Scout-Zugang. Jede Rolle sieht nur die für sie freigegebenen Daten (z. B. Spieler/Eltern nur das eigene Profil; Scout-Zugang keine Gesundheitsdaten).
- Gespeichert werden UID, Rolle, ggf. Zuordnung zu einem Spieler, Ablaufdatum des Zugangs.

### 2.3 Technische Daten

Beim Aufruf der App fallen beim Hosting- und Anmeldedienst von Google (siehe Abschnitt 4) technische Daten an, insbesondere IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser-/Geräteinformationen (Server-Logs). Die Daten dienen dem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO). [Speicherdauer der Logs: [DAUER laut Google/Betreiber – prüfen]]

### 2.4 Lokale Speicherung im Gerät

Die App speichert Einstellungen (z. B. Darkmode, Arbeitsbereich, Aufbewahrungsdauer, Hinweise) sowie einen Zwischenspeicher für den Offline-Betrieb im Speicher Ihres Browsers (localStorage/IndexedDB). Das ist für die Funktion der App erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Es werden keine Cookies zu Werbe- oder Analysezwecken gesetzt. In den Einstellungen kann der lokale Zwischenspeicher gelöscht und die Aufbewahrungsdauer gewählt werden.

### 2.5 Wettervorhersage (nur Angular-App)

Bei Terminen mit Ort fragt Ihr Gerät den Dienst **Open-Meteo** (open-meteo.com) ab. Übertragen werden der Ort des Termins (als Koordinaten bzw. Ortsname bei der Ortssuche) und Ihre IP-Adresse. Es werden keine Spieler- oder Teamdaten übertragen. Open-Meteo speichert Server-Logs nach eigenen Angaben 90 Tage. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (Komfortfunktion, Interesse an Wetterinformation zur Trainingsplanung). [Anbieter, Sitz und Drittlandbezug von Open-Meteo juristisch prüfen.]

### 2.6 E-Mail-Erinnerung (optional, nur Trainer)

Trainer können in den Einstellungen eine E-Mail-Erinnerung an offene Bewertungen aktivieren (Standard: aus). Gespeichert wird die Wahl (an/aus) zum Konto. **Hinweis zum Entwurf:** Nach dem derzeitigen Stand der App wird noch keine E-Mail versendet. Sobald ein Versanddienst angebunden wird, muss dieser hier und im Auftragsverarbeitungsvertrag ergänzt werden: [VERSANDDIENST, falls eingeführt].

### 2.7 Was nicht stattfindet

Nach dem Stand der Prüfung des Quellcodes setzt die App keine Werbung, kein Tracking, keine Standortabfrage des Geräts und keine Push-Mitteilungen ein und speichert keine Fotos oder Dateien. [Vor Veröffentlichung bestätigen: Ob Google Analytics im Firebase-Projekt aktiviert ist, wurde nicht geprüft; falls ja, muss dieser Abschnitt geändert werden.]

## 3. Rechtsgrundlagen (Überblick)

- Mannschaftsdaten (Abschnitt 2.1): Verein als Verantwortlicher; je nach Datenart Einwilligung (Art. 6 Abs. 1 lit. a, Art. 9 Abs. 2 lit. a, Art. 8 DSGVO), Vertrag/Mitgliedschaft (Art. 6 Abs. 1 lit. b) oder berechtigtes Interesse (Art. 6 Abs. 1 lit. f). [Endgültige Zuordnung durch den Verein/Anwalt.]
- Konto- und Zugangsdaten, technische Daten: Art. 6 Abs. 1 lit. b und f DSGVO.
- Lokale Speicherung: § 25 Abs. 2 Nr. 2 TDDDG.

## 4. Empfänger und Auftragsverarbeiter

| Empfänger | Zweck | Sitz / Drittland |
|---|---|---|
| **Google Ireland Limited** (Firebase: Cloud Firestore, Authentication, Hosting), ggf. Google LLC (USA) als weiterer Verarbeiter | Datenbank, Anmeldung, Auslieferung der App | Irland; Konzern in den USA. [Übermittlung in Drittländer nur auf Grundlage der Google-Vertragsbedingungen (Standardvertragsklauseln / Data Privacy Framework) – Fassung und Gültigkeit prüfen.] |
| **Open-Meteo** (nur Angular-App, Abschnitt 2.5) | Wetterdaten | [Sitz prüfen] |
| [Weitere, z. B. Versanddienst, Abrechnung] | | |

Innerhalb des Vereins erhalten nur die dafür berechtigten Personen Zugriff (Rollen siehe Abschnitt 2.2). Eine Weitergabe an sonstige Dritte erfolgt nicht, außer wir sind gesetzlich dazu verpflichtet.

## 5. Speicherort

Die Mannschaftsdaten werden in Google Cloud Firestore (Firebase-Projekt des Betreibers) gespeichert. **Standort der Datenbank: [REGION – in der Firebase-Konsole prüfen; z. B. EU-Standort ja/nein].** Beim Auslieferungsnetz (Hosting) und der Anmeldung (Authentication) kann eine Verarbeitung durch Google auch außerhalb der EU nicht ausgeschlossen werden. [Angabe nach Prüfung konkretisieren.]

## 6. Speicherdauer

- Mannschaftsdaten: bis der Verein sie löscht bzw. bis zum Ende des Vertrags mit dem Betreiber, danach Löschung nach [FRIST, z. B. 30 Tage] (siehe AVV).
- Gesundheitsdaten: [FRIST – so kurz wie möglich, vom Verein festzulegen, z. B. Löschung bei Ausscheiden des Spielers].
- Einwilligungsvermerke: bis zum Widerruf bzw. Ausscheiden des Spielers [FRIST].
- Lokaler Zwischenspeicher: gemäß eingestellter Aufbewahrungsdauer, bis zum Löschen durch den Nutzer.
- Server-Logs: [FRIST].

## 7. Ihre Rechte

Sie haben gegenüber dem jeweils Verantwortlichen das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitung auf Grundlage berechtigter Interessen (Art. 21 DSGVO). Eine erteilte **Einwilligung** können Sie jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3); die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt unberührt. Für Daten der Mannschaft wenden Sie sich an Ihren Verein; der Betreiber unterstützt den Verein dabei (AVV). Anfragen an den Betreiber: [KONTAKT-E-MAIL].

Sie haben außerdem das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO), z. B. bei der für Ihren Wohnort oder den Sitz des Verantwortlichen zuständigen Behörde. [Zuständige Aufsichtsbehörde des Betreibers: [BEHÖRDE]]

## 8. Pflicht zur Bereitstellung, automatisierte Entscheidungen

Ohne die für den Zugang nötigen Angaben (Einladungscode bzw. E-Mail/Passwort) kann die App nicht genutzt werden. Angaben zu Spielern und Gesundheitsdaten sind freiwillig; ohne sie sind einzelne Funktionen (z. B. Verfügbarkeit) eingeschränkt. Eine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO findet nicht statt. [Die App berechnet Kennzahlen (z. B. Durchschnittsnoten, Belastung) als Hilfe für Trainer; Entscheidungen trifft der Trainer. Bewertung durch Anwalt.]

## 9. Datensicherheit

Die Übertragung erfolgt verschlüsselt (HTTPS). Zugriffe auf die Datenbank sind durch serverseitige Regeln je Rolle und Mannschaft beschränkt; Mannschaften sind voneinander getrennt. Die App setzt Sicherheits-Header (u. a. Content-Security-Policy). Weitere Maßnahmen: siehe Anlage 2 des Auftragsverarbeitungsvertrags.

## 10. Änderungen

Wir passen diese Erklärung an, wenn sich App, Dienste oder Rechtslage ändern. Die aktuelle Fassung finden Sie in der App bzw. unter [URL]. Stand: [DATUM].
