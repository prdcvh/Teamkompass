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

Aktuell abgedeckt (`roles.test.mjs`): Rollen-Matrix für Trainer, Medizin (`physio`), Scout (`scout`, SCRUM-170: nur
`scoutProfiles`, keine Gesundheits- oder Rohdaten; ein übriges Konto mit der alten Kennung `medical` hat seit SCRUM-202
gar keine Rolle mehr), Spieler, Eltern,
abgelaufene Zugänge und Nicht-Mitglieder – wer welche Pfade lesen/schreiben darf (Spielerprofile,
Bewertungen, interne Notizen, Förderpläne, Abwesenheiten, Messwerte, Gegner, Aufstellung,
Mitgliedschaften, Einladungen), inklusive der Listenabfragen mit `playerId`-Filter. Seit SCRUM-234 auch der gezielte Abruf eines noch **nicht vorhandenen** Bewertungsdokuments
(eigenes erlaubt, fremdes nicht; Scout, Medizin, abgelaufene Zugänge weiter gesperrt).

`grade-release.test.mjs`: Noten erst nach „Bewertung veröffentlichen“ (SCRUM-115) – Spieler und Eltern lesen die
Werte-Kopie `events/{e}/ratingValues/{p}` immer, die Noten-Kopie `events/{e}/ratingGrades/{p}` nur bei gültiger Freigabe
`gradeReleases/{p}` und nur für Noten, die bis zum Klick vergeben wurden (`ratedAt <= publishedUntil`); abgelaufene
oder zurückgenommene Freigaben, fremde Spieler, Medizin, Scout und abgelaufene Zugänge sehen nichts; die vollständige
Bewertung mit Kommentar liest nur der Trainer; Freigaben schreibt nur der Trainer (Server-Zeit, eigenes Konto).

`invite-claim.test.mjs`: Einmalverbrauch von Einladungscodes (SCRUM-77) – gültiger Erst-Claim, zweiter Claim,
fehlender/abgelaufener Code, falscher Spieler/Rolle, parallele Claims und die unveränderten Trainer-Wege.

`rsvp.test.mjs`: Zu-/Absagen (SCRUM-175) unter `events/{eventId}/responses/{playerId}` – Spieler und Eltern
antworten nur für den eigenen Spieler, nur mit erlaubten Feldern (Zusage/Absage, Grund bis 200 Zeichen nur bei
Absage, eigene Rolle, Server-Zeitstempel) und nur für bestehende Events; lesen dürfen nur Trainer und der eigene
Spieler bzw. die eigenen Eltern, löschen nur der Trainer.

`ranking.test.mjs`: MVP-Rangliste (SCRUM-105) unter `meta/ranking` – Trainer sowie Spieler und Eltern des Teams lesen,
Fremde, andere Teams, abgelaufene Zugänge, Scout und Medizin nicht; schreiben und löschen nur der Trainer (nur die Felder
`week`, `month`, `updatedAt`); die Einzelpunkte im Trainer-Pfad bleiben für Spieler gesperrt.

`player-stats.test.mjs`: Zusammenfassung je Spieler (SCRUM-201) unter `playerStats/{playerId}` und das Kennzeichen
`meta/playerStats` – nur Trainer lesen/schreiben/löschen (Spieler und Eltern auch die eigene nicht, Medizin, Scouts,
abgelaufene Zugänge und Nicht-Mitglieder gar nicht), Format-Prüfung (nur `playerId`, `version`, `events`), Bewertung und
Zusammenfassung in einem Schreibvorgang, und dass ein `merge` den Eintrag eines Events vollständig ersetzt bzw. löscht.

`clubs.test.mjs`: mehrere Vereine (SCRUM-180) – zwei Vereine A/B mit je einem Team, ein Altteam ohne
Team-Dokument/`clubId`/`uid` und ein neues Team ohne Trainer. Prüft: Mitglieder aller Rollen aus Verein A lesen und
schreiben nichts in Verein B; Vereinsadmin erreicht keinen fremden Verein und liest im eigenen Verein seit SCRUM-183
mit, aber ohne Gesundheitsdaten und ohne zu schreiben; Teamsuche (`collectionGroup('members')` mit `uid`-Filter) liefert nur eigene
Mitgliedschaften; `uid` muss der Dokument-ID entsprechen; `clubId` unveränderlich; Altteams können nicht
beansprucht werden; Vereinsdokument lesen/ändern; erster Trainer genau einmal; niemand macht sich selbst zum
Vereinsadmin; Altteams laufen unverändert; das Einmal-Skript (`scripts/assign-clubs-lib.mjs`) ändert keine Rechte.

`club-admin.test.mjs`: Vereinsadmin (SCRUM-183, PO-Entscheidung B) – liest in den Teams des eigenen Vereins wie ein
Trainer (Zugänge, Termine, Werte/Noten-Kopien, Freigaben, Scout-Sicht, Zusammenfassungen, Gegner, Aufstellung,
Planung, Pausen, Rangliste, Lernpfade, Förderpläne, Anstrengung, Vereinsübersicht `meta/clubOverview`, Zu-/Absagen nur
ohne Grund), aber nie Gesundheitsdaten (Spielerdokument, Abwesenheiten, Messwerte, Reife, Befinden, Absagegrund),
Bewertungsdokumente, Notizen, Spielerkarten, Spieler-Codes als Liste, fremde Einstellungen; schreibt nichts außer Trainer
entfernen; nichts in fremden Vereinen, Altteams oder Teams ohne Verein. Trainercode (`clubInvites` mit `kind:
"trainer"`): nur Admin, nur bestehende Teams des eigenen Vereins; einlösen nur mit bestätigter (ggf. passender) E-Mail,
genau einmal, nur für das eigene Konto, nie durch den Ersteller; niemand macht sich zum Vereinsadmin; die
Vereinsübersicht schreibt nur der Trainer im festen Format.

