# Architektur-Notiz: Verein → Teams (SCRUM-180)

Stand: 23.10.2026 · Status: **vom PO freigegeben (23.10.2026), alle Empfehlungen gelten (Abschnitt 9)** ·
umgesetzt in SCRUM-180: `firestore.rules`, Regeltests `tests/rules/clubs.test.mjs`, Einmal-Skript
`scripts/assign-clubs.mjs`. Registrierung, Teamauswahl in der App und „ein Build für alle“ folgen mit SCRUM-181.

## Kurzfassung

- Ein **Verein** bekommt einen eigenen Eintrag in der Datenbank (Name, Logo, Vereinsadmins).
- Die **Teams bleiben genau dort, wo sie heute liegen.** Jedes Team bekommt nur einen Vermerk
  „gehört zu Verein X“. Es zieht kein einziger Spieler, Termin oder keine Bewertung um.
- **Wer was sehen darf, entscheidet weiter die Mitgliedschaft im Team** – wie heute. Wer in keinem
  Team von Verein B ist, sieht von Verein B nichts.
- Neu ist nur die Rolle **Vereinsadmin**: Er verwaltet den Verein (Name, Logo, Teams anlegen, ersten
  Trainer einsetzen). Empfehlung: Er sieht dadurch **keine** Spielerdaten, Noten oder Gesundheitsdaten –
  dafür muss er wie jeder andere selbst Mitglied im Team sein.
- Die App findet „meine Teams“ über die Datenbank statt über den Build. Das ist die Grundlage für
  SCRUM-181 (ein Build für alle, Registrierung).

## 1. Ausgangslage heute

| Punkt | Heute |
|---|---|
| Datenablage | Alles unter `teams/{teamId}/…` (Spieler, Termine, Bewertungen, Zugänge, Einstellungen). |
| Teams | `mein-team` (Live-U14, `outputs/team-manager`), `U15`, `U17` (`outputs/u15`, `outputs/u17`), `U14` (Angular-Testkopie von `mein-team`). Alle: 1. FC Königstein, ein Firebase-Projekt. |
| Team-ID | Fest im Build: `firebase-config.js` (Alt-App) bzw. `angular/src/environments/environment.<team>.ts`. 15 Angular-Dateien lesen `environment.teamId`. |
| Vereinsname/Logo | Fest im Build (`clubName`, `assets/club-logo.png`). |
| Zugriff | `teams/{teamId}/members/{uid}` mit `role` (`trainer`, `player`, `parent`, `physio`, `scout`, alt `medical`), bei Spielern/Eltern `playerId`, optional `expiresAt`. Alle Regeln prüfen nur dieses Dokument. |
| Trennung der Teams | Schon heute vollständig: ohne `members`-Eintrag im Team kein Zugriff. |
| Team-Dokument selbst | `teams/{teamId}` hat **keine Felder** (nur Unter-Collections) und **keine Regel** – lesen/schreiben ist für Clients verboten. |
| Erster Trainer | Wird von Hand in der Firebase-Konsole angelegt (FIREBASE_SETUP.md §5/§6). |
| Mehrere Teams pro Person | Technisch schon möglich (gleiche UID in mehreren `members`), die App kennt aber nur das eine Team aus dem Build. |

## 2. Vorgeschlagenes Modell

```txt
clubs/{clubId}                       name, logoUrl (optional/null), createdAt
clubs/{clubId}/admins/{uid}          uid (= Dokument-ID), role: "admin", createdAt
teams/{teamId}                       NEU mit Feldern: clubId, name ("1. FC Königstein U14"),
                                     label ("U14"), hasTrainer, firstTrainerUid (nur bei neuen Teams),
                                     createdAt
teams/{teamId}/members/{uid}         wie heute + NEUES Feld uid (= Dokument-ID)
teams/{teamId}/…                     alles andere unverändert
```

Warum so:

- **Admins als eigene Unter-Collection** (nicht als Liste im Vereinsdokument): Die Regel prüft mit einem
  einzigen `exists(clubs/{clubId}/admins/{uid})` – genau wie heute bei `members`. Das Vereinsdokument
  enthält dann nur öffentliche Angaben (Name, Logo) und keine Konten.
- **Name „admins“, nicht „members“**: Eine Collection namens `members` würde von der neuen
  Teamsuche (unten) mit erfasst.
