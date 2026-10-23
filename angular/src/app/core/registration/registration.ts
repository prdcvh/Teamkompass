import { type StaffErrors, validateStaffDraft } from '../access/access';

/**
 * Registrierung nur mit Einladung (SCRUM-181). Ein Code `clubInvites/{code}` legt fest, was beim Einlösen entsteht:
 * - `club`: ein neuer Verein (der neue Trainer wird Vereinsadmin) samt erstem Team – Code vom PO per Skript;
 * - `team`: ein neues Team in einem bestehenden Verein (kein Adminrecht) – Code vom Vereinsadmin.
 * Vereins- und Team-ID stehen schon im Code. Alles entsteht in einem einzigen Schreibvorgang, der den Code löscht
 * (firestore.rules prüft genau diese Form; Regeltests: tests/rules/registration.test.mjs).
 */
export type ClubInviteKind = 'club' | 'team';

export interface ClubInvite {
  readonly code: string;
  readonly kind: ClubInviteKind;
  readonly clubId: string;
  readonly teamId: string;
  readonly expiresAt: Date | null;
  /** An diese E-Mail gebunden (klein geschrieben) oder null = jede bestätigte Adresse. */
  readonly email: string | null;
}

/** Gleiches Format wie scripts/club-invite-lib.mjs und die Regel für Beitrittscodes: 16 Zeichen ohne 0/O/1/I. */
export const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{16}$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Höchstdauer eines Beitrittscodes (die Regel erlaubt maximal 30 Tage). */
export const JOIN_CODE_DAYS = 14;

/** Altersklassen zur Auswahl; „Andere“ erlaubt eine eigene Bezeichnung. */
export const AGE_GROUPS: readonly string[] = [
  'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19', 'U21', 'U23', 'Erwachsene', 'Senioren',
];

/** Eingabe → Code: Groß, ohne Leerzeichen und Bindestriche (der Code wird gern als ABCD-EFGH-… weitergegeben). */
export function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]+/g, '');
}

export function isInviteCodeFormat(code: string): boolean {
  return INVITE_CODE_PATTERN.test(code);
}

/** Lesbar gruppiert: ABCD-EFGH-JKLM-NPQR. */
export function formatInviteCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? []).join('-');
}

function randomString(alphabet: string, length: number): string {
  // Ablehnungsverfahren gegen Verzerrung: 256 ist ein Vielfaches von 32 und 62 nicht – darum Bytes ≥ Grenze verwerfen.
  const limit = 256 - (256 % alphabet.length);
  let result = '';
  while (result.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && result.length < length) result += alphabet[byte % alphabet.length];
    }
  }
  return result;
}

export function generateJoinCode(): string {
  return randomString(CODE_ALPHABET, 16);
}

/** Zufalls-ID wie eine Firestore-Auto-ID (20 Zeichen) für ein künftiges Team. */
export function generateTeamId(): string {
  return randomString(ID_ALPHABET, 20);
}

export type InviteProblem = 'missing' | 'expired' | 'wrongEmail' | null;

