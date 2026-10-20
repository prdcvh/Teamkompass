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

Aktuell abgedeckt (`roles.test.mjs`): Rollen-Matrix für Trainer, Medizin (mit `healthAccess`), Scout (inkl. Alt-Konten
`medical` ohne `healthAccess`, SCRUM-170), Spieler, Eltern,
abgelaufene Zugänge und Nicht-Mitglieder – wer welche Pfade lesen/schreiben darf (Spielerprofile,
Bewertungen, interne Notizen, Förderpläne, Abwesenheiten, Messwerte, Gegner, Aufstellung,
Mitgliedschaften, Einladungen, bereinigte Scout-Ansicht `scoutProfiles`), inklusive der Listenabfragen mit `playerId`-Filter.

`invite-claim.test.mjs`: Einmalverbrauch von Einladungscodes (SCRUM-77) – gültiger Erst-Claim, zweiter Claim,
fehlender/abgelaufener Code, falscher Spieler/Rolle, parallele Claims und die unveränderten Trainer-Wege.
