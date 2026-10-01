// Firebase-Web-Konfiguration ist öffentlich (kein Geheimnis) – der Zugriffsschutz
// liegt in firestore.rules. Dieselbe Konfiguration nutzen die bestehenden Team-Apps.
export const environment = {
  teamId: 'U14',
  teamName: '1. FC Königstein U14',
  firebase: {
    apiKey: 'AIzaSyCJbajbFdiUFumwIGFN-UXxsg353Y4JgT0',
    authDomain: 'teamkompass-b8aac.firebaseapp.com',
    projectId: 'teamkompass-b8aac',
    storageBucket: 'teamkompass-b8aac.firebasestorage.app',
    messagingSenderId: '942049581058',
    appId: '1:942049581058:web:9d92343bb4037b80186f1b',
    measurementId: 'G-HSSGEM2KL7',
  },
} as const;
