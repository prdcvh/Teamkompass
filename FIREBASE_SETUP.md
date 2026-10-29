# Firebase-Setup fuer TeamKompass

TeamKompass ist die Angular-App in `angular/`. Alle Teams nutzen dasselbe Firebase-Projekt
`teamkompass-b8aac`; getrennt wird ueber die `teamId` (Pfad `teams/<teamId>/...`). Jedes Team hat eine eigene
Build-Konfiguration und ein eigenes Hosting-Ziel (`angular/README.md`, Abschnitt "Builds je Team").

Die fruehere Alt-App (`outputs/*` und die Root-Kopie `index.html`/`app.js`/`styles.css`) ist seit SCRUM-211
archiviert: Sie liegt nur noch in der Git-Historie, Rueckweg siehe Abschnitt 11.

## 1. Firebase-Projekt anlegen

1. Firebase Console oeffnen.
2. Neues Projekt erstellen.
3. Eine Web-App registrieren.
4. Die Firebase-Konfiguration kopieren.
5. Cloud Firestore aktivieren.

## 2. App konfigurieren

- `angular/src/environments/firebase.ts`: die Firebase-Web-Konfiguration (oeffentlich, kein Geheimnis; der
  Zugriffsschutz liegt in `firestore.rules`) und der optionale App-Check-Schluessel (Abschnitt 10).
- `angular/src/environments/environment.ts`: Standard-Build = Testteam `U14` (Hosting-Ziel `u14`).
- `angular/src/environments/environment.<team>.ts`: je Live-Team `teamId`, `clubName`, `teamLabel`, `teamName`;
  eingebunden ueber die gleichnamige Build-Konfiguration in `angular/angular.json`.

`teamId` ist der gemeinsame Datenraum. Alle Geraete mit derselben `teamId` sehen dieselben Daten.

## 3. Firestore-Pfad ohne Rollen (nur Alt-App, archiviert)

Den Modus ohne Anmeldung (ganzer Team-Stand in einem Dokument `teams/{teamId}/appState/current`) gab es nur in
der Alt-App. Die Angular-App arbeitet immer mit Anmeldung und Rollen (Abschnitt 5).

## 4. Einfache Test-Regeln (entfallen)

Gehoerten zum Modus aus Abschnitt 3 und sind mit der Alt-App entfallen. Es gelten immer die Regeln aus
`firestore.rules`.

## 5. Rollen und Anmeldung (Trainer sieht alles, Spieler nur das eigene Profil)

Datenmodell und Zugriffsregeln liegen in `firestore.rules` im Repo-Root. Bei jedem Push nach `main`, der die
Datei aendert, deployt `.github/workflows/firestore-rules-deploy.yml` sie automatisch.

**Firestore-Index fuer die Teamsuche (SCRUM-225):** Die App sucht die Teams eines Kontos per
`collectionGroup('members')` + `where('uid', '==', uid)`. Das braucht einen Einzelfeld-Index mit Collection-Group-Scope
(`firestore.indexes.json`, Feld-Override `members.uid`: die Standardindizes des Feldes plus `COLLECTION_GROUP` ASC; im
Emulator ist kein Index noetig). Er steht in `firebase.json` unter `firestore.indexes` und wird vom selben Workflow wie
die Regeln deployt (`--only firestore:rules,firestore:indexes`, auch bei Aenderung von `firestore.indexes.json`).
Nach dem ersten Deploy baut Firebase den Index einige Minuten; bis dahin greift der dokumentierte Rueckfall auf das
Team des Builds. Pruefen: Firebase Console -> Firestore -> Indizes -> Einzelfeld (`members`, `uid`, Collection group).
Der Workflow nutzt bewusst **kein** `--force`: Indizes, die nur in der Konsole existieren, werden nicht geloescht; im
nicht-interaktiven Modus (CI) fragt die CLI nicht nach, sondern laesst sie stehen und weist im Log darauf hin.
Manuell: `firebase deploy --only firestore:indexes`.

Trainer-Konten entstehen **nie ohne Erlaubnis**: entweder als allererstes Konto manuell in der Firebase-Konsole
(Bootstrap, unten), durch einen angemeldeten Trainer in der App oder ueber einen Einladungscode bei der
Registrierung (Abschnitt 10).

**Einmalige Einrichtung eines Teams ohne Registrierung (Bootstrap):**

