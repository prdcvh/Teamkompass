# TeamKompass (Angular)

TeamKompass (Jira-Epic SCRUM-40). Die einzige App im Repo: Bei jedem Merge nach `main` wird sie je Team gebaut
und auf alle vier Hosting-Ziele veröffentlicht (Tabelle unten), der Standard-Build (Testteam `teamId: U14`) auf
https://teamkompass-u14.web.app/. Die frühere Alt-App (`outputs/*`, Repo-Root) ist seit SCRUM-211 archiviert
(`FIREBASE_SETUP.md` §11).

## Befehle

```bash
npm start          # Entwicklungsserver auf http://localhost:4200/
npm run lint       # ESLint (ng lint)
npm run build      # Produktions-Build nach dist/
npm run build:teams # Builds je Live-Team (mein-team, U15, U17) nach dist/team-<team>/
npm test           # Unit-Tests (Vitest), einmalig: npm test -- --watch=false
```

Aus dem Repo-Root prüft `npm run verify` die Repo-Tests (`tests/*.test.mjs`) und Angular zusammen (Lint, Build, Tests).

Paritätsliste, PWA/Update-Verhalten und Ablauf des (abgeschlossenen) Umstiegs der Live-Teams: [CUTOVER.md](CUTOVER.md).
Der Service Worker ist nur im Produktions-Build aktiv (`npm start` läuft ohne).

## Builds je Team

Der Standard-Build (`npm run build`) ist das Testteam `U14` und ist das, was nach
`teamkompass-u14` deployt wird. Für den Umstieg der Live-Teams (SCRUM-76) gibt es je Team eine
Build-Konfiguration, die nur Team-ID/-Name (`src/environments/environment.<team>.ts`) und das
App-Manifest (`teams/<team>/manifest.webmanifest`) austauscht:

| Konfiguration | Team-ID     | heute live in            | Ausgabe              |
| ------------- | ----------- | ------------------------ | -------------------- |
| (Standard)    | `U14`       | – (Test, teamkompass-u14) | `dist/teamkompass-angular/` |
| `mein-team`   | `mein-team` | Ziel `main`, teamkompass-b8aac (seit SCRUM-208) | `dist/team-mein-team/` |
| `u15`         | `U15`       | Ziel `u15`, teamkompass-u15 (seit SCRUM-210) | `dist/team-u15/`     |
| `u17`         | `U17`       | Ziel `u17`, teamkompass-u17 (seit SCRUM-169) | `dist/team-u17/`     |

Bauen: `ng build -c production,u17`. Diese Builds sprechen **echte Teamdaten** an; es gibt
bewusst keine `ng serve`-Konfiguration dafür. Das Hosting-Ziel `u17` zeigt seit SCRUM-169 auf
`dist/team-u17/browser`, das Hosting-Ziel `main` (Haupt-Team) seit SCRUM-208 auf `dist/team-mein-team/browser`
und das Hosting-Ziel `u15` seit SCRUM-210 auf `dist/team-u15/browser` (Rückweg: `FIREBASE_SETUP.md` §11).
Ein neues Team braucht eine Zeile mehr in `angular.json`, `environment.<team>.ts`,
`teams/<team>/manifest.webmanifest` und `build:teams`, dazu Hosting-Ziel und Deploy-Schritt
(`FIREBASE_SETUP.md` §6).

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

## Firebase-SDK: gebündelt, kein CDN (SCRUM-118, SCRUM-120)

Das Firebase-SDK kommt ausschließlich über npm (`firebase` in `package.json`) und wird vom Build in die
eigenen JS-Dateien gebündelt. Die App lädt **kein** Skript von `gstatic.com` oder einem anderen fremden Host;
die Content-Security-Policy in `firebase.json` hat deshalb für alle Hosting-Ziele `script-src 'self'`
(`connect-src` für Firestore/Auth bleibt unverändert). Die Anmeldung nutzt nur E-Mail/Passwort und den
Code-Login (kein Popup/Redirect, kein reCAPTCHA); die entsprechenden Fremd-URLs (`apis.google.com`,
`www.google.com/recaptcha`) stehen nur als ungenutzter Code im SDK. Einzige geplante Ausnahme ist App Check
(SCRUM-181, aktuell aus): beim Einschalten muss `script-src` bewusst erweitert werden (`FIREBASE_SETUP.md`).

**Neue SDK-Version einspielen:** in `angular/` `npm install firebase@<version>` (bzw. `npm update firebase`),
danach im Repo-Root `npm run verify` und PR wie gewohnt; die Dateien liegen nicht im Repo, es gibt nichts
von Hand zu kopieren und keine Versionsnummer in einer CDN-URL. Ein Test in `tests/project.test.mjs` stellt sicher,
dass `script-src` überall nur `'self'` ist und kein `gstatic`-Import im Angular-Code steht.

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

## Wetter, Kleidung, Erinnerung

Architektur, Blaze-/Budget-Hinweis, geplantes Function-Deployment und die Schwellenwerte der Kleidungsempfehlung:
[`docs/wetter-kleidung-erinnerung.md`](../docs/wetter-kleidung-erinnerung.md).
