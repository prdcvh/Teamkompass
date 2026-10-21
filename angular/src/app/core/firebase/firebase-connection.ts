import { Injectable } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { openFirestore, wipeFirestore } from './firestore-cache';

export interface FirebaseSdk {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Firestore;
}

/**
 * Einzige Stelle, die die Firebase-App startet. Das SDK wird erst beim ersten Zugriff per
 * `import()` geladen, damit der Start der App nicht darauf wartet. Alle Pfade der Zugriffsklassen
 * liegen unter teams/{teamId}/… (Datenmodell und Zugriffsregeln: firestore.rules).
 * Firestore nutzt den lokalen Browser-Speicher (SCRUM-199); beim Abmelden wird er geleert ({@link clearLocalCache}).
 */
@Injectable({ providedIn: 'root' })
export class FirebaseConnection {
  private sdk?: Promise<FirebaseSdk>;

  get(): Promise<FirebaseSdk> {
    this.sdk ??= (async () => {
      const [{ initializeApp }, { getAuth }, firestore] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      const app = initializeApp(environment.firebase);
      return { app, auth: getAuth(app), db: openFirestore(app, firestore) };
    })();
    return this.sdk;
  }

  /**
   * Beendet Firestore, löscht den lokalen Speicher und startet danach eine frische Firestore-Instanz (Anmeldung und App
   * bleiben bestehen). Nachfolgende {@link get}-Aufrufe warten, bis das fertig ist. Aufrufe laufen nacheinander.
   */
  async clearLocalCache(): Promise<boolean> {
    const previous = await this.get();
    let cleared = false;
    this.sdk = (async () => {
      const firestore = await import('firebase/firestore');
      cleared = await wipeFirestore(previous.db, firestore);
      return { ...previous, db: openFirestore(previous.app, firestore) };
    })();
    await this.sdk;
    return cleared;
  }
}
