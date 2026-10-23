import {
  type ClubInvite,
  INVITE_CODE_PATTERN,
  SERVER_TIME,
  formatInviteCode,
  generateJoinCode,
  generateTeamId,
  inviteProblem,
  inviteProblemText,
  isInviteCodeFormat,
  normalizeInviteCode,
  registrationLink,
  registrationWrites,
  suggestTeamName,
  validateAccountDraft,
  validateTeamDraft,
} from './registration';

const future = new Date(Date.now() + 86_400_000);
const clubInvite: ClubInvite = { code: 'ABCDEFGHJKLMNPQR', kind: 'club', clubId: 'Club0000000000000001', teamId: 'Team0000000000000001', expiresAt: future, email: null };

describe('Registrierung (reine Logik)', () => {
  it('nimmt den Code mit Leerzeichen, Bindestrichen und Kleinbuchstaben an', () => {
    expect(normalizeInviteCode(' abcd-efgh jklm-npqr ')).toBe('ABCDEFGHJKLMNPQR');
    expect(isInviteCodeFormat('ABCDEFGHJKLMNPQR')).toBe(true);
    // 0/O/1/I kommen im Alphabet nicht vor, zu kurz/lang ist ungültig.
    expect(isInviteCodeFormat('ABCDEFGHJKLMNPQO')).toBe(false);
    expect(isInviteCodeFormat('ABCDEFGHJKLMNPQ')).toBe(false);
    expect(formatInviteCode('ABCDEFGHJKLMNPQR')).toBe('ABCD-EFGH-JKLM-NPQR');
  });

  it('erzeugt zufällige Beitrittscodes im Regelformat und Team-IDs wie Firestore', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateJoinCode()));
    expect(codes.size).toBe(100);
    for (const code of codes) expect(code).toMatch(INVITE_CODE_PATTERN);
    expect(generateTeamId()).toMatch(/^[A-Za-z0-9]{20}$/);
  });

  it('prüft Code, E-Mail und Passwort (Richtlinie SCRUM-58) im Konto-Schritt', () => {
    expect(validateAccountDraft({ code: 'ABCD-EFGH-JKLM-NPQR', email: 'a@b.de', password: 'Sicher12345678', repeat: 'Sicher12345678' })).toEqual({});
    const bad = validateAccountDraft({ code: 'xyz', email: 'kein', password: 'kurz', repeat: 'x' });
    expect(bad.code).toContain('16 Zeichen');
    expect(bad.email).toBeTruthy();
    expect(bad.password).toContain('12');
    expect(validateAccountDraft({ code: '', email: 'a@b.de', password: 'nurkleinbuchstaben1', repeat: 'nurkleinbuchstaben1' }).password).toContain('Groß');
    expect(validateAccountDraft({ code: 'ABCDEFGHJKLMNPQR', email: 'a@b.de', password: 'Sicher12345678', repeat: 'Sicher1234567' }).repeat).toBeTruthy();
  });

  it('verlangt beim Vereinscode einen Vereinsnamen, beim Beitritt nicht', () => {
    expect(validateTeamDraft({ clubName: '', ageGroup: 'U11', teamName: 'X U11' }, 'club').clubName).toBeTruthy();
    expect(validateTeamDraft({ clubName: '', ageGroup: 'U11', teamName: 'X U11' }, 'team')).toEqual({});
    const errors = validateTeamDraft({ clubName: 'x'.repeat(101), ageGroup: '', teamName: ' ' }, 'club');
    expect(Object.keys(errors).sort()).toEqual(['ageGroup', 'clubName', 'teamName']);
    expect(suggestTeamName(' SV Muster ', 'U11')).toBe('SV Muster U11');
  });

  it('erkennt fehlende, abgelaufene und an andere Adressen gebundene Codes', () => {
    expect(inviteProblem(null, 'a@b.de')).toBe('missing');
    expect(inviteProblem({ ...clubInvite, expiresAt: new Date(Date.now() - 1000) }, 'a@b.de')).toBe('expired');
    expect(inviteProblem({ ...clubInvite, email: 'chef@verein.de' }, 'andere@verein.de')).toBe('wrongEmail');
    expect(inviteProblem({ ...clubInvite, email: 'chef@verein.de' }, 'Chef@Verein.de')).toBeNull();
    expect(inviteProblem(clubInvite, 'a@b.de')).toBeNull();
    expect(inviteProblemText('expired')).toContain('abgelaufen');
  });

  it('Vereinscode: ein Schreibvorgang mit Code löschen, Verein, eigenem Admin, Team (erster Trainer) und Zugang mit uid', () => {
    const writes = registrationWrites({ uid: 'u1', email: 'a@b.de', invite: clubInvite, draft: { clubName: ' SV Muster ', ageGroup: 'U11', teamName: 'SV Muster U11' } });
    expect(writes.map((write) => `${write.kind}:${write.path.join('/')}`)).toEqual([
      'delete:clubInvites/ABCDEFGHJKLMNPQR',
      'set:clubs/Club0000000000000001',
      'set:clubs/Club0000000000000001/admins/u1',
      'set:teams/Team0000000000000001',
      'set:teams/Team0000000000000001/members/u1',
    ]);
    expect(writes[1].data).toEqual({ name: 'SV Muster', logoUrl: null, createdAt: SERVER_TIME });
    expect(writes[2].data).toEqual({ uid: 'u1', role: 'admin', createdAt: SERVER_TIME, inviteCode: 'ABCDEFGHJKLMNPQR' });
    expect(writes[3].data).toEqual({ clubId: 'Club0000000000000001', name: 'SV Muster U11', label: 'U11', hasTrainer: true, firstTrainerUid: 'u1', createdAt: SERVER_TIME });
    expect(writes[4].data).toEqual({ role: 'trainer', email: 'a@b.de', uid: 'u1', createdAt: SERVER_TIME, claimedInviteCode: 'ABCDEFGHJKLMNPQR' });
  });

  it('Beitrittscode: kein Verein und kein Admin-Eintrag, nur Team und Trainer-Zugang', () => {
    const writes = registrationWrites({ uid: 'u1', email: 'a@b.de', invite: { ...clubInvite, kind: 'team', clubId: 'fc-x' }, draft: { clubName: 'ignoriert', ageGroup: 'U9', teamName: 'FC X U9' } });
    expect(writes.map((write) => write.path[0])).toEqual(['clubInvites', 'teams', 'teams']);
    expect(writes[1].data?.['clubId']).toBe('fc-x');
  });

  it('baut den Registrierungslink', () => {
    expect(registrationLink('https://teamkompass-u14.web.app', 'ABCDEFGHJKLMNPQR')).toBe('https://teamkompass-u14.web.app/registrieren?code=ABCDEFGHJKLMNPQR');
  });
});