1. Firebase Console -> Authentication -> Sign-in-Methode: **E-Mail/Passwort** UND
   **Anonym** aktivieren.
2. `firestore.rules` deployen (passiert beim Merge nach `main` automatisch; manuell:
   `firebase deploy --only firestore:rules`).
3. Erstes Trainer-Konto manuell anlegen:
   - Firebase Console -> Authentication -> Tab "Users" -> "Nutzer hinzufuegen" ->
     E-Mail + Passwort eingeben. Firebase zeigt danach die generierte **Nutzer-ID (UID)**
     an - die brauchst du im naechsten Schritt.
   - Firebase Console -> Firestore Database -> Daten -> zur Collection
     `teams/{teamId}/members` navigieren (bzw. neu anlegen) -> Dokument mit der
     **Dokument-ID = die eben kopierte UID** anlegen, darin ein Feld `role` (Typ String,
     Wert `trainer`) anlegen.
4. Die App oeffnen und mit dieser E-Mail/Passwort-Kombination anmelden.
5. Alles Weitere legt der Trainer in der App an: Spieler- und Eltern-Einladungen (Einmal-Codes, optional
   befristet) unter "Spieler-Zugaenge", weitere Trainer, Scout- und Medizin-Zugaenge unter "Trainer-Konto
   anlegen", "Scout-Zugang anlegen" und "Medizin-Zugang anlegen".

**Datenmodell (Auszug):**

```txt
teams/{teamId}/members/{uid}                         # Rolle + ggf. playerId je Nutzer
teams/{teamId}/invites/{code}                        # Einmal-Einladungscodes fuer Spieler/Eltern
teams/{teamId}/players/{playerId}
teams/{teamId}/players/{playerId}/developmentPlans/{planId}
teams/{teamId}/events/{eventId}                      # Titel/Datum/Ergebnis, keine Noten
teams/{teamId}/events/{eventId}/ratings/{playerId}   # individuelle Bewertung
teams/{teamId}/opponents/{opponentId}
```

Vollstaendig und verbindlich: `firestore.rules` und `docs/architektur-verein-teams.md`.

## 6. Weitere Mannschaft einrichten

Das Datenmodell trennt Teams bereits vollstaendig ueber die `teamId` - Teams mit unterschiedlicher `teamId` im
selben Firebase-Projekt sehen sich gegenseitig nie. Die Firestore-Regeln sind generisch, sie brauchen fuer ein
neues Team keine Aenderung.

Neue Trainer mit eigenem Team kommen heute in der Regel ueber die Registrierung mit Einladungscode
(Abschnitt 10) in die App, ohne neuen Build. Ein **eigenes Hosting-Ziel mit fest eingebautem Team** (wie
`main`, `u15`, `u17`) braucht dagegen:

1. Angular-Build-Konfiguration (`angular/README.md`, "Builds je Team"): eine Konfiguration in
   `angular/angular.json`, `angular/src/environments/environment.<team>.ts`,
   `angular/teams/<team>/manifest.webmanifest` und einen Eintrag in `build:teams` (`angular/package.json`).
2. Hosting-Ziel: Eintrag in `.firebaserc` (`targets.teamkompass-b8aac.hosting.<ziel>`) und in `firebase.json`
   (`"public": "angular/dist/team-<team>/browser"`, Header und Rewrite wie bei `u14`).
3. Merge-Workflow `.github/workflows/firebase-hosting-merge.yml`: im Verify-Job den Build als Artefakt hochladen,
   im Deploy-Job an genau den `public`-Pfad herunterladen und einen Deploy-Schritt `target: <ziel>` anlegen.
4. **Keine** PR-Vorschau fuer ein Team mit echten Daten (`tests/preview-guard.test.mjs`, SCRUM-206).
5. Optional das Team in `scripts/assign-clubs-lib.mjs` (`TEAMS`) eintragen (Abschnitt 9).

**Einmalig, nur in der Firebase-Konsole (nicht per Code moeglich). Am Beispiel `teamkompass-u16`:**

1. Firebase Console -> Hosting -> "Website hinzufuegen" -> Site-ID `teamkompass-u16` vergeben
   (oder per Firebase-CLI: `firebase hosting:sites:create teamkompass-u16 --project teamkompass-b8aac`).
   Ist die gewuenschte Site-ID bereits vergeben, eine andere waehlen und in `.firebaserc` eintragen.
