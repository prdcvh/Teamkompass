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

## 3. Firestore-Pfad

Aktuell speichert die App den gesamten Team-State hier:

```txt
teams/{teamId}/appState/current
```

Das ist fuer den ersten Cloud-Schritt bewusst einfach. Spaeter kann man es in einzelne Collections aufteilen:

```txt
teams/{teamId}/players/{playerId}
teams/{teamId}/events/{eventId}
teams/{teamId}/events/{eventId}/ratings/{playerId}
teams/{teamId}/members/{userId}
```

## 4. Einfache Test-Regeln

Nur fuer Entwicklung:

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

## 5. Naechster Schritt fuer mehrere Benutzer

Fuer echte Benutzerkonten sollte Firebase Authentication dazukommen. Danach koennen Firestore-Regeln Teammitglieder pruefen und Rollen wie Trainer, Co-Trainer oder Spieler unterscheiden.
