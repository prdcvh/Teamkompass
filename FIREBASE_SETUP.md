# Firebase-Setup fuer TeamKompass

Die App funktioniert ohne Firebase weiterhin lokal im Browser. Fuer mehrere Geraete stellst du `firebase-config.js` auf Firebase um.

## 1. Firebase-Projekt anlegen

1. Firebase Console oeffnen.
2. Neues Projekt erstellen.
3. Eine Web-App registrieren.
4. Die Firebase-Konfiguration kopieren.
5. Cloud Firestore aktivieren.

## 2. App konfigurieren

In `firebase-config.js`:

```js
window.TEAMKOMPASS_CONFIG = {
  storage: "firebase",
  teamId: "u17-saison-2026-27",
  firebase: {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  }
};
```

`teamId` ist der gemeinsame Datenraum. Alle Geraete mit derselben `teamId` sehen dieselben Daten.

## 3. Firestore-Pfad (Standard, ohne Rollen)

Solange `enableRoles` in `firebase-config.js` auf `false` steht (Standard), speichert die
App den gesamten Team-State weiterhin in einem Dokument, ohne Login:

```txt
teams/{teamId}/appState/current
```

## 4. Einfache Test-Regeln (nur fuer den Standardmodus ohne Rollen)

Nur fuer Entwicklung, solange `enableRoles: false` ist:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /teams/{teamId}/appState/current {
      allow read, write: if true;
    }
  }
}
```

Diese Regeln sind offen und nicht fuer produktive Nutzung geeignet.

## 5. Rollen-Modus aktivieren (Trainer sieht alles, Spieler nur das eigene Profil)

Die App unterstuetzt einen optionalen Rollen-Modus mit echtem Login. Datenmodell und
Zugriffsregeln liegen in `firestore.rules` im Repo-Root. Solange `enableRoles: false`
bleibt, aendert sich am heutigen Verhalten nichts.

Trainer-Konten entstehen **absichtlich nicht** ueber die App selbst (keine
Selbstregistrierung), sondern ausschliesslich manuell in der Firebase-Konsole - so kann
sich niemand, der die App-URL kennt, selbst zum Trainer machen.

**Einmalige Einrichtung:**

1. Firebase Console -> Authentication -> Sign-in-Methode: **E-Mail/Passwort** UND
   **Anonym** aktivieren.
2. `firestore.rules` deployen:
   - per Firebase-CLI: `firebase deploy --only firestore:rules`, oder
   - manuell: Inhalt von `firestore.rules` in Firebase Console -> Firestore Database
     -> Regeln einfuegen und veroeffentlichen.
3. Trainer-Konto manuell anlegen:
   - Firebase Console -> Authentication -> Tab "Users" -> "Nutzer hinzufuegen" ->
     E-Mail + Passwort eingeben. Firebase zeigt danach die generierte **Nutzer-ID (UID)**
     an - die brauchst du im naechsten Schritt.
   - Firebase Console -> Firestore Database -> Daten -> zur Collection
     `teams/{teamId}/members` navigieren (bzw. neu anlegen) -> Dokument mit der
     **Dokument-ID = die eben kopierte UID** anlegen, darin ein Feld `role` (Typ String,
     Wert `trainer`) anlegen.
   - Für weitere Trainer-Konten (z.B. Co-Trainer) diese beiden Schritte einfach
     wiederholen.
4. In `firebase-config.js` `enableRoles: true` setzen und deployen.
5. Die App oeffnen - es erscheint ein Login-Bildschirm mit dem Trainer-Login. Dort die
   in Schritt 3 vergebene E-Mail/Passwort-Kombination eingeben.
6. Falls schon Daten im alten Format existieren (`teams/{teamId}/appState/current`):
   im Menue "Aktionen" auf "Alte Daten migrieren" klicken. Das ueberfuehrt Kader,
   Events, Bewertungen, Foerderplaene und Gegneranalysen einmalig in die neue Struktur.
   Das alte Dokument bleibt danach unveraendert liegen (kann spaeter manuell geloescht
   werden).
7. Fuer jeden Spieler in der Kader-Ansicht auf "Einladen" klicken - das erzeugt einen
   6-stelligen Einladungscode. Den Code vertraulich an den jeweiligen Spieler weitergeben
   (wie ein Einmal-Passwort). Der Spieler gibt ihn einmalig auf dem Login-Bildschirm ein
   und ist danach auf diesem Geraet dauerhaft angemeldet - beschraenkt auf sein eigenes
   Spielerprofil. Beim Erzeugen des Codes laesst sich der Zugang optional befristen
   (z.B. 30 Tage ab der Anmeldung); danach verliert der Zugriff automatisch die
   Berechtigung. In der Kader-Ansicht unter "Spieler-Zugaenge verwalten" siehst du alle
   vergebenen Zugaenge mit Ablaufdatum und kannst sie jederzeit vorzeitig sperren.

**Datenmodell im Rollen-Modus:**

```txt
teams/{teamId}/members/{uid}                         # Rolle + ggf. playerId je Nutzer
teams/{teamId}/invites/{code}                        # Einladungscodes fuer Spieler
teams/{teamId}/players/{playerId}
teams/{teamId}/players/{playerId}/developmentPlans/{planId}
teams/{teamId}/events/{eventId}                      # Titel/Datum/Ergebnis, keine Noten
teams/{teamId}/events/{eventId}/ratings/{playerId}   # individuelle Bewertung
teams/{teamId}/opponents/{opponentId}
```

**Grenzen dieser Version:** Trainer-Konten (auch weitere, z.B. Co-Trainer) muessen immer
manuell in der Firebase-Konsole angelegt werden, es gibt keinen Einladungsweg dafuer;
Spieler-Zugaenge sind an das jeweilige Geraet gebunden (anonyme Anmeldung, kein
Passwort-Reset - bei Geraetewechsel muss neu eingeladen werden).
