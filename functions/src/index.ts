/**
 * Einstieg der Cloud Functions (SCRUM-198). Jede exportierte Funktion wird beim Merge nach `main` deployt.
 * Neue Funktion: eigene Datei in src/, hier exportieren, Test dazu (FIREBASE_SETUP.md, Abschnitt 14).
 */
import './options';

export { healthCheck } from './health';
