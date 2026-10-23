# Angular-Cutover (SCRUM-76)

Stand: 14.10.2026. Vergleich der Live-App (`outputs/team-manager`, gleich für `u15`/`u17`)
mit der Angular-Version (`angular/`, Site `teamkompass-u14`). **Kein Umstieg ohne ausdrückliche
Freigabe des Product Owners.**

## 1. Paritätsliste

Legende: ✅ vorhanden · ≈ anders gelöst (gleicher Zweck) · ❌ fehlt → Ticket · ✂️ Vorschlag: streichen (PO-Entscheid)

| Bereich | Live-App | Angular | Stand |
| --- | --- | --- | --- |
| Anmeldung | Trainer (E-Mail/Passwort), Passwort vergessen, Spieler-/Eltern-Code | Login-Seite mit beiden Wegen | ✅ |
| Rollen | Trainer, Spieler, Eltern, Scout, Medizin (SCRUM-170) | gleich, eigene Ansicht `/ansicht` | ✅ |
| Passwort ändern | Dialog | Einstellungen | ✅ |
| Start/Dashboard | Kennzahlen, Formkurve, nächstes Event, Startelf, Schnellaktionen | `/start` (SCRUM-69, SCRUM-93) | ✅ |
| Kader | Liste, Suche, Positions-/Statusfilter, Sortierung, anlegen/bearbeiten/löschen, Einwilligung | `/kader` | ✅ |
| Events | Liste, Suche, Typfilter, anlegen/bearbeiten/löschen, Intensität, Trainingsschwerpunkt, Spieldauer, Ergebnis | `/events` | ✅ |
| Vergangene Events | eingeklappter Bereich „Vergangene Events“ | Monatsgruppen, Sortierung wählbar | ≈ |
| Abwesenheit automatisch vorbelegen | beim Anlegen/Ändern von Events | SCRUM-80 | ✅ |
| Bewerten | Matrix (Desktop), Stepper (Handy), private Trainer-Notizen | `/events/:id` (SCRUM-66) | ✅ |
| Spielerprofil | Kopf, Historie, Kompetenzprofil, Statistik, Verfügbarkeit, Belastung | `/profile/:id` | ✅ |
| Profil-Zusatzdaten | Förderpläne, Abwesenheiten, Messwerte inkl. BMI/Diagramm, Selbstreflexion | SCRUM-68 | ✅ |
| Profilbericht drucken/PDF | Druckfenster | Export-Seite | ✅ |
| Teamanalyse | Teamform, Kennzahlen, Geburtsquartale, Positionsabdeckung, Trainingsfokus | `/teamanalyse` | ✅ |
| Gegneranalyse | Gegner erfassen, Profile | `/gegneranalyse` | ✅ |
| Aufstellung (Board) | Formationen, Bank, Auswechseln, Ziehen mit Maus/Finger | Antippen statt Ziehen | ≈ |
| Aufstellung **pro Spiel**, „vom letzten Spiel übernehmen“, im Event sichtbar | SCRUM-29 (#159) | nur eine Team-Aufstellung | ❌ SCRUM-122 |
| Zugänge | Einladungscodes, Trainer-Konto, Scout- und Medizin-Zugang, getrennte Listen, widerrufen | `/zugaenge` (SCRUM-73, SCRUM-92) | ✅ |
| Globale Suche | Strg/⌘+K, Spieler/Events/Gegner | `/suche` | ✅ |
| Export | JSON, PDF | `/export` | ✅ |
| **Backup einspielen** | JSON-Import mit Prüfung und Zusammenfassung (SCRUM-28, #158) | Export-Seite: Datei wählen, Prüfung, Zusammenfassung, Bestätigung; gegenseitig mit der Live-App einspielbar | ✅ SCRUM-123 |
| Datenschutz & lokale Daten | Aufbewahrungsdauer, Aktivitätsverlauf, lokale Daten löschen | Einstellungen | ✅ |
| Hell/Dunkel | Schalter | Einstellungen | ✅ |
| Sync-Status | „Cloud synchronisiert …“, offline, Fehler | gleiche Texte | ✅ |
| Barrierefreiheit Diagramme | Textzusammenfassung für Screenreader | vorhanden | ✅ |
| Vereinslogo im Kopf | Vereinslogo-Bild | Vereinslogo in Seitenleiste und Anmeldeseite (statt „TK“) | ✅ |
| Altdaten-Migration | Knopf „Daten migrieren“ (altes Ein-Dokument-Format → Sammlungen) | wird nicht übernommen (PO-Entscheid 15.10.) | ✂️ |
| PWA | Manifest, Service Worker, offline startbar | **neu mit diesem Ticket** (siehe 2.) | ✅ |
| Je Team ein Build | ein Ordner je Team (`outputs/<team>`) | fest auf U14 | ❌ SCRUM-124 |
| Datenformat alt ↔ neu | – | für einen Rückweg nötig | ❌ SCRUM-125 |

**Gestrichen (✂️, PO-Entscheid 15.10.2026):** Die Altdaten-Migration war ein Einmal-Werkzeug für den Wechsel
vom alten Ein-Dokument-Format auf Sammlungen. Alle Live-Teams sind längst umgestellt; Angular braucht
sie nicht. Die „≈“-Punkte halte ich für gleichwertig; wenn du einen davon genau wie bisher willst,
lege ich ein Ticket an.

## 2. PWA und Update-Verhalten

- Manifest je Team `teams/<team>/manifest.webmanifest` (SCRUM-124; Name, Farben, Symbole aus dem Vereinslogo, 192/512 px und
  „maskable“).
- Service Worker von Angular (`@angular/service-worker`, Konfiguration `ngsw-config.json`): App-Dateien
  werden beim ersten Besuch vorgeladen, die App startet danach auch ohne Netz. Daten kommen weiter
  aus Firestore (dessen eigener Offline-Speicher bleibt unberührt); der Service Worker fasst nur
  Dateien der eigenen Seite an.
- **Update-Verhalten:** Beim Öffnen und beim Zurückholen in den Vordergrund sucht die App nach einer
  neuen Version und lädt sie im Hintergrund. Ist sie fertig, erscheint unten „Neue Version verfügbar ·
  Neu laden“. Neu geladen wird erst auf Knopfdruck, damit niemand mitten in einer Eingabe Daten
  verliert. Nur wenn die alte Version nicht mehr ausgeliefert werden kann, lädt die App sofort neu.
- Hosting: `ngsw.json` und `ngsw-worker.js` fallen unter `Cache-Control: no-cache` (Regel `**` in
  `firebase.json`), werden also immer frisch geprüft. CSP: alles aus `'self'`, keine Änderung nötig.
- Beim späteren Umstieg eines Live-Teams ersetzt der Angular-Service-Worker den alten
  (`service-worker.js`, gleicher Bereich `/`) automatisch beim ersten Besuch.

## 3. Ablaufplan für den Umstieg (Entwurf – vor Umsetzung mit dem PO abstimmen)

**Voraussetzungen:** SCRUM-122, SCRUM-123, SCRUM-124, SCRUM-125 erledigt; SCRUM-78 (U14-Testkonto)
erledigt und ein vollständiger Durchlauf als Trainer, Spieler und Scout auf `teamkompass-u14`.

**Empfehlung: Angular liest direkt die bisherigen Team-Daten** (z. B. `mein-team`), statt Daten zu
kopieren. Dann gibt es keinen Datenumzug und keinen Stichtag, an dem zwei Stände auseinanderlaufen.

1. **Ein Team zuerst** (Vorschlag: U17 oder U15, nicht das Haupt-Team). Angular-Build für dieses Team
   (SCRUM-124) erst auf einer **Vorschau-Adresse** gegen die echten Daten testen (nur lesen und eine
   Testnotiz), danach PO-Freigabe.
2. **Umschalten:** In `firebase.json` zeigt das Hosting-Target des Teams auf den Angular-Build statt
   auf `outputs/<team>`. Ein Merge, ein Deploy. Firestore-Regeln bleiben unverändert (schon heute je
   `teamId` gleich).
3. **Beobachten** (eine Woche): Trainer nutzt das Team normal; Fehler → Ticket mit Priorität High.
4. **Rückweg (Rollback):** `firebase.json`-Eintrag zurück auf `outputs/<team>` und deployen
   (oder in der Firebase-Konsole unter Hosting die vorherige Version „Zurücksetzen“, sofort wirksam).
   Weil beide Versionen dieselben Daten im selben Format nutzen (SCRUM-125), geht dabei nichts verloren.
5. **Restliche Teams** einzeln wie 1.–3.; zuletzt das Haupt-Team.
6. **Aufräumen** erst, wenn alle Teams vier Wochen stabil laufen: alte `outputs/*`-Kopien und
   Root-Referenzkopie entfernen, `CLAUDE.md` anpassen. Die Testinstanz `U14` bleibt bestehen oder
   wird nach PO-Entscheid gelöscht.

**Stand SCRUM-169 (23.10.2026):** U17 ist umgestellt – Hosting-Ziel `u17` liefert den Angular-Build
`dist/team-u17/browser` aus (Team-ID `U17`), jeder PR hat eine U17-Vorschau. Rückweg und Hinweise:
`FIREBASE_SETUP.md` §11. Noch offen: eine Woche beobachten, Rollback einmal üben, danach U15 und
`mein-team` mit eigener Freigabe. Bekannte Lücke: Zu-/Absagen (SCRUM-175) gibt es in Angular noch nicht
(SCRUM-205).

**Entscheidungen des PO (15.10.2026):**
- Angular nutzt direkt die bisherigen Daten, keine Kopie. ✅
- Reihenfolge: **U17**, danach **U15**, zuletzt das **Haupt-Team** (`mein-team`).
- Das Haupt-Team wird danach zum **Dummy-/Entwicklungs-Team**: neue Ideen werden dort zuerst gebaut und erprobt;
  was sich bewährt, kommt auf die anderen Teams.
- Die Altdaten-Migration wird nicht übernommen. ✅
- Antippen statt Ziehen, Monatsgruppen bei vergangenen Events: in Ordnung. Das Vereinslogo muss statt „TK“ erscheinen
  (umgesetzt). ✅
- Noch offen vor dem Umschalten von U17: SCRUM-122, SCRUM-123 (Funktionen der Live-App, die in Angular noch fehlen),
  SCRUM-78 (Testkonto) und ein Testlauf gegen die echten U17-Daten auf einer Vorschau-Adresse.
