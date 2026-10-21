import { Injectable, signal } from '@angular/core';
import type { Role } from './role';

/**
 * Angemeldeter Zustand für die Oberfläche: Rolle, Anzeigename, Spielerprofil. Gesetzt wird er
 * ausschließlich vom AuthService; ohne Anmeldung ist die Rolle leer und die App zeigt nichts.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly role = signal<Role | null>(null);
  readonly displayName = signal('');
  /** Spielerprofil, auf das sich Spieler/Eltern beschränken (leer bei Trainer/Medizin). */
  readonly playerId = signal<string | null>(null);
  /** Kennung des angemeldeten Kontos (Firebase Auth); Schlüssel für kontobezogene Cloud-Einstellungen. */
  readonly uid = signal<string | null>(null);
  /** E-Mail-Adresse des Kontos (nur bei E-Mail-Konten, sonst null). Nur zur Anzeige; wird nirgends kopiert. */
  readonly email = signal<string | null>(null);

  /** Kürzel für das runde Namensschild, z. B. „Pascal von Hinueber“ → „PH“. */
  initials(): string {
    const parts = this.displayName().trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] ?? '');
    return (first + last).toUpperCase();
  }

  clear(): void {
    this.role.set(null);
    this.displayName.set('');
    this.playerId.set(null);
    this.uid.set(null);
    this.email.set(null);
  }
}
