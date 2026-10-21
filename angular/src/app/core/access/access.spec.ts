import {
  type AccessEntry,
  MIN_PASSWORD_LENGTH,
  expiryFromDays,
  generateInviteCode,
  inviteEntry,
  isExpired,
  memberEntry,
  parseExpiryDays,
  sortEntries,
  validateStaffDraft,
  validityText,
} from './access';

const ts = (date: Date) => ({ toDate: () => date });

describe('Zugangsverwaltung (reine Logik)', () => {
  it('erzeugt 48 Hex-Zeichen und jedes Mal einen anderen Code', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateInviteCode()));
    expect(codes.size).toBe(20);
    for (const code of codes) expect(code).toMatch(/^[0-9a-f]{48}$/);
  });

  it('nutzt crypto.getRandomValues mit 24 Bytes', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    generateInviteCode();
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as Uint8Array).length).toBe(24);
    spy.mockRestore();
  });

  it('liest die Befristung: leer = unbefristet, sonst 1 bis 365 ganze Tage', () => {
    expect(parseExpiryDays('')).toBeNull();
    expect(parseExpiryDays('  ')).toBeNull();
    expect(parseExpiryDays('14')).toBe(14);
    expect(parseExpiryDays('365')).toBe(365);
    for (const bad of ['0', '-3', '1.5', 'abc', '366', '1e3']) expect(parseExpiryDays(bad)).toBeUndefined();
  });

  it('rechnet Tage ab jetzt in ein Ablaufdatum um', () => {
    const now = new Date('2026-10-01T10:00:00Z');
    expect(expiryFromDays(null, now)).toBeNull();
    expect(expiryFromDays(2, now)?.toISOString()).toBe('2026-10-03T10:00:00.000Z');
  });

  it('prüft E-Mail und Passwort (mindestens 12 Zeichen mit Groß-/Kleinbuchstaben und Ziffer, Wiederholung)', () => {
    const strong = `Aa1${'x'.repeat(MIN_PASSWORD_LENGTH - 3)}`;
    expect(strong).toHaveLength(MIN_PASSWORD_LENGTH);
    expect(validateStaffDraft({ email: 'a@b.de', password: strong, repeat: strong })).toEqual({});
    expect(validateStaffDraft({ email: '', password: 'LangGenug123', repeat: 'LangGenug123' }).email).toContain('E-Mail');
    expect(validateStaffDraft({ email: 'kein-at', password: 'LangGenug123', repeat: 'LangGenug123' }).email).toContain('gültige');
    expect(validateStaffDraft({ email: 'a@b.de', password: 'Abcdefgh12', repeat: 'Abcdefgh12' }).password).toContain('mindestens 12');
    expect(validateStaffDraft({ email: 'a@b.de', password: 'langgenug1234', repeat: 'langgenug1234' }).password).toContain('Groß- und Kleinbuchstaben');
    expect(validateStaffDraft({ email: 'a@b.de', password: 'LANGGENUG1234', repeat: 'LANGGENUG1234' }).password).toContain('Groß- und Kleinbuchstaben');
    expect(validateStaffDraft({ email: 'a@b.de', password: 'LangGenugAbcd', repeat: 'LangGenugAbcd' }).password).toContain('Ziffer');
    expect(validateStaffDraft({ email: 'a@b.de', password: 'LangGenug123', repeat: 'Anders123456' }).repeat).toContain('stimmen nicht überein');
  });

  it('wandelt members und invites in Einträge um; Trainer und Unbekanntes bleiben draußen', () => {
    const expiry = new Date('2026-12-01T00:00:00Z');
    expect(memberEntry({ id: 'u1', data: { role: 'parent', playerId: 'p1', expiresAt: ts(expiry) } })).toEqual({
      kind: 'member', id: 'u1', role: 'parent', playerId: 'p1', email: '', expiresAt: expiry,
    });
    expect(memberEntry({ id: 'u2', data: { role: 'physio', email: 'arzt@x.de' } })).toMatchObject({ role: 'physio', playerId: null, email: 'arzt@x.de', expiresAt: null });
    expect(memberEntry({ id: 'u5', data: { role: 'scout', email: 'scout@x.de' } })).toMatchObject({ role: 'scout', email: 'scout@x.de' });
    // SCRUM-170: Die alte Kennung „medical“ des bisherigen Scout-Zugangs erscheint als Scout.
    expect(memberEntry({ id: 'u6', data: { role: 'medical', email: 'alt@x.de' } })).toMatchObject({ role: 'scout', email: 'alt@x.de' });
    expect(memberEntry({ id: 'u3', data: { role: 'trainer' } })).toBeNull();
    expect(memberEntry({ id: 'u4', data: {} })).toBeNull();
    expect(inviteEntry({ id: 'c1', data: { role: 'player', playerId: 'p1', expiresAt: null } })).toMatchObject({ kind: 'invite', role: 'player', expiresAt: null });
    expect(inviteEntry({ id: 'c2', data: { role: 'physio', playerId: 'p1' } })).toBeNull();
    expect(inviteEntry({ id: 'c4', data: { role: 'scout', playerId: 'p1' } })).toBeNull();
    expect(inviteEntry({ id: 'c3', data: { role: 'player' } })).toBeNull();
  });

  it('beschreibt die Gültigkeit', () => {
    const now = new Date('2026-10-11T12:00:00Z');
    expect(validityText({ expiresAt: null }, now)).toBe('Unbegrenzt gültig');
    expect(validityText({ expiresAt: new Date('2026-11-01T12:00:00Z') }, now)).toBe('Gültig bis 01.11.2026');
    expect(validityText({ expiresAt: new Date('2026-10-01T12:00:00Z') }, now)).toBe('Abgelaufen seit 01.10.2026');
    expect(isExpired({ expiresAt: new Date('2026-10-01T12:00:00Z') }, now)).toBe(true);
    expect(isExpired({ expiresAt: null }, now)).toBe(false);
  });

  it('sortiert offene Einladungen vor Zugängen, dann nach Namen', () => {
    const entry = (kind: 'member' | 'invite', id: string): AccessEntry => ({ kind, id, role: 'player', playerId: id, email: '', expiresAt: null });
    const names: Record<string, string> = { a: 'Zoe', b: 'Anna', c: 'Mia' };
    const sorted = sortEntries([entry('member', 'a'), entry('member', 'b'), entry('invite', 'c')], (e) => names[e.id]);
    expect(sorted.map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });
});
