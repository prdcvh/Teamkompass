import { Injectable } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

export interface FirebaseSdk {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Firestore;
}

/**
 * Einzige Stelle, die die Firebase-App startet. Das SDK wird erst beim ersten Zugriff per
 * `import()` geladen, damit der Start der App nicht darauf wartet. Alle Pfade der Zugriffsklassen
 * liegen unter teams/{teamId}/… (Datenmodell und Zugriffsregeln: firestore.rules).
 */
@Injectable({ providedIn: 'root' })
export class FirebaseConnection {
  private sdk?: Promise<FirebaseSdk>;

  get(): Promise<FirebaseSdk> {
    this.sdk ??= (async () => {
      const [{ initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      const app = initializeApp(environment.firebase);
      return { app, auth: getAuth(app), db: getFirestore(app) };
    })();
    return this.sdk;
  }
}
