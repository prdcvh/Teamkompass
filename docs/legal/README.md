# Rechtstexte TeamKompass (Entwurf)

> **Entwurf, keine Rechtsberatung. Vor jeder Nutzung anwaltlich prüfen.**
> Diese Texte wurden von einer KI (Ticket SCRUM-184) auf Grundlage des Quellcodes und der Repo-Konfiguration entworfen. Sie sind weder geprüft noch veröffentlicht noch in der App verlinkt. Alle Angaben in eckigen Klammern (`[PLATZHALTER]`) sind unbekannt und müssen vom Betreiber ergänzt werden. Nichts davon wurde erfunden oder geraten.

## Inhalt

| Datei | Zweck | Adressat |
|---|---|---|
| [`datenschutzerklaerung.md`](datenschutzerklaerung.md) | Datenschutzerklärung für App und Website (Art. 13/14 DSGVO) | Nutzer der App (Trainer, Spieler, Eltern, Medizin-/Scout-Zugänge) |
| [`agb.md`](agb.md) | Nutzungsbedingungen / AGB | Vereine als Kunden (B2B) |
| [`avv.md`](avv.md) | Vorlage Auftragsverarbeitungsvertrag (Art. 28 DSGVO) mit Anlagen (Verarbeitung, TOM, Unterauftragsverarbeiter) | Vereine als Verantwortliche |
| [`einwilligung-eltern.md`](einwilligung-eltern.md) | Einwilligungsvorlage für Eltern/Sorgeberechtigte (Minderjährige, Gesundheitsdaten, Art. 6/7/8/9 DSGVO) | Vereine/Trainer, die sie von Eltern einholen |
| [`impressum.md`](impressum.md) | Impressum (§ 5 DDG) | Website/App |

## Rollenmodell (Grundannahme der Entwürfe)

- **Verein** = Verantwortlicher (Art. 4 Nr. 7 DSGVO) für die Daten seiner Mannschaft(en).
- **Betreiber von TeamKompass** `[BETREIBER]` = Auftragsverarbeiter (Art. 28 DSGVO) für diese Daten. Für Konto- und Betriebsdaten des Dienstes selbst (Login, Server-Logs, Abrechnung) ist der Betreiber eigener Verantwortlicher.
- **Google (Firebase)** = Unterauftragsverarbeiter.

Nutzt der Betreiber die App auch für ein eigenes Team (derzeit "1. FC Königstein U14", `teamId` `mein-team`), ist zu klären, wer dort Verantwortlicher ist.

## Was die App tatsächlich verarbeitet (aus dem Code abgeleitet)

Quellen: `angular/src/app/core/**`, `outputs/team-manager/app.js`, `firestore.rules`, `firebase.json`, `FIREBASE_SETUP.md`, `angular/src/environments/firebase.ts`.

- **Spielerdaten** (`teams/{teamId}/players`): Name, Positionen, Rückennummer, Geburtsdatum, Status (Fit/Angeschlagen/Verletzt/Pause), "verletzt bis"/"verletzt seit", Einwilligungsstatus und Datum (nur Vermerk, nicht der Einwilligungstext).
- **Gesundheitsdaten (Art. 9)**: Status "Verletzt/Angeschlagen", Verletzungen mit Verletzungsart (Freitext), Abwesenheiten mit Grund (Freitext möglich), Körpergröße und Gewicht (`measurements`), Belastungswerte je Termin.
- **Leistungsdaten**: Bewertungen je Spieler und Termin (Einsatz, Technik, Taktik, Auffassungsgabe, Minuten, Tore, Vorlagen, Freitext-Notiz), Entwicklungspläne, Scout-Profile, Spielerstatistiken, interne Trainernotizen (`privateNotes`).
- **Team- und Termindaten**: Termine (Titel, Datum, Ort, Ergebnis, Notizen), Gegneranalysen, Aufstellungen, Planung.
- **Konten/Login**: Firebase Authentication. Trainer: E-Mail und Passwort. Spieler/Eltern: Einladungscode (6-stellig) mit anonymer Firebase-Anmeldung, an das Gerät gebunden, optional befristet. Rollen: `trainer`, `player`, `parent`, `physio` (UI: Medizin-Zugang), `scout`. Gespeichert: UID, Rolle, ggf. Spieler-Zuordnung, Ablaufdatum.
- **E-Mail-Erinnerung (Angular-App)**: Schalter für Trainer (`notifications/{uid}`). Laut Hinweis in `settings.html` ist der Versand **noch nicht eingerichtet**, es wird nur die Wahl gespeichert. Wird ein Versanddienst angebunden, ist er als weiterer Unterauftragsverarbeiter aufzunehmen.
- **Wetter (nur Angular-App)**: Abfrage bei Open-Meteo mit Koordinaten des Termin-Orts bzw. Ortssuche; dabei wird die IP-Adresse des Geräts übertragen. Keine Spieler-/Teamdaten (so auch in `settings.html` beschrieben).
- **Lokal im Gerät**: `localStorage`/IndexedDB (Darstellung, Arbeitsbereich, Aufbewahrungsdauer, Installationshinweis, Firestore-Offline-Cache).
- **Nicht gefunden**: Foto-/Dateiupload (kein Firebase Storage im Code; CSP erlaubt nur `img-src 'self' data:`), Analytics-SDK (aber eine `measurementId` in der Firebase-Konfiguration, siehe offene Punkte), Werbung, Tracking, Push-Mitteilungen, Standortabfrage des Geräts (`Permissions-Policy: geolocation=()`).
- **Hosting**: Firebase Hosting (Sites `teamkompass-b8aac`, `teamkompass-u17`, `teamkompass-u15`, `teamkompass-u14`); Server-Logs mit IP-Adresse fallen bei Google an. Das ältere App-Bundle (`outputs/*`) lädt das Firebase-SDK von `www.gstatic.com`; dabei wird die IP-Adresse an Google übermittelt.

