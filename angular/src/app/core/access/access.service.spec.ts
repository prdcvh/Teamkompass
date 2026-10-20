import { TestBed } from '@angular/core/testing';
import { AccessService } from './access.service';
import { SessionService } from '../auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';

describe('AccessService', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'physio' | 'player' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.access.memberDocs.set('u1', { role: 'player', playerId: 'p1' });
    firebase.access.memberDocs.set('u2', { role: 'trainer' });
    firebase.access.inviteDocs.set('code1', { role: 'parent', playerId: 'p2', expiresAt: null });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    return TestBed.inject(AccessService);
  }

  it('lädt Einladungen und Zugänge, Trainer-Konten werden nicht aufgelistet', async () => {
    const access = setup();
    await access.reload();
    expect(access.load()).toBe('ready');
    expect(access.entries().map((entry) => `${entry.kind}:${entry.id}`).sort()).toEqual(['invite:code1', 'member:u1']);
  });

  it('lädt nichts für Nicht-Trainer', async () => {
    const access = setup('player');
    await access.reload();
    expect(access.load()).toBe('idle');
    expect(firebase.calls).not.toContain('readMembers');
    expect(await access.createInvite('p1', 'player', null)).toMatchObject({ ok: false });
    expect(await access.createStaff('trainer', 'a@b.de', 'langgenug1')).toMatchObject({ ok: false });
    expect(firebase.calls.filter((call) => call.startsWith('create'))).toEqual([]);
  });

  it('meldet Ladefehler verständlich und erlaubt einen neuen Versuch', async () => {
    const access = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.access.readAccessError = { code: 'permission-denied' };
    await access.reload();
    expect(access.load()).toBe('error');
    expect(access.error()).toContain('permission-denied');
    firebase.access.readAccessError = null;
    await access.reload();
    expect(access.load()).toBe('ready');
  });

  it('erzeugt einen Einladungscode mit Ablauf und lädt die Liste neu', async () => {
    const access = setup();
    await access.reload();
    const result = await access.createInvite('p3', 'parent', 7);
    if (!result.ok) throw new Error('erwartet: ok');
    expect(result.code).toMatch(/^[0-9a-f]{48}$/);
    expect(result.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86400000);
    expect(firebase.access.inviteDocs.get(result.code)).toMatchObject({ playerId: 'p3', role: 'parent' });
    expect(access.entries().some((entry) => entry.id === result.code)).toBe(true);

    const unlimited = await access.createInvite('p3', 'player', null);
    expect(unlimited).toMatchObject({ ok: true, expiresAt: null });
  });

  it('meldet einen fehlgeschlagenen Code, ohne ihn zurückzugeben', async () => {
    const access = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.access.createInviteError = { code: 'permission-denied' };
    const result = await access.createInvite('p1', 'player', null);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toMatch(/[0-9a-f]{48}/);
  });

  it('sperrt Zugänge (members) und zieht offene Codes zurück', async () => {
    const access = setup();
    await access.reload();
    const [invite, member] = [access.entries().find((e) => e.kind === 'invite')!, access.entries().find((e) => e.kind === 'member')!];
    expect(await access.revoke(member)).toEqual({ ok: true });
    expect(firebase.access.memberDocs.has('u1')).toBe(false);
    expect(await access.revoke(invite)).toEqual({ ok: true });
    expect(firebase.access.inviteDocs.size).toBe(0);
    expect(access.entries()).toEqual([]);
  });

  it('meldet Fehler beim Sperren und behält den Zugang', async () => {
    const access = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await access.reload();
    firebase.access.deleteAccessError = { code: 'unavailable' };
    const result = await access.revoke(access.entries().find((e) => e.kind === 'member')!);
    expect(result).toMatchObject({ ok: false });
    expect(firebase.access.memberDocs.has('u1')).toBe(true);
  });

  it('legt Konten über die zweite App-Instanz an und gibt Fehler verständlich zurück', async () => {
    const access = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await access.createStaff('physio', ' arzt@x.de ', 'langgenug1')).toEqual({ ok: true });
    expect(firebase.calls).toContain('createStaff:physio:arzt@x.de');
    expect(firebase.access.memberDocs.get('staff-uid-1')).toMatchObject({ role: 'physio' });
    firebase.access.nextStaffUid = 'staff-uid-2';
    expect(await access.createStaff('scout', 'scout@x.de', 'langgenug1')).toEqual({ ok: true });
    expect(firebase.calls).toContain('createStaff:scout:scout@x.de');
    expect(firebase.access.memberDocs.get('staff-uid-2')).toMatchObject({ role: 'scout' });

    firebase.access.createStaffError = { code: 'auth/email-already-in-use' };
    expect(await access.createStaff('trainer', 'a@b.de', 'langgenug1')).toEqual({ ok: false, message: 'Das Trainer-Konto konnte nicht angelegt werden. Diese E-Mail wird bereits verwendet.' });
  });

  it('verwirft alles beim Abmelden', async () => {
    const access = setup();
    await access.reload();
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(access.entries()).toEqual([]);
    expect(access.load()).toBe('idle');
  });
});