- **`clubId` ist nach dem Anlegen fest**: Ein Team kann nicht in einen anderen Verein „geschoben“ werden.

### Wie ein Nutzer seine Teams findet

Nach dem Login fragt die App: „In welchen Teams gibt es ein `members`-Dokument mit meiner UID?“
(Firestore-Abfrage über alle `members`-Collections, `where('uid', '==', meineUid)`). Ergebnis: Liste
`teamId` + Rolle. Dafür braucht jedes `members`-Dokument das Feld `uid` (die Dokument-ID allein lässt sich
so nicht abfragen). Danach liest die App `teams/{teamId}` (Name, Verein) und `clubs/{clubId}` (Logo).

- 1 Team → direkt hinein (wie heute, kein Unterschied für Spieler/Eltern).
- mehrere Teams → Auswahlseite; das zuletzt gewählte Team merkt sich das Gerät.
- Die Rolle gilt **je Team**: dieselbe Person kann Trainer in U14 und Elternteil in U17 sein.

Vereinsadmins finden „ihre“ Vereine über die gleiche Art Abfrage auf `admins` und die Teams des Vereins
über `teams where clubId == …`.

### Rolle Vereinsadmin (Empfehlung „nur Verwaltung“)

Darf: Vereinsname/Logo ändern, Teams des Vereins sehen (nur Name/Bezeichnung), neue Teams für den eigenen
Verein anlegen, weitere Vereinsadmins ernennen, den **ersten** Trainer eines Teams einsetzen (ersetzt den
Handgriff in der Firebase-Konsole).
Darf nicht: Spieler, Termine, Bewertungen, Notizen, Abwesenheiten, Messwerte, Zugänge eines Teams lesen –
außer er ist selbst Mitglied dieses Teams. Teams löschen (bleibt dem PO per Admin-Zugang vorbehalten).

## 3. Regeländerungen (umgesetzt in SCRUM-180)

Alle bestehenden Regeln unter `teams/{teamId}/…` bleiben gleich. Es kommen nur Blöcke dazu. Umgesetzt wurde die
Skizze unten mit diesen Verschärfungen (Ergebnis des Sicherheits-Reviews):

- **Neue Teams nur mit Zufalls-ID** (20 Zeichen, wie Firestore-Auto-IDs). Grund: Die bestehenden Teams
  (`mein-team`, `U15`, `U17`, `U14`) haben bis zum Skriptlauf **kein** Team-Dokument. Ohne diese Bedingung könnte ein
  Vereinsadmin `teams/mein-team` als „neues Team ohne Trainer“ für seinen Verein anlegen und sich dann als ersten
  Trainer eintragen.
- **Erster Trainer genau einmal:** Der Vereinsadmin setzt im selben Schreibvorgang `hasTrainer: true` und
  `firstTrainerUid` im Team-Dokument und legt genau dieses `members`-Dokument (Rolle `trainer`) an. `hasTrainer`
  kann nur von `false` auf `true` wechseln, nie zurück – auch nicht durch den Trainer. Fehlt das Feld, gilt das Team
  als besetzt.
- **`uid` in `members` muss der Dokument-ID entsprechen** (auf allen Anlege-Wegen), damit kein Dokument in der
  Teamsuche eines fremden Kontos auftaucht.
- Teams ohne Team-Dokument oder ohne `clubId` funktionieren unverändert; alle Admin-Wege sind dort gesperrt.

Ursprüngliche Skizze:

```txt
function isClubAdmin(clubId) =
  isSignedIn() && clubId is string
  && exists(/clubs/$(clubId)/admins/$(request.auth.uid))

match /clubs/{clubId}
  get:            isSignedIn()          // Name + Logo; Frage 3
  list:           false                 // niemand kann alle Vereine auflisten
  update:         isClubAdmin(clubId) && nur Felder name, logoUrl
  create, delete: false                 // Anlegen erst mit SCRUM-181

  match /admins/{uid}
    read:   isClubAdmin(clubId) || request.auth.uid == uid
    create: isClubAdmin(clubId)
    delete: isClubAdmin(clubId) && uid != request.auth.uid   // niemand entfernt sich selbst
    update: false

match /teams/{teamId}                    // das Team-Dokument selbst (heute ohne Regel)
  get:    isTeamMember() || isClubAdmin(resource.data.clubId)
  list:   isClubAdmin(resource.data.clubId)        // nur mit Filter clubId == eigener Verein
  create: isClubAdmin(request.resource.data.clubId)
  update: (isTrainer() || isClubAdmin(resource.data.clubId))
          && request.resource.data.clubId == resource.data.clubId   // Verein unveränderlich
          && nur Felder name, label (+ clubId unverändert)
  delete: false

match /teams/{teamId}/members/{uid}      // Ergänzung
  create (Admin-Weg, neu): isClubAdmin(get(teams/$(teamId)).data.clubId)
          && role == "trainer" && Team hat noch keinen Trainer      // Frage 2
  create (bestehende Wege): unverändert, zusätzlich: uid fehlt ODER uid == Dokument-ID

match /{path=**}/members/{memberId}      // Teamsuche über alle Teams
  read (nur Abfrage):  resource.data.uid == request.auth.uid
match /{path=**}/admins/{adminId}
  read (nur Abfrage):  resource.data.uid == request.auth.uid
```

„Team hat noch keinen Trainer“ lässt sich in Regeln nicht zählen; Umsetzung über ein Feld
`teams/{teamId}.hasTrainer`, das im selben Schreibvorgang auf `true` gesetzt wird und danach nur noch
`true` sein darf.

## 4. Zuordnung der bestehenden Teams

| Team | Verein | Bemerkung |
|---|---|---|
| `mein-team` | `fc-koenigstein` (1. FC Königstein) | Live-U14 |
| `U15` | `fc-koenigstein` | Live |
| `U17` | `fc-koenigstein` | Live (wird mit SCRUM-169 auf Angular umgestellt) |
| `U14` | `test-verein` (eigener Test-Verein) | Angular-Testkopie von `mein-team`, Frage 4 |

Vereinsadmin für `fc-koenigstein` (und `test-verein`): nur das Konto des PO (Frage 5).

## 5. Migration ohne Datenumzug

Einmal-Skript `scripts/assign-clubs.mjs` nach dem Muster von `scripts/copy-team.mjs` (Admin-Zugang,
Ausführung nur durch den PO, Anleitung in `FIREBASE_SETUP.md` §9). **Probelauf ist Standard**, geschrieben wird
nur mit `--apply`. Mehrfach ausführbar; ein Team, das schon einem anderen Verein gehört, bricht den Lauf ab.

1. `clubs/fc-koenigstein` und `clubs/test-verein` anlegen (Name, `logoUrl: null`) und jeweils
   `admins/{PO-UID}`. Bei den vier Teams `hasTrainer: true` setzen (sie haben alle schon Trainer).
2. In `teams/mein-team`, `U15`, `U17`, `U14` die Felder `clubId`, `name`, `label` setzen (`merge`, die
   Unter-Collections werden nicht angefasst, vorhandene Felder nicht überschrieben).
3. In jedes vorhandene `members`-Dokument das Feld `uid` (= Dokument-ID) schreiben. Ändert keine Rolle und
   kein Recht.

`scripts/copy-team.mjs` kopiert das Team-Dokument selbst seitdem nicht mehr mit – sonst würde ein erneutes
Kopieren `mein-team → U14` die Zuordnung von U14 zum Test-Verein überschreiben.

Reihenfolge: zuerst neue Regeln deployen (rein ergänzend, Alt-App merkt nichts), dann Skript, dann
Angular-Version mit Teamauswahl. Die Alt-Apps (`outputs/*`) lesen keines der neuen Felder und laufen
unverändert weiter. Mitglieder, die die Alt-App nach dem Skript noch anlegt, haben kein `uid`-Feld – sie
erscheinen erst nach erneutem Skriptlauf in der Teamauswahl; nach SCRUM-169 entfällt das.
Rückweg: Felder/Dokumente wieder löschen, nichts Bestehendes wurde überschrieben.

## 6. Auswirkungen auf Angular

- `environment.teamId` wird durch einen „aktuelles Team“-Dienst ersetzt (Signal); die 15 Dateien unter
  `core/firebase/*.api.ts` lesen die Team-ID von dort. Rein mechanische Änderung.