## Offene Punkte / Entscheidungen für den Product Owner

1. **Anwaltsprüfung: ja/nein?** Empfehlung: ja, vor dem ersten fremden Verein. Besonders AVV, Haftungsklauseln der AGB und Einwilligungsvorlage (Minderjährige, Art. 8/9 DSGVO).
2. **Platzhalter**: Betreiber (Name/Rechtsform, Anschrift, E-Mail, Telefon, Register, USt-ID, Vertretungsberechtigte, ggf. Datenschutzbeauftragter, Aufsichtsbehörde), Gerichtsstand, Preise/Laufzeiten (Epic SCRUM-168), Haftungsgrenzen, Kontakt für Datenschutzanfragen.
3. **Standort der Firestore-Datenbank: nicht aus dem Repo ableitbar.** Weder `firebase.json`, `.firebaserc`, `firestore.rules`, `FIREBASE_SETUP.md` noch der Code legen eine Region fest (sie wird beim Anlegen der Datenbank in der Firebase-Konsole gewählt und ist nachträglich nicht änderbar). **In der Konsole prüfen:** Firestore Database, Datenbankinformationen/Standort. Ob der Standort in der EU liegt, ist offen. Liegt er nicht in der EU, wäre vor dem Start fremder Vereine eine Migration in eine EU-Datenbank (neues Projekt) nötig. Der Standort von Authentication-Daten und Hosting-Logs ist offen (nicht regional wählbar, Verarbeitung durch Google ggf. auch außerhalb der EU; dann Standardvertragsklauseln bzw. Data Privacy Framework von Google prüfen).
4. **Google-AV-Bedingungen prüfen und annehmen**: Die Datenverarbeitungsbedingungen für Firebase/Google Cloud müssen für die Projekte vom Betreiber akzeptiert sein. Stand und Fassung wurden **nicht** geprüft (kein Zugriff). Ebenso die Unterauftragsverarbeiter-Liste und Drittlandübermittlung von Google.
5. **Analytics**: `firebase-config.js` und `environments/firebase.ts` enthalten eine `measurementId`. Im Code wurde kein Analytics-SDK gefunden. In der Konsole prüfen, ob Google Analytics aktiviert ist. Falls ja, ist es in der Datenschutzerklärung (und ggf. Einwilligung nach § 25 TDDDG) zu behandeln, sonst deaktivieren.
6. **Hosting-Ort der Texte und Verlinkung (nicht gebaut)**: Das Akzeptanzkriterium "in der App verlinkt (Anmeldung, Einstellungen)" ist **nicht umgesetzt**. Entscheidung nötig: statische Seiten auf den Hosting-Seiten (`outputs/*` und `angular/`), nur in der Angular-App (`teamkompass-u14`) oder auf einer eigenen Website des Betreibers? `firebase.json` ignoriert `**/*.md`, d. h. Markdown würde nicht mitdeployt, die Texte müssten in HTML überführt werden. Die Angular-App hat bereits den Menüpunkt "Einstellungen & Datenschutz"; die Anmeldeseite hat bisher keinen Link. Gemäß CLAUDE.md müsste jede App-Kopie angepasst werden.
7. **AVV je Verein**: Annahmeverfahren klären (Unterschrift, digitale Annahme bei Registrierung).
8. **Einwilligung Eltern**: In der App wird nur ein Vermerk (Status + Datum) gespeichert, nicht die Einwilligung selbst. Klären, ob eine App-Funktion dafür entstehen soll (eigenes Ticket), Rechtsgrundlage für Leistungsdaten (Vertrag/berechtigtes Interesse vs. Einwilligung) und Umgang mit Einwilligungsfähigkeit älterer Jugendlicher (Anwalt).
9. **Löschung, Auskunft, Export**: Die App kann den lokalen Zwischenspeicher löschen. Ob es einen vollständigen Löschweg für Cloud-Daten und einen Datenexport (Art. 15/20) gibt, wurde nicht abschließend geprüft; die Texte sehen dies über den Betreiber auf Anfrage vor. Löschfristen sind Platzhalter.
10. **TOM (AVV Anlage 2)** stützt sich auf `firestore.rules`, Auth und CSP-Header. Organisatorische Maßnahmen des Betreibers (Zugriffskonzept, Backup, Incident-Prozess, Vertraulichkeitsverpflichtung) sind unbekannt und als Platzhalter markiert.
11. **DSFA/Verzeichnis**: Gesundheitsdaten Minderjähriger können eine Datenschutz-Folgenabschätzung (Art. 35) und ein Verzeichnis der Verarbeitungstätigkeiten (Art. 30) erfordern. Anwalt/DSB klären.
12. **Open-Meteo** (nur Angular): in der Datenschutzerklärung als Empfänger genannt; juristisch bewerten (nur IP-Adresse und Koordinaten).
13. **Kinder als Nutzer**: Spieler nutzen die App per Einladungscode. Prüfen, ob eine kindgerechte Kurzfassung der Datenschutzerklärung nötig ist (Art. 12 Abs. 1 DSGVO).

## Nicht Teil dieses Tickets

Keine Änderung an App-Code, `firestore.rules`, Auth, Hosting oder am README im Repo-Root. Keine Veröffentlichung.
