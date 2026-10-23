# TeamKompass (Angular)

Angular-Neubau von TeamKompass (Jira-Epic SCRUM-40). Wird getrennt von den Live-Kopien
(Repo-Root, `outputs/*`) gebaut und bei jedem Merge nach `main` auf https://teamkompass-u14.web.app/
veröffentlicht (Hosting-Target `u14`). Testteam: `teamId: U14`.

## Befehle

```bash
npm start          # Entwicklungsserver auf http://localhost:4200/
npm run lint       # ESLint (ng lint)
npm run build      # Produktions-Build nach dist/
npm run build:teams # Builds je Live-Team (mein-team, U15, U17) nach dist/team-<team>/
npm test           # Unit-Tests (Vitest), einmalig: npm test -- --watch=false
```

Aus dem Repo-Root prüft `npm run verify` Live-Kopien und Angular zusammen (Lint, Build, Tests).

Paritätsliste, PWA/Update-Verhalten und Ablaufplan für den Umstieg der Live-Teams: [CUTOVER.md](CUTOVER.md).
Der Service Worker ist nur im Produktions-Build aktiv (`npm start` läuft ohne).

## Builds je Team

Der Standard-Build (`npm run build`) ist das Testteam `U14` und ist das, was nach
`teamkompass-u14` deployt wird. Für den Umstieg der Live-Teams (SCRUM-76) gibt es je Team eine
Build-Konfiguration, die nur Team-ID/-Name (`src/environments/environment.<team>.ts`) und das
App-Manifest (`teams/<team>/manifest.webmanifest`) austauscht:

| Konfiguration | Team-ID     | heute live in            | Ausgabe              |
| ------------- | ----------- | ------------------------ | -------------------- |
| (Standard)    | `U14`       | – (Test, teamkompass-u14) | `dist/teamkompass-angular/` |
| `mein-team`   | `mein-team` | `outputs/team-manager`   | `dist/team-mein-team/` |
| `u15`         | `U15`       | `outputs/u15`            | `dist/team-u15/`     |
| `u17`         | `U17`       | **diese Angular-App** (seit SCRUM-169, Rückweg `outputs/u17`) | `dist/team-u17/`     |

Bauen: `ng build -c production,u17`. Diese Builds sprechen **echte Teamdaten** an; es gibt
bewusst keine `ng serve`-Konfiguration dafür. Das Hosting-Ziel `u17` zeigt seit SCRUM-169 auf
`dist/team-u17/browser` (Rückweg: `FIREBASE_SETUP.md` §11); `mein-team` und `u15` laufen noch auf der alten
App. Umstellen weiterer Live-Teams nur mit PO-Freigabe (Ablaufplan in SCRUM-76). Ein neues Team braucht eine Zeile mehr
in `angular.json`, `environment.<team>.ts`, `teams/<team>/manifest.webmanifest` und `build:teams`.

## Code-Struktur: eine Datei = ein Thema

- **Eine Datei hat genau ein fachliches Thema** (z. B. Kader, Events, Aufstellung, Gegner,
  Bewertungen, Abwesenheiten). Wer ein Thema sucht, findet es an einer Stelle; wer eine Datei
  öffnet, muss nicht an fremden Themen vorbeilesen.
- **Höchstens 300 Zeilen pro `.ts`-Datei** (ohne Leer- und Kommentarzeilen). ESLint (`max-lines`)
  bricht bei größeren Dateien mit einem Fehler ab. Wird eine Datei zu groß, nach Fachthema teilen —
  nicht nach „Teil 1/Teil 2“. Für CSS, HTML und Tests gilt dieselbe Grenze als Richtwert.
- **Tests liegen neben dem Code**: `foo.ts` → `foo.spec.ts` im selben Ordner. Für Testdateien gilt
  dieselbe Grenze; große Spezifikationen werden mit ihrem Code mit aufgeteilt.
- **Reine Logik und Angular-Dienste getrennt**: reine Funktionen (`player.ts`, `lineup.ts`, …) ohne
  Angular/Firebase, Dienste (`*.service.ts`) für Zustand und Speichern.

Struktur unter `src/app/`:

