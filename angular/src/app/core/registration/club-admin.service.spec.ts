import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { CurrentTeam } from '../team/current-team.service';
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
    firebase.registration.adminClubs = [{ clubId: 'A', name: 'Verein A', logoUrl: null }];
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

  it('speichert Name und Logo (SCRUM-182); das geöffnete Team des Vereins zeigt das neue Logo sofort', async () => {
    firebase.registration.adminClubs = [{ clubId: 'A', name: 'Verein A', logoUrl: null }];
    const team = TestBed.inject(CurrentTeam);
    team.applyMeta({ name: 'Verein A U11', label: 'U11', clubId: 'A', clubName: 'Verein A', logoUrl: null });
    await admin.load();
    const logo = 'data:image/webp;base64,UklGRg==';
    expect(await admin.saveClub('A', '  Verein A e.V. ', logo)).toBe(true);
    expect(firebase.registration.calls).toContain('updateClub:A');
    expect(admin.clubs()[0]).toEqual(expect.objectContaining({ name: 'Verein A e.V.', logoUrl: logo }));
    expect(team.logoSrc()).toBe(logo);
    expect(team.clubName()).toBe('Verein A e.V.');
    // Entfernen: kein Logo mehr (ein neuer Verein bekommt nie das mitgelieferte Logo eines anderen Vereins).
    expect(await admin.saveClub('A', 'Verein A e.V.', null)).toBe(true);
    expect(team.logoSrc()).toBeNull();
  });

  it('lehnt ungültige Logos und leere Namen ab, ohne zu schreiben; ein anderer Verein ändert das geöffnete Team nicht', async () => {
    firebase.registration.adminClubs = [{ clubId: 'B', name: 'Verein B', logoUrl: null }];
    const team = TestBed.inject(CurrentTeam);
    team.applyMeta({ name: 'Verein A U11', label: 'U11', clubId: 'A', clubName: 'Verein A', logoUrl: null });
    await admin.load();
    expect(await admin.saveClub('B', 'Verein B', 'https://example.test/logo.png')).toBe(false);
    expect(admin.error()).toContain('Logo');
    expect(await admin.saveClub('B', '   ', null)).toBe(false);
    expect(admin.error()).toContain('Vereinsnamen');
    expect(firebase.registration.calls).not.toContain('updateClub:B');
    expect(await admin.saveClub('B', 'Verein B', 'data:image/png;base64,AAAA')).toBe(true);
    expect(team.clubName()).toBe('Verein A');
    expect(team.logoUrl()).toBeNull();
  });

  it('Speichern abgelehnt (z. B. kein Admin mehr): Fehlertext, nichts geändert', async () => {
    firebase.registration.adminClubs = [{ clubId: 'A', name: 'Verein A', logoUrl: null }];
    await admin.load();
    firebase.registration.updateClubError = Object.assign(new Error('denied'), { code: 'permission-denied' });
    expect(await admin.saveClub('A', 'Neu', null)).toBe(false);
    expect(admin.error()).toContain('nicht gespeichert');
    expect(admin.clubs()[0].name).toBe('Verein A');
  });
});
