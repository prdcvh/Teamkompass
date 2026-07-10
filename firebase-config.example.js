window.TEAMKOMPASS_CONFIG = {
  storage: "firebase",
  teamId: "u17-saison-2026-27",
  // Auf true stellen, um den Rollen-Modus (Trainer-Login + Spieler-Einladungscodes,
  // siehe firestore.rules) zu aktivieren. Vorher in der Firebase-Konsole unter
  // Authentication die Anmeldemethoden "E-Mail/Passwort" und "Anonym" aktivieren
  // und firestore.rules deployen - siehe FIREBASE_SETUP.md.
  enableRoles: false,
  firebase: {
    apiKey: "DEIN_API_KEY",
    authDomain: "DEIN_PROJEKT.firebaseapp.com",
    projectId: "DEIN_PROJEKT",
    storageBucket: "DEIN_PROJEKT.appspot.com",
    messagingSenderId: "DEINE_SENDER_ID",
    appId: "DEINE_APP_ID"
  }
};
