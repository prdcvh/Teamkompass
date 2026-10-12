# Firestore-Regeln: Emulator-Tests

Prüfen die Regeln in `firestore.rules` gegen den lokalen Firestore-Emulator (keine echten Daten,
Projekt-ID `demo-…`). Nicht Teil von `npm run verify`, weil der Emulator Java und einen
Download (~60 MB) braucht.

```bash
cd tests/rules
npm install
npm test
```

Aktuell abgedeckt: Einmalverbrauch von Einladungscodes (SCRUM-77) – gültiger Erst-Claim,
zweiter Claim, fehlender/abgelaufener Code, falscher Spieler/Rolle, parallele Claims und die
unveränderten Trainer-Wege.
