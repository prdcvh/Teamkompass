import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { ClubComparisonApi } from '../firebase/club-comparison.api';
import { todayIso } from '../shared/dates';
import { CurrentTeam } from '../team/current-team.service';
import { TeamService } from '../team/team.service';
import { type ClubComparisonData, type ClubComparisonEntry, comparisonFromDoc, comparisonFromTeam, comparisonKey } from './club-comparison';

/**
 * Status des Vereinsvergleichs für den Trainer:
 * - `no-club`: Das Team gehört (noch) keinem Verein an;
 * - `off`: Der Vereinsadmin hat den Vergleich nicht eingeschaltet (Standard);
 * - `ready`: Kurzfassungen der Teams des Vereins geladen.
 */
export type ComparisonState = 'idle' | 'loading' | 'no-club' | 'off' | 'ready' | 'error';

/**
 * Vereinsvergleich (SCRUM-197). Zwei Aufgaben, beide nur für Trainer:
 * 1. Kurzfassung des eigenen Teams pflegen (`clubs/{clubId}/comparison/{teamId}`), sobald die Teamdaten geladen sind
 *    (Startseite, Teamanalyse …) und der Vergleich eingeschaltet ist; gleicher Inhalt wird nicht neu geschrieben.
 * 2. Kurzfassungen aller Teams des Vereins lesen (`load`) – für die Teamanalyse und das Spielerprofil.
 * Für andere Rollen tut der Dienst nichts.
 */
@Injectable({ providedIn: 'root' })
export class ClubComparisonService {
  private readonly api = inject(ClubComparisonApi);
  private readonly session = inject(SessionService);
  private readonly current = inject(CurrentTeam);
  private readonly team = inject(TeamService);

  readonly state = signal<ComparisonState>('idle');
  private readonly stored = signal<readonly ClubComparisonEntry[]>([]);
  /** Eigene Kurzfassung frisch aus den geladenen Teamdaten (genauer als der gespeicherte Stand). */
  private readonly ownLive = computed<ClubComparisonData | null>(() =>
    this.team.ready() ? comparisonFromTeam(this.teamName(), this.team.data(), this.team.events(), this.team.ratingsByEvent(), todayIso()) : null,
  );
  /** Alle Teams des Vereins, das eigene zuerst. */
  readonly entries = computed<readonly ClubComparisonEntry[]>(() => {
    if (this.state() !== 'ready') return [];
    const ownId = this.current.id();
    const live = this.ownLive();
    const list = this.stored().filter((entry) => entry.teamId !== ownId || !live);
    const own = live ? [{ ...live, teamId: ownId, updatedAt: new Date() }] : list.filter((entry) => entry.teamId === ownId);
    return [...own, ...list.filter((entry) => entry.teamId !== ownId).sort((a, b) => a.teamName.localeCompare(b.teamName, 'de', { numeric: true }))];
  });
  readonly otherTeams = computed(() => this.entries().filter((entry) => entry.teamId !== this.current.id()));

  private readonly trainer = computed(() => this.session.role() === 'trainer');
  /** Zuletzt geschriebener/gelesener Stand je `clubId/teamId`. */
  private readonly known = new Map<string, string>();
  /** Eingeschaltet? je Verein (bis zum nächsten `load`). */
  private readonly enabled = new Map<string, Promise<boolean>>();
  /** Verweis „ich bin Trainer dieses Teams“ je `clubId/uid/teamId`. */
  private readonly readers = new Map<string, Promise<void>>();
  private running = false;
  private again = false;
  private generation = 0;

  constructor() {
    effect(() => {
      const data = this.ownLive();
      const clubId = this.current.clubId();
      if (!this.trainer() || !data || !clubId) return;
      untracked(() => void this.publish());
    });
    // Abmelden, Rollen- oder Teamwechsel: keine Daten anderer Teams im Speicher behalten.
    let context = '';
    effect(() => {
      const next = JSON.stringify([this.session.uid(), this.current.id(), this.current.clubId(), this.trainer()]);
      if (next === context) return;
      const first = context === '';
      context = next;
      if (!first) untracked(() => this.reset());
    });
  }

  /** Teams des Vereins für Teamanalyse/Profil laden. */
  async load(): Promise<void> {
    const generation = ++this.generation;
    const clubId = this.current.clubId();
    const uid = this.session.uid();
    if (!this.trainer() || !uid) return;
    if (!clubId) {
      this.state.set('no-club');
      return;
    }
    this.state.set('loading');
    this.enabled.delete(clubId);
    try {
      if (!(await this.isEnabled(clubId))) {
        if (generation === this.generation) this.state.set('off');
        return;
      }
      await this.ensureReader(clubId, uid, this.current.id());
      const docs = await this.api.readComparisons(clubId);
      if (generation !== this.generation) return;
      this.stored.set(docs.map((entry) => comparisonFromDoc(entry.id, entry.data)).filter((entry): entry is ClubComparisonEntry => entry !== null));
      this.state.set('ready');
      void this.publish();
    } catch (error) {
      console.warn('Vereinsvergleich konnte nicht geladen werden', error);
      if (generation === this.generation) this.state.set('error');
    }
  }

  private reset(): void {
    this.generation += 1;
    this.stored.set([]);
    this.enabled.clear();
    this.state.set('idle');
  }

  private teamName(): string {
    return this.current.label() || this.current.name() || this.current.id();
  }

  private isEnabled(clubId: string): Promise<boolean> {
    let known = this.enabled.get(clubId);
    if (!known) {
      known = this.api.readEnabled(clubId).catch(() => false);
      this.enabled.set(clubId, known);
    }
    return known;
  }

  private ensureReader(clubId: string, uid: string, teamId: string): Promise<void> {
    const key = `${clubId}/${uid}/${teamId}`;
    let done = this.readers.get(key);
    if (!done) {
      done = this.api
        .readReader(clubId, uid)
        .catch(() => null)
        .then((existing) => (existing === teamId ? undefined : this.api.registerReader(clubId, uid, teamId)));
      done.catch(() => this.readers.delete(key));
      this.readers.set(key, done);
    }
    return done;
  }

  /** Eigene Kurzfassung schreiben, wenn eingeschaltet und geändert. */
  private async publish(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      const clubId = this.current.clubId();
      const teamId = this.current.id();
      const uid = this.session.uid();
      if (!this.trainer() || !clubId || !uid || !this.ownLive()) return;
      if (!(await this.isEnabled(clubId))) return;
      const wanted = this.ownLive();
      if (!wanted || this.current.clubId() !== clubId || this.current.id() !== teamId) return;
      const key = comparisonKey(wanted);
      const knownKey = `${clubId}/${teamId}`;
      const stored = this.stored().find((entry) => entry.teamId === teamId);
      if (stored && !this.known.has(knownKey)) this.known.set(knownKey, comparisonKey(stored));
      if (this.known.get(knownKey) === key) return;
      await this.ensureReader(clubId, uid, teamId);
      await this.api.writeComparison(clubId, teamId, wanted);
      this.known.set(knownKey, key);
    } catch (error) {
      // Kein Hinweis an den Trainer (z. B. Regeln noch nicht veröffentlicht): der nächste Abgleich versucht es erneut.
      console.warn('Vereinsvergleich konnte nicht aktualisiert werden', error);
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        void this.publish();
      }
    }
  }
}