/** Prüft einen gelesenen Code vor dem Einlösen (die Regeln prüfen dasselbe noch einmal). */
export function inviteProblem(invite: ClubInvite | null, email: string | null, now: Date = new Date()): InviteProblem {
  if (!invite) return 'missing';
  if (!invite.expiresAt || invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (invite.email && invite.email !== (email ?? '').toLowerCase()) return 'wrongEmail';
  return null;
}

export function inviteProblemText(problem: InviteProblem): string {
  switch (problem) {
    case 'missing':
      return 'Diesen Einladungscode gibt es nicht (mehr). Er ist vielleicht schon benutzt worden. Bitte frage nach einem neuen Code.';
    case 'expired':
      return 'Dieser Einladungscode ist abgelaufen. Bitte frage nach einem neuen Code.';
    case 'wrongEmail':
      return 'Dieser Einladungscode gilt für eine andere E-Mail-Adresse. Bitte registriere dich mit der Adresse, an die die Einladung ging.';
    default:
      return '';
  }
}

export interface AccountDraft {
  readonly code: string;
  readonly email: string;
  readonly password: string;
  readonly repeat: string;
}

export type AccountErrors = StaffErrors & { code?: string };

/** Konto-Schritt: Code im richtigen Format, E-Mail, Passwort nach der Richtlinie aus SCRUM-58 (wie Trainer-Konten). */
export function validateAccountDraft(draft: AccountDraft): AccountErrors {
  const errors: AccountErrors = { ...validateStaffDraft(draft) };
  const code = normalizeInviteCode(draft.code);
  if (!code) errors.code = 'Bitte den Einladungscode eingeben.';
  else if (!isInviteCodeFormat(code)) errors.code = 'Der Code hat 16 Zeichen (Buchstaben und Ziffern), z. B. ABCD-EFGH-JKLM-NPQR.';
  return errors;
}

export interface TeamDraft {
  /** Nur bei einem Vereinscode: Name des neuen Vereins. */
  readonly clubName: string;
  readonly ageGroup: string;
  readonly teamName: string;
}

export type TeamErrors = Partial<Record<keyof TeamDraft, string>>;

export function validateTeamDraft(draft: TeamDraft, kind: ClubInviteKind): TeamErrors {
  const errors: TeamErrors = {};
  if (kind === 'club') {
    const club = draft.clubName.trim();
    if (!club) errors.clubName = 'Bitte den Namen des Vereins eingeben.';
    else if (club.length > 100) errors.clubName = 'Höchstens 100 Zeichen.';
  }
  const label = draft.ageGroup.trim();
  if (!label) errors.ageGroup = 'Bitte die Altersklasse wählen oder eintragen.';
  else if (label.length > 40) errors.ageGroup = 'Höchstens 40 Zeichen.';
  const team = draft.teamName.trim();
  if (!team) errors.teamName = 'Bitte einen Teamnamen eingeben.';
  else if (team.length > 100) errors.teamName = 'Höchstens 100 Zeichen.';
  return errors;
}

/** Vorschlag für den Teamnamen: „Vereinsname Altersklasse“. */
export function suggestTeamName(clubName: string, ageGroup: string): string {
  return [clubName.trim(), ageGroup.trim()].filter(Boolean).join(' ').slice(0, 100);
}

/** Platzhalter für den Server-Zeitstempel; die Zugriffsklasse ersetzt ihn durch `serverTimestamp()`. */
export const SERVER_TIME = Symbol('serverTime');
export type WriteValue = string | boolean | null | typeof SERVER_TIME;

export interface RegistrationWrite {
  readonly kind: 'set' | 'delete';
  readonly path: readonly string[];
  readonly data?: Readonly<Record<string, WriteValue>>;
}

/**
 * Der eine Schreibvorgang der Registrierung. Reihenfolge und Felder genau wie in den Regeln verlangt:
 * Code löschen; bei Vereinscode Verein + eigener Admin-Eintrag (mit dem Code); Team mit sich selbst als erstem Trainer;
 * eigener Trainer-Zugang mit `uid` (Teamsuche) und dem verbrauchten Code.
 */
export function registrationWrites(input: {
  readonly uid: string;
  readonly email: string;
  readonly invite: ClubInvite;
  readonly draft: TeamDraft;
}): RegistrationWrite[] {
  const { uid, email, invite, draft } = input;
  const writes: RegistrationWrite[] = [{ kind: 'delete', path: ['clubInvites', invite.code] }];
  if (invite.kind === 'club') {
    writes.push({ kind: 'set', path: ['clubs', invite.clubId], data: { name: draft.clubName.trim(), logoUrl: null, createdAt: SERVER_TIME } });
    writes.push({
      kind: 'set',
      path: ['clubs', invite.clubId, 'admins', uid],
      data: { uid, role: 'admin', createdAt: SERVER_TIME, inviteCode: invite.code },
    });
  }
  writes.push({
    kind: 'set',
    path: ['teams', invite.teamId],
    data: {
      clubId: invite.clubId,
      name: draft.teamName.trim(),
      label: draft.ageGroup.trim(),
      hasTrainer: true,
      firstTrainerUid: uid,
      createdAt: SERVER_TIME,
    },
  });
  writes.push({
    kind: 'set',
    path: ['teams', invite.teamId, 'members', uid],
    data: { role: 'trainer', email, uid, createdAt: SERVER_TIME, claimedInviteCode: invite.code },
  });
  return writes;
}

/** Link zur Registrierung mit eingetragenem Code (für Mail/Chat; nach der E-Mail-Bestätigung geht es dort weiter). */
export function registrationLink(origin: string, code: string): string {
  return `${origin}/registrieren?code=${encodeURIComponent(code)}`;
}