2. Erstes Trainer-Konto fuer das Team anlegen (Abschnitt 5, Schritt 3, mit der neuen `teamId`).
3. Erst NACHDEM Schritt 1 erledigt ist den PR nach `main` mergen - vorher schlaegt der neue Deploy-Schritt bei
   jedem Merge nach `main` fehl, weil die Site noch nicht existiert. Danach ist das Team unter
   `https://teamkompass-u16.web.app` erreichbar (URL haengt von der vergebenen Site-ID ab).


## 7. Daten in ein neues Team kopieren (`scripts/copy-team.mjs`)

Kopiert rekursiv alles unter `teams/<quelle>` nach `teams/<ziel>`: Spieler samt
Entwicklungsplaenen/Abwesenheiten/Messwerten, Events samt Bewertungen, Gegner, `meta/*`,
`members` (gleiche Auth-UIDs, bestehende Trainer-Logins funktionieren also auch im Ziel) und
`invites`. Typen (Timestamps usw.) bleiben erhalten, Dokument-Referenzen werden auf das Zielteam
umgebogen. Die **Quelle wird nie veraendert**. Gedacht fuer die Test-Instanz
(`mein-team` -> `U14`); das Live-Team bleibt auf `mein-team`.

Ausfuehrung nur durch den Product Owner (braucht Admin-Zugang):

1. Firebase Console -> Projekteinstellungen -> Dienstkonten -> "Neuen privaten Schluessel generieren".
   Die JSON-Datei **ausserhalb des Repos** ablegen (Namensmuster `service-account*.json` ist
   zusaetzlich per `.gitignore` ausgeschlossen). Nach dem Lauf loeschen bzw. den Schluessel
   in der Konsole widerrufen.
2. Einmalig: `npm install --no-save firebase-admin`
3. Trockenlauf (schreibt nichts, zeigt Anzahl je Collection):
   `GOOGLE_APPLICATION_CREDENTIALS=/pfad/key.json node scripts/copy-team.mjs mein-team U14 --dry-run`
4. Echter Lauf: gleicher Aufruf ohne `--dry-run`. Ist `teams/U14` schon belegt, bricht das
   Skript ab; fuer den erneuten Abgleich beim Cutover `--overwrite` anhaengen
   (gleichnamige Dokumente werden ueberschrieben, zusaetzliche Ziel-Dokumente bleiben bestehen).


## 8. Angular-Instanz U14 (`angular/`, Hosting-Target `u14`)

Die Angular-Neuentwicklung (Jira-Epic SCRUM-40) wird als eigene Hosting-Site
`teamkompass-u14` veroeffentlicht, getrennt von den Live-Teams. Sie nutzt `teamId: "U14"`
(`angular/src/environments/environment.ts`), nie `mein-team`.

- `.firebaserc` / `firebase.json`: Target `u14` -> Site `teamkompass-u14`, Public =
  `angular/dist/teamkompass-angular/browser` (Output von `npm --prefix angular run build`),
  SPA-Rewrite auf `/index.html`, dieselben Security-Header wie die anderen Targets.
  Gehashte Dateien (`main-*.js`, `chunk-*.js`, `styles-*.css`, `media/*`) sind ein Jahr
  cachebar (`immutable`), alles andere inkl. `index.html` wird immer revalidiert.
- `angular.json`: `inlineCritical: false`, weil Angulars Inline-`onload` fuer kritisches CSS
  unter der CSP (`script-src 'self'`) blockiert wuerde und die Seite sonst ungestylt bliebe.
- `.github/workflows/firebase-hosting-merge.yml`: Der Angular-Build laeuft bereits in
  `npm run verify`; danach deployt ein eigener Schritt `target: u14` (als letzter Schritt,
  damit ein Problem dort die Live-Teams nicht aufhaelt).
- Pull-Request-Vorschau (seit SCRUM-206): jeder PR bekommt eine Vorschau des Angular-Standard-Builds
  (Testteam `U14`) auf `teamkompass-u14--pr<Nr>-<branch>.web.app`. Eine Vorschau darf nie den Build eines
  Live-Teams (`U17`, `mein-team`, `U15`) ausliefern; `tests/preview-guard.test.mjs` prueft dafuer jeden
  Deploy-Schritt in `firebase-hosting-pull-request.yml` (Ziel, Build, Team-ID, Projekt-ID), ohne Ausnahme.
