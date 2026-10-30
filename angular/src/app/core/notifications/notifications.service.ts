import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { NotificationsApi } from '../firebase/notifications.api';

/**
 * E-Mail-Erinnerung an offene Bewertungen (SCRUM-100): Opt-in je Trainer, gespeichert in der Cloud
 * (`notifications/{uid}`, Feld `emailReminders`). Standard ist aus. Nur Trainer mit E-Mail-Konto sehen und ändern es.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(NotificationsApi);
  private readonly session = inject(SessionService);

  /** Der Schalter ist nur für Trainer mit E-Mail-Konto vorgesehen. */
  readonly available = computed(() => this.session.role() === 'trainer' && !!this.session.email() && !!this.session.uid());
  readonly accountEmail = computed(() => this.session.email() ?? '');
  readonly emailReminders = signal(false);
  readonly load = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly saving = signal(false);
  readonly error = signal('');
  private generation = 0;

  constructor() {
    effect(() => {
      if (!this.available()) this.reset();
    });
  }

  /** Lädt den gespeicherten Stand (einmal je Anmeldung; nach einem Fehler erneut möglich). */
  async start(): Promise<void> {
    const uid = this.session.uid();
    if (!this.available() || !uid || this.load() === 'loading' || this.load() === 'ready') return;
    const generation = ++this.generation;
    this.load.set('loading');
    this.error.set('');
    try {
      const data = await this.api.readNotifications(uid);
      if (generation !== this.generation) return;
      this.emailReminders.set(data?.['emailReminders'] === true);
      this.load.set('ready');
    } catch (error) {
      console.error(error);
      if (generation !== this.generation) return;
      this.load.set('error');
      this.error.set(`Die Einstellung konnte nicht geladen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
    }
  }

  /** Schaltet das Abo um. Bei einem Fehler bleibt der alte Stand sichtbar und eine verständliche Meldung erscheint. */
  async setEmailReminders(enabled: boolean): Promise<void> {
    const uid = this.session.uid();
    if (!this.available() || !uid || this.load() !== 'ready' || this.saving()) return;
    const generation = this.generation;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.saveNotifications(uid, { emailReminders: enabled });
      if (generation === this.generation) this.emailReminders.set(enabled);
    } catch (error) {
      console.error(error);
      if (generation === this.generation) this.error.set(`Die Einstellung konnte nicht gespeichert werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
    } finally {
      if (generation === this.generation) this.saving.set(false);
    }
  }

  private reset(): void {
    this.generation += 1;
    this.emailReminders.set(false);
    this.load.set('idle');
    this.saving.set(false);
    this.error.set('');
  }
}
