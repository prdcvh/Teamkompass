import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { ClubAdminService } from './club-admin.service';
import { INVITE_CODE_PATTERN } from './registration';

describe('ClubAdminService (Trainer-Einladungen des Vereinsadmins)', () => {
  let firebase: FakeFirebase;
  let admin: ClubAdminService;

  beforeEach(() => {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).uid.set('adminA');
    admin = TestBed.inject(ClubAdminService);
  });

  it('ohne Vereinsadmin-Rolle bleibt der Bereich leer', async () => {
    await admin.load();
    expect(admin.clubs()).toEqual([]);
  });

  it('erstellt einen Beitrittscode (14 Tage, Regelformat, neue Team-ID) mit Link und zieht ihn zurück', async () => {
    firebase.registration.adminClubs = [{ clubId: 'A', name: 'Verein A' }];
    await admin.load();
    expect(admin.clubs()[0].name).toBe('Verein A');
    const now = new Date('2026-10-23T10:00:00Z');
    expect(await admin.createInvite('A', ' Neu@Verein.de ', 'https://app.example', now)).toBe(true);
    const created = admin.created()!;
    expect(created.code).toMatch(INVITE_CODE_PATTERN);
    expect(created.link).toBe(`https://app.example/registrieren?code=${created.code}`);
    expect(created.expiresAt.toISOString()).toBe('2026-11-06T10:00:00.000Z');
    const invite = admin.clubs()[0].invites[0];
    expect(invite.email).toBe('neu@verein.de');
    expect(invite.teamId).toMatch(/^[A-Za-z0-9]{20}$/);
    await admin.revoke(created.code);
    expect(admin.clubs()[0].invites).toEqual([]);
  });

  it('lehnt eine ungültige E-Mail ab', async () => {
    expect(await admin.createInvite('A', 'keine-mail', 'https://app.example')).toBe(false);
    expect(admin.error()).toContain('E-Mail');
    expect(firebase.registration.joinInvites).toEqual([]);
  });
});
