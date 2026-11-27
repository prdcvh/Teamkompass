/**
 * Globale Optionen für alle Funktionen (SCRUM-198). Muss vor dem Definieren der Funktionen geladen werden
 * (siehe index.ts).
 *
 * - Region europe-west3 (Frankfurt): Datenschutz, die Daten bleiben in der EU. Keine Funktion setzt eine eigene Region.
 * - maxInstances: Obergrenze gegen Kostenexplosion, z. B. bei vielen Aufrufen der öffentlichen Beispielfunktion.
 */
import { setGlobalOptions } from 'firebase-functions/v2';

export const REGION = 'europe-west3';
export const MAX_INSTANCES = 3;

setGlobalOptions({ region: REGION, maxInstances: MAX_INSTANCES });
