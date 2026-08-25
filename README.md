# Teamkompass

TeamKompass ist eine responsive Mannschaftsverwaltung für Planung, Spieltag,
Spielerentwicklung und datensparsame Rollenansichten. Die drei Hosting-Ziele
verwenden dieselbe App-Basis; Teamname und Team-ID liegen ausschließlich in der
jeweiligen `firebase-config.js`.

## Qualität prüfen

```sh
npm run verify
```

Vor jedem Hosting-Deployment laufen Syntax-, Sicherheits- und Konsistenztests.
Hinweise zum sicheren Rollout der Einmal-Einladungen stehen in
`NEXT_LEVEL_UPGRADE.md`.
