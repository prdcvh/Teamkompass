/**
 * Gemeinsame Logik von App und Backend (SCRUM-198): „Spieler bewertet?“ und das Lesen eines Bewertungsdokuments.
 *
 * Die Quelle ist genau eine: `angular/src/app/core/ratings/` (dort getestet in rating.spec.ts). Sie ist reines
 * TypeScript ohne Angular- oder Firebase-Abhängigkeit und wird hier mitkompiliert, nicht kopiert. So rechnen App und
 * Funktionen immer gleich. tests/functions.test.mjs prüft, dass diese Dateien frei von App-Abhängigkeiten bleiben.
 */
export { type Rating, calculatedGrade, isRated, progress, ratingFromDoc } from '../../../angular/src/app/core/ratings/rating';
