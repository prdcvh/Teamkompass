import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { type AccessEntry, type InviteRole, type StaffRole, generateInviteCode, expiryFromDays, inviteEntry, memberEntry } from './access';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { AccessApi } from '../firebase/access.api';
import { SessionService } from '../auth/session.service';

export type AccessLoad = 'idle' | 'loading' | 'ready' | 'error';

export type ActionResult = { ok: true } | { ok: false; message: string };
export type InviteResult = { ok: true; code: string; expiresAt: Date | null } | { ok: false; message: string };

/**
 * Zugangsverwaltung (nur Trainer): Einladungscodes für Spieler/Eltern, bestehende Zugänge sperren und
 * Trainer-/Medizin-Konten anlegen. Die Listen werden einmalig gelesen und nach jeder Änderung neu geladen
 * (kein Echtzeit-Abo; die Regeln erlauben die Listen nur Trainern). Beim Abmelden wird alles verworfen.
 */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly accessApi = inject(AccessApi);
  private readonly session = inject(SessionService);

  readonly entries = signal<readonly AccessEntry[]>([]);
  readonly load = signal<AccessLoad>('idle');
  readonly error = signal('');
  readonly canWrite = computed(() => this.session.role() === 'trainer');

  private generation = 0;

  constructor() {
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  /** Lädt die Listen (auch als „Erneut versuchen“). Nur für Trainer. */
  async reload(): Promise<void> {
    if (!this.canWrite()) return;
    const generation = ++this.generation;
    // Bei einer Aktualisierung bleibt die Liste stehen (kein Flackern), nur der erste Ladevorgang zeigt „lädt“.
    if (this.load() !== 'ready') this.load.set('loading');
    this.error.set('');
    try {
      const [members, invites] = await Promise.all([this.accessApi.readMembers(), this.accessApi.readInvites()]);
      if (generation !== this.generation) return;
      this.entries.set([
        ...invites.map(inviteEntry).filter((entry) => entry !== null),
        ...members.map(memberEntry).filter((entry) => entry !== null),
      ]);
      this.load.set('ready');
    } catch (error) {
      if (generation !== this.generation) return;
      console.error(error);
      this.error.set(`Die Zugänge konnten nicht geladen werden. ${authErrorMessage(errorCode(error))}`);
      this.load.set('error');
    }
  }

  stop(): void {
    this.generation += 1;
    this.entries.set([]);
    this.load.set('idle');
    this.error.set('');
  }

  /** Erzeugt einen Einladungscode. Der Code wird nur hier zurückgegeben und nirgends zwischengespeichert. */
  async createInvite(playerId: string, role: InviteRole, days: number | null): Promise<InviteResult> {
    if (!this.canWrite()) return { ok: false, message: 'Nur Trainer dürfen Zugänge vergeben.' };
    const code = generateInviteCode();
    const expiresAt = expiryFromDays(days);
    try {
      await this.accessApi.createInvite(code, { playerId, role, expiresAt });
    } catch (error) {
      console.error(error);
      return { ok: false, message: `Der Einladungscode konnte nicht erstellt werden. ${authErrorMessage(errorCode(error))}` };
    }
    await this.reload();
    return { ok: true, code, expiresAt };
  }

  /** Sperrt einen Zugang bzw. zieht einen offenen Code zurück. */
  async revoke(entry: AccessEntry): Promise<ActionResult> {
    if (!this.canWrite()) return { ok: false, message: 'Nur Trainer dürfen Zugänge sperren.' };
    try {
      if (entry.kind === 'member') await this.accessApi.deleteMember(entry.id);
      else await this.accessApi.deleteInvite(entry.id);
    } catch (error) {
      console.error(error);
      return { ok: false, message: `Der Zugang konnte nicht gesperrt werden. ${authErrorMessage(errorCode(error))}` };
    }
    await this.reload();
    return { ok: true };
  }

  /** Legt ein Trainer- oder Medizin-Konto an (Anmeldekonto + Zugang in einem Schritt). Das Passwort wird nicht gemerkt. */
  async createStaff(role: StaffRole, email: string, password: string): Promise<ActionResult> {
    if (!this.canWrite()) return { ok: false, message: 'Nur Trainer dürfen Konten anlegen.' };
    try {
      await this.accessApi.createStaffAccount(email.trim(), password, role);
    } catch (error) {
      console.error(error);
      const label = role === 'medical' ? 'Der Scout-Zugang' : 'Das Trainer-Konto';
      return { ok: false, message: `${label} konnte nicht angelegt werden. ${authErrorMessage(errorCode(error))}` };
    }
    if (this.load() === 'ready') await this.reload();
    return { ok: true };
  }
}
