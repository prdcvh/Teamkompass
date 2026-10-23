import type { RawDoc } from '../firebase/types';
import { type Role, normalizeRole } from '../auth/role';

/**
 * Passwortrichtlinie für neue Trainer- und Medizin-Konten (SCRUM-58): mindestens 12 Zeichen mit Groß- und
 * Kleinbuchstaben und einer Ziffer. Die Referenz-App erlaubte früher nur 6 Zeichen.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_EXPIRY_DAYS = 365;

/** Rollen, für die ein Einladungscode erzeugt werden kann. */
export type InviteRole = 'player' | 'parent';
/** Konten mit E-Mail und Passwort: Trainer, Scout (Leistungsdaten) und Medizin (Gesundheitsdaten), SCRUM-170. */
export type StaffRole = 'trainer' | 'scout' | 'physio';

export const INVITE_ROLES: readonly { readonly value: InviteRole; readonly label: string }[] = [
  { value: 'player', label: 'Spieler' },
  { value: 'parent', label: 'Eltern' },
];

/** Ein Zugang aus der Liste: bestehendes Mitglied (members) oder noch offener Einladungscode (invites). */
export interface AccessEntry {
  readonly kind: 'member' | 'invite';
  /** members: UID; invites: der Code selbst. */
  readonly id: string;
  readonly role: Role;
  readonly playerId: string | null;
  readonly email: string;
  readonly expiresAt: Date | null;
}

/** Kryptografisch starker Einladungscode: 24 Zufallsbytes als 48 Hex-Zeichen (wie die Referenz-App). */
export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Team-IDs im Einladungslink: nur harmlose Zeichen (Firestore-IDs und die bestehenden Kennungen wie „mein-team“). */
export const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Einladungslink für Spieler/Eltern mit Team (SCRUM-181): Bei einem Build für alle Teams muss das Team im Link stehen.
 * Die Anmeldeseite füllt damit den Code ein und löst ihn im richtigen Team ein.
 */
export function playerInviteLink(origin: string, teamId: string, code: string): string {
  const params = new URLSearchParams({ team: teamId, code });
  return `${origin}/anmelden?${params.toString()}`;
}

/** Ablaufdatum „N Tage ab jetzt“; null = unbefristet. */
export function expiryFromDays(days: number | null, now: Date = new Date()): Date | null {
  return days === null ? null : new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Liest das Befristungsfeld: leer = unbefristet (`null`), sonst eine ganze Zahl von 1 bis 365 Tagen.
 * Ungültige Eingaben ergeben `undefined` (statt wie in der Referenz still unbefristet zu werden).
 */
export function parseExpiryDays(input: string): number | null | undefined {
  const text = input.trim();
  if (text === '') return null;
  if (!/^\d+$/.test(text)) return undefined;
  const days = Number(text);
  return days >= 1 && days <= MAX_EXPIRY_DAYS ? days : undefined;
}

export interface StaffDraft {
  readonly email: string;
  readonly password: string;
  readonly repeat: string;
}

export type StaffErrors = Partial<Record<keyof StaffDraft, string>>;

/** Meldung zur Passwortrichtlinie (leer = in Ordnung). Gilt für neue und geänderte Passwörter. */
export function passwordProblem(password: string): string {
  if (password.length < MIN_PASSWORD_LENGTH) return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen haben.`;
  if (!/\p{Ll}/u.test(password) || !/\p{Lu}/u.test(password) || !/\d/.test(password)) {
    return 'Das Passwort braucht Groß- und Kleinbuchstaben und mindestens eine Ziffer.';
  }
  return '';
}

export function validateStaffDraft(draft: StaffDraft): StaffErrors {
  const errors: StaffErrors = {};
  const email = draft.email.trim();
  if (!email) errors.email = 'Bitte eine E-Mail-Adresse eingeben.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Bitte eine gültige E-Mail-Adresse eingeben.';
  const problem = passwordProblem(draft.password);
  if (problem) errors.password = problem;
  if (!errors.password && draft.repeat !== draft.password) errors.repeat = 'Die beiden Passwörter stimmen nicht überein.';
  return errors;
}

function dateOf(value: unknown): Date | null {
  const date = (value as { toDate?: () => Date } | null | undefined)?.toDate?.();
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * members-Dokument → Eintrag; Trainer-Konten werden hier nicht verwaltet (wie in der Referenz) und ergeben null.
 * Bisherige Scout-Konten mit der alten Kennung „medical“ erscheinen als Scout (SCRUM-170).
 */
export function memberEntry(doc: RawDoc): AccessEntry | null {
  const role = normalizeRole(doc.data['role']);
  if (!role || role === 'trainer') return null;
  return {
    kind: 'member',
    id: doc.id,
    role,
    playerId: typeof doc.data['playerId'] === 'string' ? doc.data['playerId'] : null,
    email: typeof doc.data['email'] === 'string' ? doc.data['email'] : '',
    expiresAt: dateOf(doc.data['expiresAt']),
  };
}

export function inviteEntry(doc: RawDoc): AccessEntry | null {
  const role = (['player', 'parent'] as const).find((value) => value === doc.data['role']);
  if (!role || typeof doc.data['playerId'] !== 'string') return null;
  return { kind: 'invite', id: doc.id, role, playerId: doc.data['playerId'], email: '', expiresAt: dateOf(doc.data['expiresAt']) };
}

export function roleLabel(role: Role): string {
  switch (role) {
    case 'parent':
      return 'Eltern';
    case 'scout':
      return 'Scout (Leistungsdaten, keine Gesundheitsdaten)';
    case 'physio':
      return 'Medizin (Status, Abwesenheiten, Verletzungen, Messwerte)';
    case 'trainer':
      return 'Trainer';
    default:
      return 'Spieler';
  }
}

export function isExpired(entry: Pick<AccessEntry, 'expiresAt'>, now: Date = new Date()): boolean {
  return entry.expiresAt !== null && entry.expiresAt.getTime() < now.getTime();
}

function germanDate(date: Date): string {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Gültigkeit in Worten für die Liste. */
export function validityText(entry: Pick<AccessEntry, 'expiresAt'>, now: Date = new Date()): string {
  if (!entry.expiresAt) return 'Unbegrenzt gültig';
  return isExpired(entry, now) ? `Abgelaufen seit ${germanDate(entry.expiresAt)}` : `Gültig bis ${germanDate(entry.expiresAt)}`;
}

/** Zugänge sortiert: offene Einladungen zuerst, dann nach Rolle und Namen. */
export function sortEntries(entries: readonly AccessEntry[], nameOf: (entry: AccessEntry) => string): AccessEntry[] {
  const order: Record<string, number> = { invite: 0, member: 1 };
  return [...entries].sort(
    (a, b) => order[a.kind] - order[b.kind] || nameOf(a).localeCompare(nameOf(b), 'de') || a.id.localeCompare(b.id),
  );
}

/** „Der Scout-Zugang“ / „Der Medizin-Zugang“ / „Das Trainer-Konto“ für Meldungen. */
export function staffLabel(role: StaffRole): string {
  if (role === 'scout') return 'Der Scout-Zugang';
  if (role === 'physio') return 'Der Medizin-Zugang';
  return 'Das Trainer-Konto';
}