- Neue Teamauswahl nach dem Login (nur sichtbar bei mehr als einem Team), Teamwechsel im Menü.
- Vereinsname und Logo kommen aus der Datenbank statt aus `environment.clubName`.
- Erst damit ist **ein Build für alle Teams** möglich (SCRUM-181); `environment.<team>.ts` und die
  Hosting-Seiten je Team werden danach überflüssig (alte Adressen leiten weiter).
- **Offen für SCRUM-181:** Spieler/Eltern melden sich heute anonym mit einem Code an, der unter
  `teams/{teamId}/invites/{code}` liegt – die App muss also vorher das Team kennen. Ohne festen Build muss
  das Team im Einladungslink/QR-Code stecken (`?team=U17`) oder es braucht ein teamübergreifendes
  Code-Verzeichnis. Empfehlung: Team im Link, weil ein zentrales Verzeichnis das Erraten von Codes über alle
  Vereine hinweg erleichtert.

## 7. Alternativen

| | Idee | Vorteile | Nachteile |
|---|---|---|---|
| **A (Empfehlung)** | Teams bleiben unter `teams/`, Feld `clubId`, Admins unter `clubs/{id}/admins` | Kein Datenumzug, Alt-Apps laufen weiter, bestehende Regeln und Tests bleiben gültig, kleiner Schritt | Verein steht nicht im Pfad; Regeln für Admins brauchen einen Extra-Lesezugriff aufs Team-Dokument |
| B | Verschachtelt: `clubs/{clubId}/teams/{teamId}/…` | Saubere Hierarchie, Verein direkt im Pfad prüfbar | Alle Daten aller Teams müssen umziehen, alle Pfade in beiden Apps ändern sich, Alt-Apps brechen – mitten in SCRUM-169 zu riskant |
| C | Rechte als „Custom Claims“ im Login-Token (`teams`, `clubs` im Token) | Regeln ohne Zusatz-Lesezugriffe (schneller, billiger), Teamliste direkt im Token | Braucht einen eigenen Server-Dienst (Cloud Functions, kostenpflichtiger Tarif), Änderungen wirken erst nach Token-Erneuerung (bis 1 h), Größenlimit 1000 Byte |
| D | Ein eigenes Firebase-Projekt je Verein | Stärkste Trennung (auch Abrechnung, Datenexport) | Jeder Verein von Hand einzurichten, keine Selbstregistrierung (SCRUM-181), viele Projekte zu pflegen |

Für „meine Teams finden“ gibt es innerhalb von A eine Unter-Alternative: ein Verzeichnis
`users/{uid}` mit der Teamliste. Nachteil: zweite Wahrheit neben `members`, muss bei jeder Einladung,
jedem Sperren und jedem Trainer-Konto mitgepflegt werden; ein vergessenes Update zeigt falsche Teams.
Die Abfrage über `members` (Empfehlung) hat nur eine Wahrheit.

## 8. Risiken

**Datenschutz zwischen Vereinen**
- *Teamsuche zu weit offen:* Die neue Abfrage über alle `members`-Collections ist der empfindlichste Punkt.
  Trainer-/Scout-/Medizin-Mitgliedschaften enthalten die **E-Mail-Adresse**. Die Regel muss strikt
  „nur Dokumente mit meiner eigenen UID“ erlauben; dafür gibt es eigene Tests.
- *Vereinsadmin zu mächtig:* Darf er den ersten Trainer einsetzen, kann er sich theoretisch selbst zum
  Trainer machen und dann alles sehen. Gegenmittel: nur solange das Team noch keinen Trainer hat, und der
  Eintrag erscheint in der Zugangsliste des Teams (Frage 2).
- *Team wechselt Verein:* durch „`clubId` unveränderlich“ ausgeschlossen.
- *Anonymer Login:* Jeder kann sich anonym anmelden. „Angemeldet“ ist darum praktisch „öffentlich“ – nur
  wirklich öffentliche Angaben (Vereinsname, Logo) dürfen so lesbar sein.
- *Einladungscodes:* `invites/{code}` ist heute für jeden Angemeldeten per Einzelabruf lesbar (nötig für die
  Anmeldung). Mit vielen Vereinen steigt der Nutzen von Code-Raten; siehe Abschnitt 6, Thema für SCRUM-181.
