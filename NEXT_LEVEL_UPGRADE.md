# TeamKompass Next-Level Upgrade

## Sicherer Rollout

Firestore-Regeln und Hosting müssen im selben Release ausgerollt werden. Alte
sechsstellige, mehrfach nutzbare Einladungscodes sind absichtlich nicht mehr
gültig. Nach dem Deployment erstellt der Trainer für Spieler und Eltern neue
48-stellige Einmal-Tokens.

1. `npm run verify`
2. Firestore-Regeln deployen.
3. Alle drei Hosting-Ziele deployen.
4. Alte Invite-Dokumente löschen und benötigte Zugänge neu ausstellen.
5. Login mit einem Test-Spieler, einem Elternzugang und einem medizinischen
   Lesezugang prüfen.

## Rollen

- `trainer`: vollständige Verwaltung.
- `player`: ausschließlich eigenes Profil, Bewertungen und Entwicklungsdaten.
- `parent`: ausschließlich das verknüpfte Spielerprofil.
- `medical`: read-only auf Kader, Abwesenheiten und Messhistorie; keine
  Leistungsbewertungen oder Entwicklungspläne.

Eine Co-Trainer-Rolle wurde bewusst nicht eingeführt.

## Neue Produktfunktionen

- Coach Cockpit mit Wochenfokus und priorisiertem Handlungsbedarf
- Matchday-Cockpit mit Aufstellungs- und Vorbereitungsstatus
- globale Suche über `Strg/⌘ + K`
- lokaler und synchronisierter Aktivitätsverlauf
- dokumentierter Einwilligungsstatus pro Spieler
- konfigurierbare lokale Datenaufbewahrung
- PWA-App-Shell für instabile Verbindungen
- zugängliche Textzusammenfassung aller Canvas-Diagramme
- eindeutige Formationsnamen und nachvollziehbare Empfehlungen

## Sicherheitsmodell

Einladungen bestehen aus 192 Bit kryptografischem Zufall und werden beim ersten
erfolgreichen Einlösen atomar gelöscht. Nutzerinhalte werden vor HTML-Ausgabe
maskiert. Firebase Hosting setzt CSP, MIME-Schutz, Referrer- und
Permissions-Policy. Cloud-Schreibvorgänge zeigen einen sichtbaren
Pending-/Fehlerstatus; kaskadierende Löschungen lesen Unterkollektionen aus der
Cloud und löschen sie in Batches.