- Alt-App-Vorschau: gibt es seit SCRUM-210 nicht mehr, seit SCRUM-211 ist die Alt-App archiviert (Abschnitt 11).
  `main`, `u15` und `u17` sind Live-Sites mit echten Daten und bekommen keine Vorschau. Anmeldung in der
  U14-Vorschau mit einem Trainer-Konto, das unter `teams/U14/members` eingetragen ist (beim Kopieren aus
  mein-team mitkopiert). Achtung: U14 liegt im selben Firebase-Projekt und enthaelt von `mein-team` kopierte
  Daten (Abschnitt 7).
- PWA (SCRUM-76): Manifest `angular/public/manifest.webmanifest`, Service Worker von Angular
  (`angular/ngsw-config.json`, nur im Produktions-Build). `ngsw.json`/`ngsw-worker.js` fallen unter
  die `no-cache`-Regel `**`, Updates kommen also sofort an (Hinweis "Neue Version verfuegbar").

**Einmalig vor dem Merge (nur Product Owner):**
1. Site anlegen: `firebase hosting:sites:create teamkompass-u14 --project teamkompass-b8aac`
   (oder Firebase Console -> Hosting -> "Website hinzufuegen").
2. Daten kopieren (Abschnitt 7): `node scripts/copy-team.mjs mein-team U14`.
3. Erst danach den PR nach `main` mergen; vorher schlaegt der neue Deploy-Schritt bei jedem
   Merge fehl. Die App ist danach unter `https://teamkompass-u14.web.app` erreichbar.


## 9. Teams einem Verein zuordnen (`scripts/assign-clubs.mjs`, SCRUM-180)

Datenmodell und Regeln: `docs/architektur-verein-teams.md`. Das Einmal-Skript legt die Vereine
`clubs/fc-koenigstein` (1. FC Koenigstein: `mein-team`, `U15`, `U17`) und `clubs/test-verein`
(Angular-Testteam `U14`) an, traegt dein Konto als einzigen Vereinsadmin ein, setzt in den vier
Team-Dokumenten `clubId`, `name`, `label`, `hasTrainer: true` und schreibt in jedes `members`-Dokument das
Feld `uid` (= Dokument-ID). Es zieht **nichts um**, loescht nichts, ueberschreibt keine vorhandenen Felder
und aendert keine Rolle. Es kann gefahrlos mehrfach laufen.

Reihenfolge: erst die neuen Regeln deployen (Merge des PR), dann das Skript.

Ausfuehrung nur durch den Product Owner (braucht Admin-Zugang):

1. Dienstkonto-Schluessel wie in Abschnitt 7, Schritt 1 (ausserhalb des Repos ablegen, danach loeschen).
2. Einmalig: `npm install --no-save firebase-admin`
3. Deine UID: Firebase Console -> Authentication -> Nutzer -> Spalte "Nutzer-UID" deines Trainer-Kontos.
4. **Probelauf (Standard, schreibt nichts)** – zeigt, was geschrieben wuerde:
   `GOOGLE_APPLICATION_CREDENTIALS=/pfad/key.json node scripts/assign-clubs.mjs --admin-uid <DEINE-UID>`
5. Echter Lauf: gleicher Aufruf mit `--apply` am Ende.
6. Kontrolle in der Firebase Console: `clubs/fc-koenigstein`, `teams/mein-team` (Felder `clubId` usw.).

Gehoert ein Team schon zu einem anderen Verein, bricht das Skript ab und schreibt nichts. Spaeter
hinzugefuegte Teams (Abschnitt 6) bitte in `scripts/assign-clubs-lib.mjs` (`TEAMS`) eintragen und das
Skript erneut laufen lassen. Mitglieder ohne `uid`-Feld (z. B. frueher von der Alt-App angelegt) ergaenzt
ein erneuter Lauf.


## 10. Registrierung nur mit Einladung (`scripts/create-club-invite.mjs`, SCRUM-181)

Neue Trainer registrieren sich selbst in der Angular-App (`https://teamkompass-u14.web.app/registrieren`),
aber **nur mit einem Einladungscode**. Es gibt zwei Arten:

