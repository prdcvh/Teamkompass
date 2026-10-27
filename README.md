# Teamkompass

TeamKompass ist eine responsive Mannschaftsverwaltung für Planung, Spieltag,
Spielerentwicklung und datensparsame Rollenansichten. Die App liegt in
[`angular/`](angular/README.md); alle Hosting-Ziele verwenden dieselbe
Codebasis, je Team gibt es nur eine eigene Build-Konfiguration (Team-ID und
Teamname in `angular/src/environments/environment.<team>.ts`).

Firebase, Hosting-Ziele, neue Teams und Rückweg: [`FIREBASE_SETUP.md`](FIREBASE_SETUP.md).
Die frühere Alt-App (`outputs/*`, Root-Kopie) ist seit SCRUM-211 archiviert
(nur noch in der Git-Historie, siehe `FIREBASE_SETUP.md` §11).

## Qualität prüfen

```sh
npm run verify
```

Vor jedem Hosting-Deployment laufen Syntax-, Sicherheits- und Konsistenztests
sowie Lint, Build und Tests der Angular-App.

## Lizenz

Copyright (c) 2026 Pascal da Cruz von Hinüber. Alle Rechte vorbehalten. Nutzung,
Kopie und Weitergabe sind ohne schriftliche Erlaubnis nicht gestattet, siehe
[`LICENSE`](LICENSE).
