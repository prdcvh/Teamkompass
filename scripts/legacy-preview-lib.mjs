// SCRUM-218: Vorschau-Kopie der Alt-App fuer PR-Vorschauen (reine Logik, testbar).
//
// Die Alt-App (outputs/team-manager) ist fest auf das Live-Team "mein-team" (echte Daten) eingestellt. Fuer die
// PR-Vorschau wird eine Kopie gebaut, deren firebase-config.js auf das Testteam umgestellt ist. Nur diese Kopie
// wird im Vorschau-Kanal ausgeliefert; der Live-Kanal (Merge-Workflow) nutzt weiter outputs/team-manager.

/** Testteam der Vorschau (gleiches Team wie der Angular-Standard-Build, angular/src/environments/environment.ts). */
export const LEGACY_PREVIEW_TEAM_ID = "U14";

/** Hinweis im App-Kopf, damit die Vorschau nie mit der Live-App verwechselt wird. */
export const LEGACY_PREVIEW_LABEL = `Vorschau · Testteam ${LEGACY_PREVIEW_TEAM_ID}`;

/** Zielordner der Vorschau-Kopie fuer einen Alt-App-Ordner: outputs/team-manager -> dist/preview/team-manager. */
export function legacyPreviewDir(sourceDir) {
  const match = /^outputs\/([A-Za-z0-9_-]+)\/?$/.exec(sourceDir ?? "");
  if (!match) throw new Error(`Kein Alt-App-Ordner unter outputs/: "${sourceDir}"`);
  return `dist/preview/${match[1]}`;
}

const TEAM_ID = /(\bteamId:\s*)(["'])([^"']*)\2/g;
const TEAM_NAME = /(\bteamName:\s*)(["'])([^"']*)\2/g;
const BRAND_TEXT = /(\.brand strong"\)\.textContent\s*=\s*)(["'])([^"']*)\2/g;

/**
 * Stellt eine firebase-config.js der Alt-App auf das Testteam um. Wirft, wenn die Datei nicht genau eine
 * teamId enthaelt (fail closed: lieber keine Vorschau als eine mit Live-Daten).
 */
export function legacyPreviewConfig(source) {
  const teamIds = [...source.matchAll(TEAM_ID)];
  if (teamIds.length !== 1) throw new Error(`firebase-config.js muss genau eine teamId enthalten (gefunden: ${teamIds.length}).`);
  const label = (_, prefix, quote, value) => `${prefix}${quote}${value} (${LEGACY_PREVIEW_LABEL})${quote}`;
  return source
    .replace(TEAM_ID, (_, prefix, quote) => `${prefix}${quote}${LEGACY_PREVIEW_TEAM_ID}${quote}`)
    .replace(TEAM_NAME, label)
    .replace(BRAND_TEXT, label);
}
