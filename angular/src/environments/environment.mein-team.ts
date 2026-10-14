import { firebaseConfig } from './firebase';

// Live-Team U14 (heute outputs/team-manager). Nur für den Umstieg (SCRUM-76), nicht deployen ohne PO-Freigabe.
export const environment = {
  teamId: 'mein-team',
  clubName: '1. FC Königstein',
  teamLabel: 'U14',
  teamName: '1. FC Königstein U14',
  firebase: firebaseConfig,
} as const;
