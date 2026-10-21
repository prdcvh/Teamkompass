import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { normalizeRole } from '../auth/role';
import { SessionService } from '../auth/session.service';
import { AccessApi } from '../firebase/access.api';
import { ScoutApi } from '../firebase/scout.api';
import { TeamService } from '../team/team.service';
import { buildScoutProfiles, publishedMap, scoutProfileChanges } from './scout-profile';

/** Wartezeit, bis nach einer Änderung abgeglichen wird (bündelt viele Snapshots beim Laden und Bewerten). */
export const SCOUT_PUBLISH_DELAY_MS = 1500;

/**
 * Trainer-Client pflegt die Scout-Sicht (SCRUM-170): Gibt es mindestens einen Scout-Zugang, werden Kader, Events und
 * alle Bewertungen geladen und nach jeder Änderung (gebündelt) nach scoutProfiles abgeglichen. Gibt es keinen
 * Scout-Zugang (mehr), wird die Scout-Sicht gelöscht – ohne Scout keine Kopie der Daten.
 *
 * Abgeglichen wird nur bei Änderungen der Quelldaten (und einmal nach dem ersten Laden), nicht bei Änderungen der
 * veröffentlichten Sicht selbst: so können sich zwei gleichzeitig geöffnete Trainer-Clients nicht endlos gegenseitig
 * überschreiben.
 */
@Injectable({ providedIn: 'root' })
export class ScoutPublishService {
  private readonly accessApi = inject(AccessApi);
  private readonly scoutApi = inject(ScoutApi);
  private readonly session = inject(SessionService);
  private readonly team = inject(TeamService);

  /** Anzahl der Scout-Zugänge (null = noch nicht bekannt, dann wird nichts geschrieben). */
  readonly scoutAccounts = signal<number | null>(null);
  private readonly publishedLoaded = signal(false);
  private published: ReadonlyMap<string, unknown> = new Map();
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private again = false;
  private generation = 0;

  private readonly trainer = computed(() => this.session.role() === 'trainer');

  constructor() {
    effect(() => {
      const trainer = this.trainer();
      untracked(() => (trainer ? this.begin() : this.end()));
    });
    effect(() => {
      if (!this.trainer()) return;
      const count = this.scoutAccounts();
      const loaded = this.publishedLoaded();
      const ready = this.team.ready();
      // Quelldaten verfolgen: jede Änderung an Kader, Events oder Bewertungen löst einen Abgleich aus.
      this.team.data();
      this.team.ratingsByEvent();
      if (count === null || !loaded) return;
      untracked(() => {
        if (count > 0 && !ready) {
          this.team.start();
          return;
        }
        this.schedule();
      });
    });
  }

  /** Zahl der Scout-Zugänge neu lesen (nach dem Anlegen oder Sperren eines Zugangs). */
  async refreshAccounts(): Promise<void> {
    if (!this.trainer()) return;
    const generation = this.generation;
    try {
      const members = await this.accessApi.readMembers();
      if (generation !== this.generation) return;
      this.scoutAccounts.set(members.filter((member) => normalizeRole(member.data['role']) === 'scout').length);
    } catch (error) {
      // Ohne bekannte Zahl wird nichts geschrieben oder gelöscht.
      console.error(error);
    }
  }

  private begin(): void {
    if (this.unsubscribe) return;
    const generation = ++this.generation;
    void this.refreshAccounts();
    this.scoutApi
      .watchScoutProfiles(
        (docs) => {
          if (generation !== this.generation) return;
          this.published = publishedMap(docs);
          this.publishedLoaded.set(true);
        },
        (error) => {
          if (generation === this.generation) console.error(error);
        },
      )
      .then((unsubscribe) => {
        if (generation !== this.generation) unsubscribe();
        else this.unsubscribe = unsubscribe;
      })
      .catch((error) => console.error(error));
  }

  private end(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.published = new Map();
    this.publishedLoaded.set(false);
    this.scoutAccounts.set(null);
    this.again = false;
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.publish();
    }, SCOUT_PUBLISH_DELAY_MS);
  }

  /** Gleicht die Scout-Sicht einmal ab (öffentlich für Tests). */
  async publish(): Promise<void> {
    const count = this.scoutAccounts();
    if (!this.trainer() || count === null || !this.publishedLoaded()) return;
    if (count > 0 && !this.team.ready()) return;
    if (this.running) {
      this.again = true;
      return;
    }
    const generation = this.generation;
    const wanted =
      count > 0 ? buildScoutProfiles(this.team.data().map((entry) => entry.player), this.team.events(), this.team.ratingsByEvent()) : new Map();
    const changes = scoutProfileChanges(this.published, wanted);
    if (changes.length === 0) return;
    this.running = true;
    try {
      await this.scoutApi.applyScoutChanges(changes);
    } catch (error) {
      // Kein Hinweis an den Trainer: er kann nichts tun; der nächste Abgleich versucht es erneut.
      console.error('Scout-Sicht konnte nicht aktualisiert werden', error);
    } finally {
      this.running = false;
      if (this.again && generation === this.generation) {
        this.again = false;
        this.schedule();
      }
    }
  }
}
