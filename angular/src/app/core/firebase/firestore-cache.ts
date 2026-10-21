import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';

/** Der Teil des Firestore-SDK, den dieses Modul braucht (damit Tests ein Ersatz-SDK übergeben können). */
export type FirestoreSdk = Pick<
  typeof import('firebase/firestore'),
  | 'initializeFirestore'
  | 'getFirestore'
  | 'persistentLocalCache'
  | 'persistentMultipleTabManager'
  | 'terminate'
  | 'clearIndexedDbPersistence'
>;

/**
 * Startet Firestore mit lokalem Speicher im Browser (IndexedDB, auch mit mehreren Tabs): ein zweites Öffnen der App
 * liest unveränderte Daten aus dem Speicher statt erneut vom Server (SCRUM-199, weniger Lesezugriffe). Ist der
 * Browser-Speicher nicht nutzbar (z. B. privates Fenster, gesperrt), läuft die App wie bisher ohne ihn.
 */
export function openFirestore(app: FirebaseApp, sdk: FirestoreSdk): Firestore {
  try {
    return sdk.initializeFirestore(app, {
      localCache: sdk.persistentLocalCache({ tabManager: sdk.persistentMultipleTabManager() }),
    });
  } catch (error) {
    console.warn('Lokaler Speicher für Firestore nicht verfügbar, die App läuft ohne.', error);
    return sdk.getFirestore(app);
  }
}

/**
 * Datenschutz: beendet Firestore und löscht den lokalen Speicher (Teamdaten, auch von Minderjährigen, dürfen nach dem
 * Abmelden nicht im Browser liegen bleiben). Danach muss {@link openFirestore} eine frische Instanz liefern.
 * Gibt zurück, ob der Speicher geleert werden konnte (false z. B. wenn ein anderer Tab ihn noch geöffnet hat).
 */
export async function wipeFirestore(db: Firestore, sdk: FirestoreSdk): Promise<boolean> {
  try {
    await sdk.terminate(db);
  } catch (error) {
    console.warn('Firestore konnte nicht beendet werden.', error);
  }
  try {
    await sdk.clearIndexedDbPersistence(db);
    return true;
  } catch (error) {
    console.warn('Lokaler Firestore-Speicher konnte nicht geleert werden.', error);
    return false;
  }
}