```
core/            fachliche Logik und Dienste, nur Fachordner (keine losen Dateien):
  access/        Zugänge (Einladungscodes, Trainer-/Scout-Konten)
  analysis/      Teamanalyse und Belastungsindikator
  auth/          Anmeldung, Sitzung, Rollen, Konto, Route-Guards
  device/        Geräte-Einstellungen, lokale Daten, Design
  events/        Events (Modell + Dienst)
  export/        Export und Datei-Ausgabe
  firebase/      Datenbankzugriff, eine Zugriffsklasse je Thema (+ types.ts)
  lineup/        Spielfeld/Formationen, automatische Aufstellung, Startelf
  opponents/     Gegnerprofile
  player/        Spieler-Modell, Kaderliste, Kader-Dienst
  profile/       Spielerprofil und Profilbericht
  ratings/       Bewertungen
  records/       Förderpläne, Abwesenheiten, Verfügbarkeit, Messwerte
  shared/        allgemeine Hilfen (Datum)
  shell/         App-Rahmen: Navigation, Layout, Sync-Status, globale Suche
  team/          Team-Kennzahlen
  testing/       Test-Attrappen, je Zugriffsklasse eine (fake-*.api.ts);
                 FakeFirebase + provideFakeFirebase bündeln sie für TestBed
                 (Ordner `testing/` gehören nicht zum App-Build, siehe tsconfig.app.json)
pages/<seite>/   eine Komponente je Seite (Template, Styles, Test daneben); große Seiten haben
                 mehrere Stylesheets (`styleUrls`, Reihenfolge = Kaskade) und mehrere Specs
shell/           Rahmen: Seitenleiste, Tab-Leiste, Mehr-Menü
ui/              wiederverwendbare Basis-Bausteine (Button, Karte, Dialog, …)
```

Ein Dienst injiziert nur die Zugriffsklassen, die er braucht (z. B. `SquadService` nur `PlayersApi`).
Neue Dateien kommen in den passenden Fachordner; passt keiner, einen neuen anlegen statt sie lose
in `core/` abzulegen.

**Achtung beim Aufteilen von Stylesheets:** Angular benennt `@keyframes` je Stylesheet um. Eine
`animation`, die eine Keyframe-Animation aus einer anderen Datei nutzt, läuft dann ins Leere. Name und
Zuweisung gehören in dieselbe Datei (siehe `pages/login/login-motion.css`).

## Abhängigkeiten und `npm audit` (SCRUM-56)

Stand 2026-10-06: `piscina` (kritisch, Build-Tooling über `@angular/build`) und `http-cache-semantics`
sind per `npm audit fix` auf gepatchte Versionen im Lockfile angehoben (keine Major-Wechsel). Ein
Test in `tests/project.test.mjs` verhindert, dass `piscina` im Lockfile wieder auf eine betroffene
Version (5.0.0 bis 5.3.1) zurückfällt.

**Akzeptierte Ausnahme: `@grpc/grpc-js` (4 hohe Meldungen, Pfad `firebase` → `@firebase/firestore`).**
- Beide Advisories (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4) betreffen den gRPC-**Server**
  (`getAuthContext`, Fehlertexte von Server-Handlern). TeamKompass betreibt keinen gRPC-Server.
- Im Produktions-Bundle ist `@grpc/grpc-js` nicht enthalten (Browser-Build von Firestore nutzt
  WebChannel/Fetch); im gebauten Bundle kommt nur der Optionsname `grpcFlowControlWindow` vor.
- Die Abhängigkeit ist in der aktuellen Firebase-Version (12.19.0) per `~1.9.0` festgenagelt; der von
  npm vorgeschlagene Fix (`firebase@9.14.0`) wäre ein Major-Downgrade und wird bewusst nicht angewendet.
- Neu bewerten, sobald eine neue Firebase-Version `@grpc/grpc-js` ≥ 1.13.6 erlaubt.

## Component-Style-Budget

`anyComponentStyle` warnt ab 6 kB (Fehler ab 8 kB). Die Grenze wurde in SCRUM-82/SCRUM-85
bewusst von 4 kB auf 6 kB angehoben: Login (~5,4 kB) und Profil (~4,4 kB) sind
Seiten mit vielen Zuständen und Mobil-/Desktop-Varianten; das CSS ließ sich ohne Risiko
für das Erscheinungsbild nicht ohne Weiteres kürzen. Wächst eine Komponente über 6 kB,
zuerst gemeinsame Regeln in Tokens/Basis-Komponenten verschieben, bevor das Budget erneut steigt.
