import { Injectable, inject } from '@angular/core';
import type { ClubOverviewData } from '../club/club-overview';
import type { ClubInvite } from '../registration/registration';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc } from './types';

/** Ein Team des Vereins (Team-Dokument `teams/{teamId}`). */
export interface ClubTeamInfo {
  readonly teamId: string;
  readonly name: string;
  readonly label: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Vereinsübersicht (SCRUM-183). Lesen für den Vereinsadmin über alle Teams seines Vereins – die Regeln erlauben ihm
 * nur Daten ohne Gesundheitsangaben (kein Spielerdokument, keine Abwesenheiten/Messwerte, keine Absagegründe).
 * Schreiben: nur Trainercodes und das Entfernen von Trainer-Zugängen; die Kurzfassung schreibt der Trainer-Client.
 */
@Injectable({ providedIn: 'root' })
export class ClubApi {
  private readonly connection = inject(FirebaseConnection);

  /** Teams des Vereins (die Regel verlangt genau diesen Filter). */
  async readTeams(clubId: string): Promise<ClubTeamInfo[]> {
    const { db } = await this.connection.get();
    const { collection, getDocs, query, where } = await import('firebase/firestore');
    const snapshot = await getDocs(query(collection(db, 'teams'), where('clubId', '==', clubId)));
    return snapshot.docs.map((entry) => ({ teamId: entry.id, name: text(entry.data()['name']), label: text(entry.data()['label']) }));
  }

  async readMembers(teamId: string): Promise<RawDoc[]> {
    return this.readCollection(teamId, 'members');
  }

  async readEvents(teamId: string): Promise<RawDoc[]> {
    return this.readCollection(teamId, 'events');
  }

  async readPlayerStats(teamId: string): Promise<RawDoc[]> {
    return this.readCollection(teamId, 'playerStats');
  }

  async readOverview(teamId: string): Promise<Readonly<Record<string, unknown>> | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'teams', teamId, 'meta', 'clubOverview'));
    return snapshot.exists() ? snapshot.data() : null;
  }

  /** Trainer-Client: Kurzfassung des Kaders schreiben (Zeitpunkt vom Server, wie es die Regel verlangt). */
  async writeOverview(teamId: string, data: ClubOverviewData): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', teamId, 'meta', 'clubOverview'), {
      version: data.version,
      playerCount: data.playerCount,
      consentPending: data.consentPending,
      consentRevoked: data.consentRevoked,
      players: data.players.map((player) => ({ id: player.id, name: player.name, number: player.number, positions: [...player.positions] })),
      updatedAt: serverTimestamp(),
    });
  }

  /** Trainer-Zugang aus einem Team des eigenen Vereins entfernen (die Regel erlaubt nur Rolle „trainer“). */
  async removeMember(teamId: string, uid: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'teams', teamId, 'members', uid));
  }

  /** Offene Trainercodes des Vereins (Liste nur mit Filter clubId). */
  async readTrainerInvites(clubId: string): Promise<ClubInvite[]> {
    const { db } = await this.connection.get();
    const { collection, getDocs, query, where } = await import('firebase/firestore');
    const snapshot = await getDocs(query(collection(db, 'clubInvites'), where('clubId', '==', clubId)));
    return snapshot.docs
      .filter((entry) => entry.data()['kind'] === 'trainer')
      .map((entry) => {
        const data = entry.data();
        return {
          code: entry.id,
          kind: 'trainer' as const,
          clubId,
          teamId: text(data['teamId']),
          teamName: text(data['teamName']),
          expiresAt: (data['expiresAt'] as { toDate?: () => Date } | null)?.toDate?.() ?? null,
          email: typeof data['email'] === 'string' && data['email'] ? data['email'] : null,
        };
      });
  }

  async createTrainerInvite(invite: {
    code: string;
    clubId: string;
    teamId: string;
    teamName: string;
    expiresAt: Date;
    email: string | null;
    createdBy: string;
  }): Promise<void> {
    const { db } = await this.connection.get();
    const { Timestamp, doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'clubInvites', invite.code), {
      kind: 'trainer',
      clubId: invite.clubId,
      teamId: invite.teamId,
      teamName: invite.teamName,
      expiresAt: Timestamp.fromDate(invite.expiresAt),
      createdAt: serverTimestamp(),
      email: invite.email,
      createdBy: invite.createdBy,
    });
  }

  async deleteInvite(code: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'clubInvites', code));
  }

  private async readCollection(teamId: string, name: string): Promise<RawDoc[]> {
    const { db } = await this.connection.get();
    const { collection, getDocs } = await import('firebase/firestore');
    const snapshot = await getDocs(collection(db, 'teams', teamId, name));
    return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
  }
}
