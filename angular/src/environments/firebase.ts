// Firebase-Web-Konfiguration ist öffentlich (kein Geheimnis) – der Zugriffsschutz
// liegt in firestore.rules. Alle Teams nutzen dasselbe Firebase-Projekt; getrennt
// wird über die teamId (Pfad teams/<teamId>/…).
export const firebaseConfig = {
  apiKey: 'AIzaSyCJbajbFdiUFumwIGFN-UXxsg353Y4JgT0',
  authDomain: 'teamkompass-b8aac.firebaseapp.com',
  projectId: 'teamkompass-b8aac',
  storageBucket: 'teamkompass-b8aac.firebasestorage.app',
  messagingSenderId: '942049581058',
  appId: '1:942049581058:web:9d92343bb4037b80186f1b',
  measurementId: 'G-HSSGEM2KL7',
} as const;

/**
 * App Check (Schutz vor Missbrauch, SCRUM-181/SCRUM-59): reCAPTCHA-Enterprise-Websiteschlüssel (öffentlich, kein
 * Geheimnis). Leer = App Check aus – so bleibt es, bis der PO den Schlüssel in der Firebase-Konsole angelegt hat
 * (Anleitung: FIREBASE_SETUP.md, Abschnitt 10). Erst danach in der Konsole „erzwingen“, sonst sperrt Firebase die App aus.
 */
export const appCheckSiteKey = '';