| Code | Wer legt ihn an | Was der Einloesende bekommt |
|---|---|---|
| Vereinscode | nur der PO, per Skript | neuer Verein (er wird Vereinsadmin) + erstes Team (er wird Trainer) |
| Beitrittscode | Vereinsadmin in der App (Einstellungen → „Verein“) oder PO per Skript mit `--club` | neues Team im bestehenden Verein (er wird Trainer, **nicht** Vereinsadmin) |

Ein Code gilt **einmal**, laeuft ab (Standard 14 Tage), kann an eine E-Mail-Adresse gebunden werden und
funktioniert nur mit **bestaetigter** E-Mail-Adresse. Die Regeln (`firestore.rules`, Abschnitt `clubInvites`)
erzwingen das; Tests: `tests/rules/registration.test.mjs`.

### Vorher einmalig in der Firebase Console

1. **Authentication → Anmeldemethode → E-Mail/Passwort**: muss aktiviert sein (ist es fuer die Trainer schon).
2. **Authentication → Einstellungen → Autorisierte Domains**: `teamkompass-u14.web.app` muss drinstehen (die
   `*.web.app`/`*.firebaseapp.com`-Adressen des Projekts stehen normalerweise schon drin). Fuer Vorschau-Links
   nicht noetig: die Bestaetigungsmail kommt dann ohne Ruecksprung-Link, man oeffnet die Registrierung selbst wieder.
3. Optional **Authentication → Vorlagen → E-Mail-Adressbestaetigung**: Absendername/Text auf Deutsch anpassen.

### Code fuer einen neuen Verein erzeugen

1. Dienstkonto-Schluessel wie in Abschnitt 7, Schritt 1 (ausserhalb des Repos ablegen, danach loeschen).
2. Einmalig: `npm install --no-save firebase-admin`
3. **Probelauf (Standard, schreibt nichts):**
   `GOOGLE_APPLICATION_CREDENTIALS=/pfad/key.json node scripts/create-club-invite.mjs --email trainer@verein.de`
4. Echter Lauf: gleicher Aufruf mit `--apply` am Ende. Das Skript zeigt Code und Link, z. B.
   `https://teamkompass-u14.web.app/registrieren?code=ABCD…`. Den Link nur an diese eine Person schicken.

Optionen: `--days <1-60>` (Gueltigkeit), `--club <vereinsId>` (Beitrittscode statt neuer Verein),
`--note "<Notiz>"`, `--base-url https://…` (andere Adresse im Link). Ohne `--email` gilt der Code fuer jede
bestaetigte Adresse – dann wie ein Passwort behandeln.

### App Check (Schutz vor Missbrauch) – vorbereitet, aber aus

Die App startet App Check nur, wenn in `angular/src/environments/firebase.ts` ein Schluessel in `appCheckSiteKey`
steht (heute leer = aus). Zum Einschalten:

1. Google Cloud Console → **reCAPTCHA** → Schluessel anlegen (Typ „Website“, Domain `teamkompass-u14.web.app`
   und ggf. weitere Hosting-Adressen).
2. Firebase Console → **App Check** → Web-App → Anbieter **reCAPTCHA Enterprise** → Schluessel eintragen.
3. Schluessel in `appCheckSiteKey` eintragen und in `firebase.json` (Ziel `u14`) die Content-Security-Policy
   erweitern: `script-src` um `https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`,
   `frame-src https://www.google.com/recaptcha/`, `connect-src` um `https://content-firebaseappcheck.googleapis.com`.
4. Einige Tage unter App Check → **Messwerte** beobachten. Seit SCRUM-210 läuft keine Alt-App mehr live (seit
   SCRUM-211 archiviert). Nach einem Rückweg auf die Alt-App (Abschnitt 11) **nicht „Erzwingen“ einschalten** – sie
   sendet kein App-Check-Token und wäre sonst ausgesperrt.

Bis dahin begrenzt die Einladungspflicht neue Konten: ohne Code entsteht kein Verein und kein Team; ein Konto ohne
Code sieht nichts.

## 11. Live-Teams auf Angular und Rückweg (Rollback)

Alle Hosting-Ziele liefern einen Angular-Build aus; jeder Merge nach `main` deployt alle vier
(`.github/workflows/firebase-hosting-merge.yml`):

