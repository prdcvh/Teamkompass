import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Vereine, zu denen das mitgelieferte Logo (public/club-logo.png) gehört. */
const BUILD_LOGO_CLUBS: readonly string[] = ['fc-koenigstein', 'test-verein'];

/** Eine Mitgliedschaft aus der Teamsuche (`members` mit eigener uid, SCRUM-180/181). */
export interface TeamMembership {
  readonly teamId: string;
  readonly role: string;
  readonly playerId: string | null;
  readonly expiresAt: Date | null;
}

/** Anzeige-Angaben eines Teams aus `teams/{teamId}` und `clubs/{clubId}`. */
export interface TeamMeta {
  readonly name: string;
  readonly label: string;
  readonly clubId: string | null;
  readonly clubName: string;
  readonly logoUrl: string | null;
}

/** Zuletzt gewähltes Team auf diesem Gerät (nur die ID, keine Teamdaten). */
export const LAST_TEAM_KEY = 'teamkompass.lastTeam';

/**
 * Das aktuelle Team (SCRUM-181, „ein Build für alle“). Alle Zugriffsklassen unter `core/firebase/` lesen die Team-ID
 * von hier statt aus `environment.teamId`. Ohne Teamsuche (z. B. vor dem Lauf von scripts/assign-clubs.mjs) bleibt es
 * beim Team des Builds – die bestehenden Team-Builds laufen so unverändert weiter.
 */
@Injectable({ providedIn: 'root' })
export class CurrentTeam {
  /** Team des Builds: Rückfall, wenn die Datenbank (noch) keine Teams liefert. */
  readonly fallbackId: string = environment.teamId;
  readonly id = signal<string>(environment.teamId);
  readonly name = signal<string>(environment.teamName);
  readonly label = signal<string>(environment.teamLabel);
  readonly clubName = signal<string>(environment.clubName);
  readonly clubId = signal<string | null>(null);
  readonly logoUrl = signal<string | null>(null);
  /** Alle (nicht abgelaufenen) Teams des Kontos – mehr als eins → Teamauswahl. */
  readonly choices = signal<readonly TeamChoice[]>([]);
  /** „Verein · Team“ für Kopfzeilen. */
  readonly title = computed(() => [this.clubName(), this.label()].filter(Boolean).join(' · '));
  /**
   * Logo: aus der Datenbank, sonst das mitgelieferte Vereinslogo – aber nur für die Vereine, für die es gebaut wurde
   * (ein neuer Verein bekommt nicht das Logo des 1. FC Königstein).
   */
  readonly logoSrc = computed(() => this.logoUrl() ?? (this.clubId() === null || BUILD_LOGO_CLUBS.includes(this.clubId()!) ? 'club-logo.png' : null));

  select(teamId: string): void {
    if (teamId !== this.id()) {
      this.id.set(teamId);
      // Bis die Angaben aus der Datenbank da sind, nur neutral beschriften – nie den Namen eines anderen Teams zeigen.
      const known = this.choices().find((choice) => choice.teamId === teamId);
      this.applyMeta(known?.meta ?? null);
    }
    rememberTeam(teamId);
  }

  applyMeta(meta: TeamMeta | null): void {
    if (!meta) {
      const own = this.id() === this.fallbackId;
      this.name.set(own ? environment.teamName : 'Team');
      this.label.set(own ? environment.teamLabel : '');
      this.clubName.set(own ? environment.clubName : '');
      this.clubId.set(null);
      this.logoUrl.set(null);
      return;
    }
    this.name.set(meta.name);
    this.label.set(meta.label);
    this.clubName.set(meta.clubName);
    this.clubId.set(meta.clubId);
    this.logoUrl.set(meta.logoUrl);
  }

  /** Beim Abmelden: zurück zum Team des Builds, keine Auswahl mehr im Speicher. */
  reset(): void {
    this.choices.set([]);
    this.id.set(this.fallbackId);
    this.applyMeta(null);
  }
}

export interface TeamChoice {
  readonly teamId: string;
  readonly role: string;
  readonly meta: TeamMeta | null;
}

export function rememberedTeam(): string | null {
  try {
    return localStorage.getItem(LAST_TEAM_KEY);
  } catch {
    return null;
  }
}

export function rememberTeam(teamId: string): void {
  try {
    localStorage.setItem(LAST_TEAM_KEY, teamId);
  } catch {
    // privater Modus o. Ä.: dann wird beim nächsten Mal wieder gefragt
  }
}

/** Nur gültige Mitgliedschaften: abgelaufene Zugänge liefert die Teamsuche mit, die App blendet sie aus. */
export function activeMemberships(list: readonly TeamMembership[], now: Date = new Date()): TeamMembership[] {
  const seen = new Set<string>();
  return list.filter((entry) => {
    if (entry.expiresAt && entry.expiresAt.getTime() < now.getTime()) return false;
    if (seen.has(entry.teamId)) return false;
    seen.add(entry.teamId);
    return true;
  });
}

/**
 * Welches Team wird geöffnet? Das zuletzt auf diesem Gerät gewählte (wenn noch gültig), sonst das einzige.
 * Bei mehreren ohne Vorauswahl: null → Teamauswahl.
 */
export function pickTeam(teamIds: readonly string[], remembered: string | null): string | null {
  if (remembered && teamIds.includes(remembered)) return remembered;
  return teamIds.length === 1 ? teamIds[0] : null;
}
