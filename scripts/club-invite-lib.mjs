// Reine Logik fuer scripts/create-club-invite.mjs (SCRUM-181, ohne firebase-admin, damit testbar).
// Registrierung nur mit Einladung (PO-Entscheidung 23.10.2026): Der PO erzeugt fuer einen neuen Verein einen
// Einmal-Code clubInvites/{code}. Darin stehen schon die Zufalls-IDs des kuenftigen Vereins und seines ersten Teams -
// so kann der Code nie einen bestehenden Verein oder ein bestehendes Team erreichen (firestore.rules prueft das).
// Mit --club <clubId> entsteht stattdessen ein Beitrittscode fuer einen bestehenden Verein (neues Team darin).
import { randomInt } from "node:crypto";

/** Alphabet ohne leicht verwechselbare Zeichen (0/O, 1/I); muss zur Regel in firestore.rules passen. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 16;
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{16}$/;
const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const DEFAULT_DAYS = 14;
export const MAX_DAYS = 60;
export const DEFAULT_BASE_URL = "https://teamkompass-u14.web.app";

const USAGE = [
  "Aufruf: node scripts/create-club-invite.mjs [--email <adresse>] [--days <1-60>] [--club <clubId>] [--note <text>] [--apply]",
  "  ohne --club:  Code fuer einen NEUEN Verein (der Einloesende wird Vereinsadmin und erster Trainer)",
  "  mit --club:   Beitrittscode fuer einen bestehenden Verein (neues Team, erster Trainer, kein Admin)"
].join("\n");

function randomString(alphabet, length, random = randomInt) {
  let result = "";
  for (let index = 0; index < length; index += 1) result += alphabet[random(alphabet.length)];
  return result;
}

/** Einladungscode: 16 Zeichen aus 32 (80 Bit Zufall, kryptografisch). */
export function generateCode(random = randomInt) {
  return randomString(CODE_ALPHABET, CODE_LENGTH, random);
}

/** Zufalls-ID wie Firestore-Auto-IDs (20 Zeichen) fuer den kuenftigen Verein bzw. das kuenftige Team. */
export function generateId(random = randomInt) {
  return randomString(ID_ALPHABET, 20, random);
}

/** Lesbare Schreibweise fuer Mail/Chat: ABCD-EFGH-JKLM-NPQR (die App ignoriert Bindestriche und Leerzeichen). */
export function formatCode(code) {
  return code.match(/.{1,4}/g).join("-");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLUB_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Standard ist der Probelauf: geschrieben wird nur mit --apply.
export function parseArgs(argv) {
  const options = { apply: false, email: null, days: DEFAULT_DAYS, clubId: null, note: "", baseUrl: DEFAULT_BASE_URL };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = () => (inline !== undefined ? inline : argv[++index]);
    if (flag === "--apply") options.apply = true;
    else if (flag === "--dry-run") options.apply = false;
    else if (flag === "--email") options.email = value() ?? null;
    else if (flag === "--days") options.days = Number(value());
    else if (flag === "--club") options.clubId = value() ?? null;
    else if (flag === "--note") options.note = value() ?? "";
    else if (flag === "--base-url") options.baseUrl = value() ?? "";
    else if (flag === "--help" || flag === "-h") throw new Error(USAGE);
    else throw new Error(`Unbekannte Option: ${arg}\n${USAGE}`);
  }
  if (options.email !== null) {
    options.email = options.email.trim().toLowerCase();
    if (!EMAIL.test(options.email)) throw new Error(`Ungueltige E-Mail-Adresse: "${options.email}"`);
  }
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > MAX_DAYS) {
    throw new Error(`--days muss eine ganze Zahl von 1 bis ${MAX_DAYS} sein.`);
  }
  if (options.clubId !== null && !CLUB_ID.test(options.clubId)) throw new Error(`Ungueltige Vereins-ID: "${options.clubId}"`);
  if (!/^https:\/\/[^\s/]+$/.test(options.baseUrl)) throw new Error(`--base-url muss eine https-Adresse ohne Pfad sein, z.B. ${DEFAULT_BASE_URL}`);
  options.note = options.note.slice(0, 200);
  return options;
}

/**
 * Plant den Code. state: { clubExists(clubId): boolean, teamExists(teamId): boolean, codeExists(code): boolean }
 * (im Skript aus Firestore gelesen). Ergebnis: { write: { path, data } | null, code, link, errors }.
 * `expiresAt` ist ein Date; das Skript wandelt es in einen Firestore-Zeitstempel.
 */
export function planInvite({ options, state, now = new Date(), random = randomInt, createdAt }) {
  const errors = [];
  const kind = options.clubId ? "team" : "club";
  if (kind === "team" && !state.clubExists(options.clubId)) errors.push(`clubs/${options.clubId} gibt es nicht - Beitrittscodes nur fuer bestehende Vereine.`);
  // Neue IDs, die es garantiert noch nicht gibt (bei einer Kollision neu wuerfeln).
  let clubId = options.clubId;
  for (let attempt = 0; !clubId || (kind === "club" && state.clubExists(clubId)); attempt += 1) {
    if (attempt > 5) throw new Error("Konnte keine freie Vereins-ID erzeugen.");
    clubId = generateId(random);
  }
  let teamId = generateId(random);
  for (let attempt = 0; state.teamExists(teamId); attempt += 1) {
    if (attempt > 5) throw new Error("Konnte keine freie Team-ID erzeugen.");
    teamId = generateId(random);
  }
  let code = generateCode(random);
  for (let attempt = 0; state.codeExists(code); attempt += 1) {
    if (attempt > 5) throw new Error("Konnte keinen freien Code erzeugen.");
    code = generateCode(random);
  }
  if (errors.length) return { write: null, code: null, link: null, errors };
  const expiresAt = new Date(now.getTime() + options.days * 24 * 60 * 60 * 1000);
  const data = { kind, clubId, teamId, expiresAt, createdAt, email: options.email, createdBy: "admin-script" };
  if (options.note) data.note = options.note;
  const link = `${options.baseUrl}/registrieren?code=${code}`;
  return { write: { path: `clubInvites/${code}`, data }, code, link, errors };
}
