import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { SnapshotMeta } from './types';

/**
 * Messplan (SCRUM-255): die Entscheidungen des Trainers (Rhythmus, Termin, Pause) liegen als Map unter
 * `measurementPlan.{playerId}` im eigenen Dokument `meta/measurementPlan`, das nur Trainer lesen und schreiben
 * (SCRUM-392). Bewusst nicht in `meta/settings`: das Dokument liest auch der Vereinsadmin. Es stehen nur Termine und
 * Entscheidungen darin, nie Messwerte. Einträge, die die erste Fassung noch in `meta/settings` abgelegt hat, übernimmt
 * der Trainer-Client beim ersten Laden und entfernt sie dort.
 */
@Injectable({ providedIn: 'root' })
export class MeasurementPlanApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  async watchPlan(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    await this.migrateLegacyPlan();
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'meta', 'measurementPlan'),
      { includeMetadataChanges: true },
      (snapshot) => onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /**
   * Einmalig (SCRUM-392): Entscheidungen aus `meta/settings.measurementPlan` ins eigene Dokument übernehmen und dort
   * entfernen. Zuerst kopieren, erst nach erfolgreichem Schreiben löschen; bereits neu gesetzte Einträge gewinnen.
   * Ein Fehler hält das Laden nicht auf (beim nächsten Öffnen wird es erneut versucht).
   */
  private async migrateLegacyPlan(): Promise<void> {
    try {
      const { db } = await this.connection.get();
      const { deleteField, doc, getDoc, setDoc, updateDoc } = await import('firebase/firestore');
      const settingsRef = doc(db, 'teams', this.team.id(), 'meta', 'settings');
      const legacy = (await getDoc(settingsRef)).data()?.['measurementPlan'] as Record<string, unknown> | undefined;
      if (legacy === undefined) return;
      const planRef = doc(db, 'teams', this.team.id(), 'meta', 'measurementPlan');
      if (Object.keys(legacy).length > 0) {
        const current = (await getDoc(planRef)).data()?.['measurementPlan'] as Record<string, unknown> | undefined;
        await setDoc(planRef, { measurementPlan: { ...legacy, ...current } });
      }
      await updateDoc(settingsRef, { measurementPlan: deleteField() });
    } catch (error) {
      console.warn('Messplan-Übernahme aus den Teameinstellungen ist fehlgeschlagen', error);
    }
  }

  /** Setzt den Eintrag eines Spielers; `null` entfernt ihn (zurück zum Vorschlag). Andere Spielereinträge bleiben unberührt. */
  async savePlayerPlan(playerId: string, data: Readonly<Record<string, unknown>> | null): Promise<void> {
    const { db } = await this.connection.get();
    const { FieldPath, doc, setDoc, deleteField } = await import('firebase/firestore');
    // mergeFields statt merge: ersetzt den Eintrag dieses Spielers vollständig (ein einfaches merge würde verschachtelte
    // Felder zusammenführen, und eine aufgehobene Pause bliebe gespeichert); die übrigen Spielereinträge bleiben unberührt.
    await setDoc(doc(db, 'teams', this.team.id(), 'meta', 'measurementPlan'), { measurementPlan: { [playerId]: data ?? deleteField() } }, { mergeFields: [new FieldPath('measurementPlan', playerId)] });
  }
}
