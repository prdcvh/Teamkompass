window.TEAMKOMPASS_CONFIG = {
  storage: "firebase",
  teamId: "mein-team",
  teamName: "1. FC Königstein U14",
  // Auf true stellen, um den Rollen-Modus (Trainer-Login + Spieler-Einladungscodes,
  // siehe firestore.rules) zu aktivieren. Vorher in der Firebase-Konsole unter
  // Authentication die Anmeldemethoden "E-Mail/Passwort" und "Anonym" aktivieren
  // und firestore.rules deployen - siehe FIREBASE_SETUP.md.
  enableRoles: true,
  firebase: {
    apiKey: "AIzaSyCJbajbFdiUFumwIGFN-UXxsg353Y4JgT0",
    authDomain: "teamkompass-b8aac.firebaseapp.com",
    projectId: "teamkompass-b8aac",
    storageBucket: "teamkompass-b8aac.firebasestorage.app",
    messagingSenderId: "942049581058",
    appId: "1:942049581058:web:9d92343bb4037b80186f1b",
    measurementId: "G-HSSGEM2KL7"
  }
};

const responsiveStyles = document.createElement("link");
responsiveStyles.rel = "stylesheet";
responsiveStyles.href = "./responsive-enhancements.css?v=2";
document.head.append(responsiveStyles);

window.TEAMKOMPASS_VERSION = "responsive-v2";
document.querySelector(".brand strong").textContent = "1. FC Königstein U14";