| Ziel | Site | Build | Team-ID | seit |
|---|---|---|---|---|
| `main` | `teamkompass-b8aac` (https://teamkompass-b8aac.web.app) | `ng build -c production,mein-team` → `angular/dist/team-mein-team/browser` | `mein-team` (echte Daten) | SCRUM-208 |
| `u17` | `teamkompass-u17` (https://teamkompass-u17.web.app) | `ng build -c production,u17` → `angular/dist/team-u17/browser` | `U17` (echte Daten) | SCRUM-169 |
| `u15` | `teamkompass-u15` (https://teamkompass-u15.web.app) | `ng build -c production,u15` → `angular/dist/team-u15/browser` | `U15` (echte Daten) | SCRUM-210 |
| `u14` | `teamkompass-u14` (https://teamkompass-u14.web.app) | Standard-Build → `angular/dist/teamkompass-angular/browser` | `U14` (Testteam) | SCRUM-40 |

- Daten (`teams/<teamId>/...`), Anmeldungen und Firestore-Regeln sind dieselben wie zu Zeiten der Alt-App.
- Merge-Workflow: der Verify-Job baut alle Builds (`npm run verify`) und lädt sie als Artefakte hoch
  (`angular-dist`, `angular-dist-mein-team`, `angular-dist-u17`, `angular-dist-u15`); der Deploy-Job legt sie an
  genau den `public`-Pfad zurück und deployt `target: main`, `u17`, `u15`, `u14`.
- PR-Vorschau: nur der Testteam-Build auf `teamkompass-u14` (Abschnitt 8). `main`, `u15` und `u17` haben echte
  Daten und bekommen keine Vorschau (SCRUM-206); man sieht ihren Stand erst nach dem Merge live. Alte
  Vorschaukanäle aller vier Sites räumt `firebase-preview-cleanup.yml` auf.

### Rückweg auf einen früheren Angular-Stand

**Sofort (Notfall, ohne Code):** Firebase Console → Hosting → betroffene Site (z. B. `teamkompass-u17`) →
Versionsverlauf → bei der letzten funktionierenden Version „Zurücksetzen“ (rollback). Wirkt sofort, wird aber
beim **nächsten Merge nach `main`** wieder überschrieben – deshalb immer auch den dauerhaften Weg gehen.

**Dauerhaft (per PR):** Den fehlerhaften Commit auf `main` per PR zurücknehmen (`git revert <commit>`),
`npm run verify`, Merge nach `main` → der Merge-Workflow baut und deployt den früheren Angular-Stand auf alle
Ziele.

#### Geübt am 27.10.2026 (SCRUM-209)

Der „Sofort“-Rückweg wurde einmal beim **Haupt-Team** (Site `teamkompass-b8aac`, echte Daten) ausprobiert:
In der Firebase Console im Release-Verlauf auf die **direkt vorherige** Version zurückgesetzt, danach wieder
auf die **neueste**. Ergebnis laut PO: alles hat funktioniert. Auf dem Handy blieb die Anmeldung nach beiden
Schritten erhalten, alle Daten waren vorhanden, keine Auffälligkeiten.

Praktische Hinweise:

- Einen ruhigen Zeitpunkt wählen (kein Training, kein Spiel): Für ein paar Minuten sehen alle Nutzer des Teams
  die vorige App-Version.
- Nur auf Releases **nach der Angular-Umstellung** des jeweiligen Ziels zurücksetzen, sonst kommt eine
  Alt-App-Version zurück. Haupt-Team (`teamkompass-b8aac`): nichts vor dem 27.10.2026, 01:08 Uhr (SCRUM-208).
  U17 (`teamkompass-u17`): Angular seit dem Merge vom 24.10.2026 (SCRUM-169, #241). U15 (`teamkompass-u15`):
  Angular seit dem Merge vom 27.10.2026, 13:24 Uhr (SCRUM-210, #260). Im Zweifel die Release-Zeitpunkte in
  der Konsole mit diesen Merge-Zeiten vergleichen.
- „Zurücksetzen“ tauscht nur die ausgelieferte App aus. Die Daten in der Datenbank, die Anmeldungen und die
  Firestore-Regeln bleiben unberührt.
- Danach wieder auf die neueste Version setzen, sonst bleibt der alte Stand bis zum nächsten Merge nach `main`
  stehen.

### Rückweg auf die archivierte Alt-App (SCRUM-211)

Die Alt-App (`outputs/team-manager` = Haupt-Team, `outputs/u15`, `outputs/u17`, dazu die Root-Kopie) ist seit
SCRUM-211 aus `main` gelöscht. **Archiv-Stand** ist der Commit
`f35a02e147b485d7eb09832e17f122483b8cd13c` (letzter Stand von `main` vor dem Löschen, „SCRUM-210: U15 auf
Angular umstellen“). Dort liegen auch die Tests der Alt-App (`tests/*.test.mjs`) und das frühere
Vorschau-Skript `scripts/legacy-preview.mjs`. Ein Rückweg ist nur noch per PR möglich und braucht die
ausdrückliche Freigabe des PO:

1. Den Ordner des Teams aus dem Archiv zurückholen, z. B. für die U17:

   ```sh
   git checkout f35a02e147b485d7eb09832e17f122483b8cd13c -- outputs/u17
   ```

   (Haupt-Team: `outputs/team-manager`, U15: `outputs/u15`.) Bei Bedarf die zugehörigen Tests ebenso, z. B.
   `git checkout f35a02e147b485d7eb09832e17f122483b8cd13c -- tests/rsvp.test.mjs`.
2. In `firebase.json` den Eintrag des Ziels durch den Hosting-Eintrag der alten App ersetzen (unten) und darin
   `target` und `public` setzen, z. B. `"target": "u17"`, `"public": "outputs/u17"`.
3. Die Tests anpassen, die das Gegenteil erwarten: „Alt-App ist archiviert …“ (SCRUM-211) und den
   Angular-Test des Teams („Live-Team U17 läuft auf dem Angular-Build …“ usw.) in `tests/project.test.mjs`,
   in `tests/preview-guard.test.mjs` die Erwartung „kein Ziel liefert die Alt-App aus“. Eine PR-Vorschau für
   dieses Ziel gibt es nicht; die Vorschau-Prüfung (`scripts/preview-guard-lib.mjs`) lehnt jedes Ziel ohne
   Angular-Build ab.
4. `npm run verify`, PR, Merge nach `main` → der Merge-Workflow deployt den Alt-App-Ordner live.
5. Prüfen: Seite neu laden – die alte Oberfläche erscheint, Trainer und Spieler sind weiter angemeldet.

**Was auf den Geräten passiert:** Der Angular-Service-Worker fragt bei jedem Öffnen `ngsw.json` ab. Die
alte App hat diese Datei nicht (Antwort 404), daraufhin meldet er sich selbst ab und löscht seinen Cache;
beim nächsten Laden kommt die alte App und registriert wieder `service-worker.js`. Zeigt ein Gerät danach
dauerhaft einen Sync-Fehler (älteres Firebase-SDK mit dem Offline-Speicher der neueren Version), hilft
einmal „Website-Daten löschen“ im Browser; Daten gehen dabei nicht verloren, sie liegen in Firestore.

**Vor einem erneuten Umstieg auf Angular:** Die alte App aktualisiert die Angular-Zusammenfassungen je
Spieler (`teams/<teamId>/playerStats`, SCRUM-201) nicht. Nach dem erneuten Umstieg in Angular sofort
„Einstellungen → Zusammenfassungen → **Neu berechnen**“ drücken (oder vorher das Dokument
`teams/<teamId>/meta/playerStats` löschen – dann rechnet Angular wieder aus allen Bewertungen).

**App Check:** Solange eine Alt-App live läuft, App Check nicht „erzwingen“ (Abschnitt 10) – die Alt-App sendet
kein App-Check-Token.

### Hosting-Eintrag der alten App (für den Rückweg)

Diesen Eintrag einsetzen und nur `target` (`main`, `u15` oder `u17`) und `public` (`outputs/team-manager`,
`outputs/u15` bzw. `outputs/u17`) anpassen:

```json
{
  "target": "<ziel>",
  "public": "outputs/<ordner>",
  "ignore": [
    "firebase.json",
    "**/.*",
    "**/node_modules/**",
    "**/*.md",
    "**/*.example.js"
  ],
  "headers": [
    {
      "source": "**",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' https://www.gstatic.com/firebasejs/10.12.5/; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        },
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin-allow-popups"
        }
      ]
    },
    {
      "source": "/firebase-config.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/app.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/styles.css",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/base.css",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/mobile.css",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/next-level.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/service-worker.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/manifest.webmanifest",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    }
  ]
}
```