`registration.test.mjs`: Registrierung nur mit Einladung (SCRUM-181) – ein Vereinscode legt in einem Schreibvorgang
Verein, Vereinsadmin, erstes Team und Trainer-Zugang an und wird dabei verbraucht; zweiter Versuch, abgelaufener Code,
unbestätigte E-Mail, anonym, abgemeldet, fremde E-Mail bei gebundenem Code, unvollständige/verfälschte Schreibvorgänge
und Codes, die auf bestehende Vereine/Teams zeigen, werden abgewiesen. Beitrittscodes (nur vom Vereinsadmin für den
eigenen Verein): neues Team mit erstem Trainer, aber keine Adminrechte und kein Zugriff auf Nachbarteams. Ein mit dem
Skript `scripts/create-club-invite.mjs` (Logik `scripts/club-invite-lib.mjs`) erzeugter Code lässt sich einlösen.

`knowledge.test.mjs`: Wissen (SCRUM-106) liegt als Map `knowledge.{id}` im Trainer-Dokument `meta/settings` – nur Trainer lesen und
schreiben, Spieler, Eltern, Medizin, Scout, abgelaufene Trainer und Fremde nicht; und der Befund, dass eine neue Unter-Sammlung
unter `teams/{teamId}` ohne Regeländerung für alle gesperrt wäre.

`learning.test.mjs`: Lernpfade (SCRUM-192) – `learningPaths/{pathId}` lesen Trainer, Spieler und Eltern, schreiben nur der
Trainer (nur die vorgesehenen Felder, höchstens 12 Stufen, Zeitpunkt vom Server); `learningProgress/{playerId}` lesen nur
der Trainer (auch als Liste) und der eigene Spieler bzw. die eigenen Eltern (gezielter Abruf, nie fremde Spieler, nie als
Liste), bestätigen/zurücknehmen nur der Trainer; Medizin, Scout, abgelaufene Zugänge, Fremde und andere Teams nichts.

`puzzles.test.mjs`: Situationsrätsel (SCRUM-193) – `puzzles/{id}` (ohne Lösung) lesen Trainer, Spieler und Eltern, schreiben
nur der Trainer (https-Link, 2–4 Antworten, Schwierigkeit 1–3); `puzzleSolutions/{id}` lesen Spieler und Eltern erst, wenn die
Antwort des eigenen Spielers existiert (gezielter Abruf, nie als Liste); `puzzleAnswers/{puzzleId}_{playerId}` legt nur der
Spieler selbst an (nicht die Eltern), einmal, nur mit vorhandener Antwort und Server-Zeit, ändern nie, löschen nur der
Trainer; lesen Trainer und der eigene Spieler bzw. die eigenen Eltern (Liste nur mit `playerId`-Filter); Medizin, Scout,
abgelaufene Zugänge, Fremde und andere Teams nichts.

`consent.test.mjs`: Einwilligung für Gesundheitsdaten (SCRUM-245) – bei „widerrufen“ lesen Spieler, Eltern und Medizin weder
Spielerdokument (Status, „verletzt bis/seit“) noch Abwesenheiten, Messwerte oder Absagegründe (der Trainer schon; Noten
und Förderplan bleiben lesbar); Medizin listet nur mit Filter `consentStatus != revoked`; bereinigte Spielerkarte
`playerCards/{playerId}` (nur eigener Spieler/Eltern lesen, nur Trainer schreibt, keine Gesundheitsfelder). Eigene Teams
(`mein-team`, `U14`, `U15`, `U17`) bei „offen“ unverändert; fremde Vereine speichern Gesundheitsdaten (Status außer „Fit“,
„verletzt bis/seit“, Abwesenheiten, Messwerte, Absagegrund) nur mit dokumentierter Einwilligung. Wer „dokumentiert“ setzt,
trägt die eigene UID ein (`consentByUid`). SCRUM-248: Der Trainer darf in einer Rückmeldung nur den Absagegrund leeren
(kein anderes Feld, keine neue Rückmeldung). `roles.test.mjs` und `rsvp.test.mjs` laufen dafür im eigenen Team `U14`.

`maturity.test.mjs`: Reife-Kompass (SCRUM-190) unter `players/{playerId}/maturity/parents` (Geschlecht für die Formel,
Einverständnis der Eltern, Größe von Mutter und Vater) – lesen nur Trainer und Medizin (Medizin nicht bei widerrufener
Einwilligung), nie Spieler, Eltern oder Scouts; schreiben nur der Trainer, nur diese Felder, Größen 100–250 cm und nur mit
Häkchen `parentsConsent`; fremde Vereine nur mit dokumentierter Einwilligung.
