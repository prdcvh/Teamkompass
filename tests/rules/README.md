# Firestore-Regeln: Emulator-Tests

Prüfen `firestore.rules` gegen den lokalen Firestore-Emulator (keine echten Daten, Projekt-ID
`demo-…`). Nicht Teil von `npm run verify`, weil der Emulator Java (21+) und einen Download
(~60 MB) braucht. In der CI läuft der Workflow `.github/workflows/rules-tests.yml`, sobald sich
`firestore.rules`, `firebase.json` oder diese Tests ändern.

```bash
cd tests/rules
npm ci --ignore-scripts
npm test
```

Aktuell abgedeckt (`roles.test.mjs`): Rollen-Matrix für Trainer, Medizin (`physio`), Scout (`scout` und die
alte Kennung `medical`, SCRUM-170: nur `scoutProfiles`, keine Gesundheits- oder Rohdaten), Spieler, Eltern,
abgelaufene Zugänge und Nicht-Mitglieder – wer welche Pfade lesen/schreiben darf (Spielerprofile,
Bewertungen, interne Notizen, Förderpläne, Abwesenheiten, Messwerte, Gegner, Aufstellung,
Mitgliedschaften, Einladungen), inklusive der Listenabfragen mit `playerId`-Filter.

`invite-claim.test.mjs`: Einmalverbrauch von Einladungscodes (SCRUM-77) – gültiger Erst-Claim, zweiter Claim,
fehlender/abgelaufener Code, falscher Spieler/Rolle, parallele Claims und die unveränderten Trainer-Wege.

`rsvp.test.mjs`: Zu-/Absagen (SCRUM-175) unter `events/{eventId}/responses/{playerId}` – Spieler und Eltern
antworten nur für den eigenen Spieler, nur mit erlaubten Feldern (Zusage/Absage, Grund bis 200 Zeichen nur bei
Absage, eigene Rolle, Server-Zeitstempel) und nur für bestehende Events; lesen dürfen nur Trainer und der eigene
Spieler bzw. die eigenen Eltern, löschen nur der Trainer.

`ranking.test.mjs`: MVP-Rangliste (SCRUM-105) unter `meta/ranking` – Trainer sowie Spieler und Eltern des Teams lesen,
Fremde, andere Teams, abgelaufene Zugänge, Scout und Medizin nicht; schreiben und löschen nur der Trainer (nur die Felder
`week`, `month`, `updatedAt`); die Einzelpunkte im Trainer-Pfad bleiben für Spieler gesperrt.

`player-stats.test.mjs`: Zusammenfassung je Spieler (SCRUM-201) unter `playerStats/{playerId}` und das Kennzeichen
`meta/playerStats` – nur Trainer lesen/schreiben/löschen (Spieler und Eltern auch die eigene nicht, Medizin, Scouts,
abgelaufene Zugänge und Nicht-Mitglieder gar nicht), Format-Prüfung (nur `playerId`, `version`, `events`), Bewertung und
Zusammenfassung in einem Schreibvorgang, und dass ein `merge` den Eintrag eines Events vollständig ersetzt bzw. löscht.

`clubs.test.mjs`: mehrere Vereine (SCRUM-180) – zwei Vereine A/B mit je einem Team, ein Altteam ohne
Team-Dokument/`clubId`/`uid` und ein neues Team ohne Trainer. Prüft: Mitglieder aller Rollen aus Verein A lesen und
schreiben nichts in Verein B; Vereinsadmin erreicht keinen fremden Verein und sieht im eigenen Verein keine
Spieler-, Noten- oder Gesundheitsdaten; Teamsuche (`collectionGroup('members')` mit `uid`-Filter) liefert nur eigene
Mitgliedschaften; `uid` muss der Dokument-ID entsprechen; `clubId` unveränderlich; Altteams können nicht
beansprucht werden; Vereinsdokument lesen/ändern; erster Trainer genau einmal; niemand macht sich selbst zum
Vereinsadmin; Altteams laufen unverändert; das Einmal-Skript (`scripts/assign-clubs-lib.mjs`) ändert keine Rechte.
