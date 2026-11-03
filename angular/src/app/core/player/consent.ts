/**
 * Einwilligung für Gesundheitsdaten (SCRUM-245, PO-Entscheidung zu SCRUM-173 vom 02.11.2026):
 * - „widerrufen“: Spieler, Eltern und Medizin sehen keine Gesundheitsdaten mehr (die Regeln sperren das Lesen), der
 *   Trainer sieht alles und bekommt die Aufgabe „Daten prüfen und löschen“ – gelöscht wird nie automatisch.
 * - „offen“ in den eigenen Teams: alles wie bisher.
 * - Fremde Vereine (jedes Team außer den eigenen): Gesundheitsdaten nur mit dokumentierter Einwilligung.
 * Die Regeln (firestore.rules, `isOwnTeam`) entscheiden; die App zeigt dieselbe Grenze vorher an.
 */
import type { Player } from './player';

/** Die eigenen Teams (1. FC Königstein). Gleiche Liste wie `isOwnTeam()` in firestore.rules (tests/consent.test.mjs). */
export const OWN_TEAM_IDS: readonly string[] = ['mein-team', 'U14', 'U15', 'U17'];

/** Gilt für dieses Team die volle Sperre ohne dokumentierte Einwilligung (fremder Verein)? */
export function requiresDocumentedConsent(teamId: string): boolean {
  return !OWN_TEAM_IDS.includes(teamId);
}

/** Dürfen für diesen Spieler Gesundheitsdaten gespeichert werden (Status außer „Fit“, Abwesenheiten, Messwerte, Absagegrund)? */
export function mayStoreHealth(player: Pick<Player, 'consentStatus'> | null | undefined, teamId: string): boolean {
  return !requiresDocumentedConsent(teamId) || player?.consentStatus === 'granted';
}

/** Darf der Spieler bzw. dürfen die Eltern bei einer Absage einen Grund angeben? */
export function mayGiveReason(player: Pick<Player, 'consentStatus'> | null | undefined, teamId: string): boolean {
  return player?.consentStatus !== 'revoked' && mayStoreHealth(player, teamId);
}

/** Hinweis, wenn Speichern gesperrt ist. */
export function healthLockedMessage(name: string): string {
  return `Für ${name} fehlt die dokumentierte Einwilligung. Gesundheitsdaten (Verletzung, Abwesenheit mit Grund, Messwerte) lassen sich erst speichern, wenn die Einwilligung im Profil dokumentiert ist.`;
}

/** Gesundheitsangaben im Spielerdokument selbst (Status außer „Fit“, „verletzt bis/seit“)? */
export function hasHealthFields(player: Pick<Player, 'status' | 'injuryUntil' | 'injuredSince'>): boolean {
  return player.status !== 'Fit' || !!player.injuryUntil || !!player.injuredSince;
}

/** Hinweis für Spieler und Eltern, wenn die Gesundheitsdaten ausgeblendet sind. */
export const HEALTH_HIDDEN_TEXT =
  'Die Einwilligung für Gesundheitsdaten ist widerrufen. Status, Verletzungen, Abwesenheiten und Messwerte werden hier deshalb nicht angezeigt.';

/** Einwilligungstext aus SCRUM-173 (vom PO am 02.11.2026 freigegeben; Prüfung durch Verein/Datenschutzbeauftragten empfohlen). */
export const CONSENT_TITLE = 'Einwilligung in die Verarbeitung von Gesundheitsdaten in TeamKompass';

export function consentTextParagraphs(club: string): readonly string[] {
  const who = club.trim() || '(Name Verein/Team)';
  return [
    `Wir (${who}) nutzen TeamKompass, um Training und Spiele zu planen. Dafür speichern wir Leistungsdaten (Noten, Anwesenheit, Einsatzzeiten).`,
    'Mit deiner / Ihrer Einwilligung speichern wir zusätzlich Gesundheitsdaten: Verletzungen und Ausfälle, Größe und Gewicht sowie, falls genutzt, deine Angaben zu Müdigkeit, Schlaf, Muskelkater und Stress. Sie dienen nur dazu, die Belastung zu steuern und Verletzungen vorzubeugen.',
    'Sehen können sie: das Trainerteam, und nur die eigenen Daten du selbst bzw. deine Eltern. [Medizin-Rolle: nur falls vorhanden.]',
    'Die Einwilligung ist freiwillig; ohne sie darfst du / darf Ihr Kind trotzdem mitspielen, wir speichern dann keine Gesundheitsdaten.',
    'Bei Spielern unter 16 Jahren geben die Eltern die Einwilligung, ab 16 geben sie Spieler und Eltern gemeinsam.',
    'Du kannst / Sie können sie jederzeit ohne Angabe von Gründen widerrufen, mit Wirkung für die Zukunft; die bis dahin erfolgte Verarbeitung bleibt rechtmäßig. Widerruf an: [Kontakt]. Wir löschen die Daten dann auf Wunsch.',
  ];
}

export const CONSENT_SIGNATURE_LINE = 'Datum, Name, Unterschrift Spieler/Eltern';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

/** Druckfassung (für `FileOutput.print`): Text, Name des Spielers und Unterschriftszeile. */
export function consentPrintHtml(club: string, playerName: string): string {
  const paragraphs = consentTextParagraphs(club)
    .map((text) => `<p>${escapeHtml(text)}</p>`)
    .join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(CONSENT_TITLE)}</title></head><body><h1>${escapeHtml(CONSENT_TITLE)}</h1><p class="player">Spieler/in: <strong>${escapeHtml(playerName)}</strong></p>${paragraphs}<div class="sign"><span></span><p>${escapeHtml(CONSENT_SIGNATURE_LINE)}</p></div><div class="sign"><span></span><p>${escapeHtml(CONSENT_SIGNATURE_LINE)}</p></div></body></html>`;
}

export const CONSENT_PRINT_CSS = `
  body { font-family: system-ui, sans-serif; color: #111; line-height: 1.5; max-width: 720px; }
  h1 { font-size: 20px; }
  .player { margin: 12px 0 20px; }
  .sign { margin-top: 48px; }
  .sign span { display: block; border-bottom: 1px solid #111; height: 24px; }
  .sign p { margin: 4px 0 0; font-size: 12px; color: #444; }
  @media print { body { margin: 18mm; } }
`;
