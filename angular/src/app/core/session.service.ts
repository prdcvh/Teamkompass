import { Injectable, signal } from '@angular/core';
import type { Role } from './role';

/**
 * Angemeldeter Zustand der App. Die Anmeldung selbst (Firebase Auth, members/{uid})
 * kommt mit SCRUM-44 und setzt hier Rolle und Namen; bis dahin ist die App Trainer-Ansicht.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly role = signal<Role>('trainer');
  readonly displayName = signal('Trainer');

  /** Kürzel für das runde Namensschild, z. B. „Pascal von Hinueber“ → „PH“. */
  initials(): string {
    const parts = this.displayName().trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] ?? '');
    return (first + last).toUpperCase();
  }
}
