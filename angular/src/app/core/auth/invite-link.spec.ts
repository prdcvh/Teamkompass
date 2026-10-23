import { inviteCodeFromParam } from './invite-link';

describe('Einladungslink der bisherigen App (SCRUM-169)', () => {
  const code = 'a'.repeat(24) + '0123456789ABCDEF0123456789abcdef';

  it('übernimmt gültige Codes (Hex, 32–64 Zeichen) kleingeschrieben', () => {
    expect(inviteCodeFromParam(` ${code} `)).toBe(code.toLowerCase());
    expect(inviteCodeFromParam('f'.repeat(32))).toBe('f'.repeat(32));
  });

  it('ignoriert fehlende, zu kurze, zu lange oder fremde Werte', () => {
    for (const value of [null, undefined, '', 'abc', 'f'.repeat(31), 'f'.repeat(65), 'g'.repeat(48), '<script>'.repeat(5)]) {
      expect(inviteCodeFromParam(value)).toBe('');
    }
  });
});
