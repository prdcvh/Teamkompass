# TeamKompass (Angular)

Angular-Neubau von TeamKompass (Jira-Epic SCRUM-40). Wird getrennt von den Live-Kopien
(Repo-Root, `outputs/*`) gebaut und ist noch nicht ausgerollt. Testteam: `teamId: U14`.

## Befehle

```bash
npm start          # Entwicklungsserver auf http://localhost:4200/
npm run lint       # ESLint (ng lint)
npm run build      # Produktions-Build nach dist/
npm test           # Unit-Tests (Vitest), einmalig: npm test -- --watch=false
```

Aus dem Repo-Root prüft `npm run verify` Live-Kopien und Angular zusammen (Lint, Build, Tests).

## Code-Struktur: eine Datei = ein Thema

- **Eine Datei hat genau ein fachliches Thema** (z. B. Kader, Events, Aufstellung, Gegner,
  Bewertungen, Abwesenheiten). Wer ein Thema sucht, findet es an einer Stelle; wer eine Datei
  öffnet, muss nicht an fremden Themen vorbeilesen.
- **Höchstens 300 Zeilen pro `.ts`-Datei** (ohne Leer- und Kommentarzeilen). ESLint (`max-lines`)
  meldet größere Dateien. Bis die Aufteilung (SCRUM-107 bis SCRUM-113) fertig ist, ist das eine
  Warnung; mit SCRUM-113 wird es ein Fehler. Wird eine Datei zu groß, nach Fachthema teilen —
  nicht nach „Teil 1/Teil 2“.
- **Tests liegen neben dem Code**: `foo.ts` → `foo.spec.ts` im selben Ordner. Für Testdateien gilt
  dieselbe Grenze; große Spezifikationen werden mit ihrem Code mit aufgeteilt.
- **Reine Logik und Angular-Dienste getrennt**: reine Funktionen (`player.ts`, `lineup.ts`, …) ohne
  Angular/Firebase, Dienste (`*.service.ts`) für Zustand und Speichern.

Zielstruktur unter `src/app/`:

```
core/            fachliche Logik und Dienste, nach Thema in Unterordnern
  firebase/      Verbindung, Anmeldung, Zugänge (SCRUM-108)
  squad/ events/ lineup/ opponents/   Firestore-Zugriff + Logik je Thema (SCRUM-109)
  ratings/ notes/ records/            Bewertungen, Notizen, Spieler-Unterdaten (SCRUM-110/111)
  testing/       gemeinsame Test-Hilfen, nach Thema aufgeteilt
pages/<seite>/   eine Komponente je Seite (Template, Styles, Test daneben)
shell/           Rahmen: Seitenleiste, Tab-Leiste, Mehr-Menü
ui/              wiederverwendbare Basis-Bausteine (Button, Karte, Dialog, …)
```

Die Ordner unter `core/` entstehen schrittweise mit den Tickets der Reihe; bis dahin liegen die
Dateien noch flach in `core/`.

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
