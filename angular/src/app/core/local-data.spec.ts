import { clearLocalTeamData, TEAM_DATA_PREFIX } from './local-data';

describe('clearLocalTeamData', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('entfernt Teamdaten, lässt aber Einstellungen wie das Design stehen', () => {
    localStorage.setItem(`${TEAM_DATA_PREFIX}players`, '[]');
    sessionStorage.setItem(`${TEAM_DATA_PREFIX}events`, '[]');
    localStorage.setItem('teamkompass-theme', 'dark');
    clearLocalTeamData();
    expect(localStorage.getItem(`${TEAM_DATA_PREFIX}players`)).toBeNull();
    expect(sessionStorage.getItem(`${TEAM_DATA_PREFIX}events`)).toBeNull();
    expect(localStorage.getItem('teamkompass-theme')).toBe('dark');
  });

  it('wirft nicht, wenn der Speicher gesperrt ist', () => {
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('gesperrt');
    });
    localStorage.setItem('a', 'b');
    expect(() => clearLocalTeamData()).not.toThrow();
    vi.restoreAllMocks();
  });
});
