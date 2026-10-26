import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { NotificationsService } from './notifications.service';

describe('NotificationsService (E-Mail-Erinnerung, SCRUM-100/102)', () => {
  let firebase: FakeFirebase;
  let session: SessionService;
  let service: NotificationsService;

  function setup(role: 'trainer' | 'physio' | 'player' = 'trainer', email: string | null = 'trainer@example.test') {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    session = TestBed.inject(SessionService);
    session.role.set(role);
    session.uid.set('u1');
    session.email.set(email);
    service = TestBed.inject(NotificationsService);
  }

  it('ist nur für Trainer mit E-Mail-Konto verfügbar und lädt sonst nichts', async () => {
    setup('player', null);
    expect(service.available()).toBe(false);
    await service.start();
    expect(service.load()).toBe('idle');
    expect(firebase.notifications.calls).toEqual([]);
  });

  it('ist standardmäßig aus, auch wenn nichts gespeichert ist', async () => {
    setup();
    await service.start();
    expect(service.load()).toBe('ready');
    expect(service.emailReminders()).toBe(false);
  });

  it('wertet nur den Wert true als „an“ (kein Wahrheitswert-Trick durch Strings)', async () => {
    setup();
    firebase.notifications.docs.set('u1', { emailReminders: 'true' });
    await service.start();
    expect(service.emailReminders()).toBe(false);
  });

  it('speichert ausschließlich das Feld emailReminders, nie die E-Mail-Adresse', async () => {
    setup();
    await service.start();
    await service.setEmailReminders(true);
    expect(firebase.notifications.docs.get('u1')).toEqual({ emailReminders: true });
    expect(JSON.stringify([...firebase.notifications.docs.values()])).not.toContain('example.test');
  });

  it('ändert vor dem Laden nichts', async () => {
    setup();
    await service.setEmailReminders(true);
    expect(firebase.notifications.docs.size).toBe(0);
  });

  it('behält bei Speicherfehler den alten Stand und meldet den Fehler', async () => {
    setup();
    await service.start();
    firebase.notifications.saveError = { code: 'permission-denied' };
    await service.setEmailReminders(true);
    expect(service.emailReminders()).toBe(false);
    expect(service.error()).toContain('konnte nicht gespeichert werden');
    expect(service.saving()).toBe(false);
  });

  it('erlaubt nach einem Ladefehler einen neuen Versuch', async () => {
    setup();
    firebase.notifications.readError = { code: 'unavailable' };
    await service.start();
    expect(service.load()).toBe('error');
    firebase.notifications.readError = null;
    await service.start();
    expect(service.load()).toBe('ready');
    expect(service.error()).toBe('');
  });
});