- *Recht:* Jeder Verein ist für seine Daten selbst verantwortlich; die Entwürfe zu AVV/Datenschutz
  (SCRUM-184, `docs/legal/`) müssen je Verein gelten.

**Kosten / Lesezugriffe**
- Jede `get`/`exists`-Prüfung in einer Regel zählt als ein Lesezugriff. Die bestehenden Team-Regeln
  bekommen **keine** zusätzliche Prüfung; nur Admin-Wege lesen zusätzlich das Team-Dokument.
- Teamsuche: ein Lesezugriff je gefundenem Team, einmal pro Login; Vereinsdokument einmal. Bei heutiger
  Größe weit innerhalb des kostenlosen Kontingents (50.000 Lesezugriffe/Tag).
- Regeln dürfen pro Anfrage höchstens 10 (Einzelzugriff) bzw. 20 (Sammelschreiben) Dokumente nachschlagen;
  die Einladungs-Regel ist schon nahe dran, die neuen Prüfungen kommen dort nicht hinzu.

## 9. Entscheidungen des PO (entschieden am 23.10.2026, alle Empfehlungen gelten)

1. **Rechte des Vereinsadmins:** **entschieden: nur Verwaltung** (Name, Logo, Teams anlegen, ersten Trainer
   einsetzen). Er sieht **keine** Spielerdaten, Noten oder Gesundheitsdaten.
2. **Ersten Trainer einsetzen:** **entschieden: ja, aber nur solange das Team noch keinen Trainer hat.**
3. **Vereinsname und Logo:** **entschieden: für jeden angemeldeten Nutzer lesbar.**
4. **Test-Team U14:** **entschieden: eigener Test-Verein** (`test-verein`).
5. **Vereinsadmin 1. FC Königstein:** **entschieden: nur das Konto des PO.**
6. **Vereins-ID:** **entschieden: `fc-koenigstein`** für den bestehenden Verein, zufällige IDs für neue Vereine.
7. **Einmal-Skript:** **entschieden: der PO startet es selbst, zuerst als Probelauf** (Probelauf ist Standard).
8. **Gesamtfreigabe:** **entschieden: Modell A wird so umgesetzt.**

## 10. Regeltests (`tests/rules/clubs.test.mjs`, umgesetzt)

Zwei Vereine A und B mit je einem Team (A1, B1), Trainer, Spieler und Vereinsadmin je Verein:

1. Trainer, Spieler, Eltern, Medizin, Scout aus A1 können **keinen** Pfad von B1 lesen oder schreiben
   (Team-Dokument, Spieler, Termine, Bewertungen, Notizen, Abwesenheiten, Messwerte, Zugänge, Einladungen, `meta/*`).
2. Vereinsadmin A: kann `teams/B1` nicht lesen, `teams where clubId == B` nicht abfragen, kein Team mit
   `clubId: B` anlegen, `clubs/B` nicht ändern, keinen Admin in B anlegen, keinen Trainer in B1 einsetzen.
3. Vereinsadmin A ohne Teammitgliedschaft: kann Spieler, Bewertungen, Abwesenheiten, Messwerte, Zugänge von A1
   **nicht** lesen (bei Entscheidung „nur Verwaltung“).
4. Teamsuche: Abfrage `members where uid == eigene UID` erlaubt; ohne Filter oder mit fremder UID verweigert;
   ein Mitglied von A sieht dabei nie Einträge aus B.
5. `clubId` eines Teams kann weder Trainer noch Vereinsadmin ändern; Teammitglied liest eigenes Team-Dokument,
   Nicht-Mitglied nicht.
6. Vereinsdokument: Einzelabruf für Angemeldete erlaubt, Auflisten verboten, Ändern nur durch eigene Admins und
   nur Name/Logo.
7. Erster Trainer: Vereinsadmin darf genau einmal einsetzen, danach nicht mehr.
8. Rückwärtskompatibel: alle bestehenden Regeltests (`roles`, `invite-claim`, `rsvp`, `player-stats`,
   `validation`) laufen unverändert grün, auch für Teams **ohne** `clubId` und `members` **ohne** `uid`.

