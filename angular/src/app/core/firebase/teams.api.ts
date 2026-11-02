import { Injectable, inject } from '@angular/core';
import type { TeamMembership, TeamMeta } from '../team/current-team.service';
import { logoFromDoc } from '../registration/club-logo';
import { FirebaseConnection } from './firebase-connection';

function dateOf(value: unknown): Date | null {
  const date = (value as { toDate?: () => Date } | null | undefined)?.toDate?.();
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** „Meine Teams“ und Team-/Vereinsangaben (Datenmodell Verein → Teams, docs/architektur-verein-teams.md §11). */
@Injectable({ providedIn: 'root' })
export class TeamsApi {
  private readonly connection = inject(FirebaseConnection);

  /**
   * Alle Mitgliedschaften des Kontos über alle Teams (members mit Feld uid = eigene UID). Die Regeln erlauben die
   * Abfrage nur mit genau diesem Filter. Abgelaufene Zugänge kommen mit – ausblenden: activeMemberships().
   */
  async readMyMemberships(uid: string): Promise<TeamMembership[]> {
    const { db } = await this.connection.get();
    const { collectionGroup, getDocs, query, where } = await import('firebase/firestore');
    const snapshot = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)));
    return snapshot.docs
      .filter((entry) => entry.ref.parent.parent?.parent.id === 'teams')
      .map((entry) => {
        const data = entry.data();
        return {
          teamId: entry.ref.parent.parent!.id,
          role: text(data['role']),
          playerId: typeof data['playerId'] === 'string' ? data['playerId'] : null,
          expiresAt: dateOf(data['expiresAt']),
        };
      });
  }

  /** Name, Altersklasse und Verein eines Teams. null, wenn es (noch) kein Team-Dokument gibt (Altteams vor dem Skript). */
  async readTeamMeta(teamId: string): Promise<TeamMeta | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const team = await getDoc(doc(db, 'teams', teamId));
    if (!team.exists()) return null;
    const data = team.data();
    const clubId = typeof data['clubId'] === 'string' && data['clubId'] ? data['clubId'] : null;
    let clubName = '';
    let logoUrl: string | null = null;
    if (clubId) {
      const club = await getDoc(doc(db, 'clubs', clubId));
      if (club.exists()) {
        clubName = text(club.data()['name']);
        // Nur zulässige Bilder (data:-URL, SCRUM-182) – alles andere würde die CSP ohnehin blockieren.
        logoUrl = logoFromDoc(club.data()['logoUrl']);
      }
    }
    return { name: text(data['name']), label: text(data['label']), clubId, clubName, logoUrl };
  }
}