Zusätzlich umgesetzt: niemand macht sich selbst zum Vereinsadmin; `uid` muss der Dokument-ID entsprechen;
Altteams ohne Team-Dokument kann niemand für einen Verein beanspruchen; das Einmal-Skript ändert keine Rechte und
ist wiederholbar. **Bekannte, bewusste Ausnahme (unverändert seit SCRUM-77):** Einen Einladungscode, den man
kennt, darf jeder Angemeldete gezielt abrufen (nötig für die Anmeldung). Auflisten bleibt Trainern vorbehalten.
Das wird mit SCRUM-181 neu bewertet (Abschnitt 6).

## 11. Schnittstellen für SCRUM-181

- **Meine Teams:** `query(collectionGroup(db, 'members'), where('uid', '==', auth.uid))` → `ref.parent.parent.id`
  ist die `teamId`, `data().role` die Rolle. Ohne den `uid`-Filter lehnt Firestore die Abfrage ab. Abgelaufene
  Zugänge (`expiresAt` in der Vergangenheit) liefert die Abfrage mit – die App muss sie selbst ausblenden.
- **Team-Daten:** `getDoc(teams/{teamId})` → `clubId`, `name`, `label` (Mitglieder dürfen lesen).
  **Verein:** `getDoc(clubs/{clubId})` → `name`, `logoUrl` (jeder Angemeldete, `logoUrl` kann `null` sein).
- **Meine Vereine (Admin):** `query(collectionGroup(db, 'admins'), where('uid', '==', auth.uid))`, Teams des Vereins:
  `query(collection(db, 'teams'), where('clubId', '==', clubId))`.
- **Neue Mitgliedschaften** sollten `uid` (= Dokument-ID) mitschreiben, sonst fehlen sie in der Teamsuche
  (Spieler-Einlösung: `uid` ist im erlaubten Feldsatz).
- **Neues Team (Vereinsadmin):** `setDoc(doc(collection(db, 'teams')), { clubId, name, label, hasTrainer: false,
  createdAt: serverTimestamp() })` – die ID muss eine 20-stellige Auto-ID sein.
- **Erster Trainer (Vereinsadmin), ein Batch:** `update(teams/{teamId}, { hasTrainer: true, firstTrainerUid: uid })`
  und `set(teams/{teamId}/members/{uid}, { role: 'trainer', email, uid, createdAt: serverTimestamp() })`.
- **Neuer Verein:** seit SCRUM-181 nur über einen Einladungscode, siehe Abschnitt 12.

## 12. Registrierung nur mit Einladung (SCRUM-181, umgesetzt)

PO-Entscheidung 23.10.2026: keine freie Registrierung. Gewählte Variante: **Einladungscodes `clubInvites/{code}`**
(`kind`, `clubId`, `teamId`, `expiresAt`, `email` optional). Vereins- und Team-ID sind **schon im Code festgelegt**
(Zufalls-IDs) – so findet jede Teilregel denselben Code, und ein Code kann nie einen bestehenden Verein oder ein
bestehendes Team treffen.

- **Vereinscode** (`kind: "club"`, nur per Skript `scripts/create-club-invite.mjs`): Ein Schreibvorgang löscht den
  Code und legt `clubs/{clubId}`, `clubs/{clubId}/admins/{uid}` (mit `inviteCode`), `teams/{teamId}` (`hasTrainer:
  true`, `firstTrainerUid: uid`) und `teams/{teamId}/members/{uid}` (Rolle `trainer`, `uid`, `claimedInviteCode`) an.
- **Beitrittscode** (`kind: "team"`, vom Vereinsadmin in der App): gleicher Schreibvorgang ohne Verein/Admin;
  der Verein muss bestehen. Der neue Trainer wird nicht Vereinsadmin.
- Regeln verlangen: bestätigte E-Mail (`email_verified`), Code vorhanden und nicht abgelaufen, im selben
  Schreibvorgang gelöscht, ggf. passende E-Mail, Admin/Trainer = das angemeldete Konto, Verein/Team neu.
- Angular: Team-ID aus der Teamsuche (`CurrentTeam`), Rückfall auf `environment.teamId`; Auswahlseite bei mehreren
  Teams; Spieler-Einladungslinks tragen das Team (`/anmelden?team=…&code=…`, offene Frage aus Abschnitt 6).
- App Check: vorbereitet, ohne Schlüssel aus (FIREBASE_SETUP.md §10).
