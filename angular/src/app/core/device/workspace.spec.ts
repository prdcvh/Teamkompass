import { DEFAULT_WORKSPACE, MAX_ACTIVITIES, parseWorkspace, retentionLabel, withActivity } from './workspace';

describe('Geräte-Einstellungen', () => {
  it('liefert Standardwerte ohne oder bei kaputtem Speicherinhalt', () => {
    expect(parseWorkspace(null)).toEqual(DEFAULT_WORKSPACE);
    expect(parseWorkspace('kein json')).toEqual(DEFAULT_WORKSPACE);
    expect(parseWorkspace('"text"')).toEqual(DEFAULT_WORKSPACE);
    expect(parseWorkspace('null')).toEqual(DEFAULT_WORKSPACE);
  });

  it('liest Werte der bisherigen App und ignoriert unzulässige Aufbewahrung', () => {
    const stored = JSON.stringify({ retentionDays: 180, activity: [{ id: 'a', at: '2026-10-01T10:00:00.000Z', action: 'Event gespeichert' }] });
    expect(parseWorkspace(stored)).toEqual({ retentionDays: 180, activity: [{ id: 'a', at: '2026-10-01T10:00:00.000Z', action: 'Event gespeichert' }] });
    expect(parseWorkspace(JSON.stringify({ retentionDays: 7 })).retentionDays).toBe(90);
  });

  it('verwirft Verlaufseinträge ohne Text oder Zeit', () => {
    const stored = JSON.stringify({ activity: [{ action: 'x' }, 5, { at: 'y' }, { id: 'ok', at: '2026-10-01T00:00:00.000Z', action: 'ok' }] });
    expect(parseWorkspace(stored).activity.map((item) => item.id)).toEqual(['ok']);
  });

  it('stellt neue Einträge nach vorn und begrenzt den Verlauf', () => {
    let workspace = DEFAULT_WORKSPACE;
    for (let index = 0; index < MAX_ACTIVITIES + 5; index += 1) workspace = withActivity(workspace, `Aktion ${index}`, new Date('2026-10-01T10:00:00Z'), `id${index}`);
    expect(workspace.activity).toHaveLength(MAX_ACTIVITIES);
    expect(workspace.activity[0].action).toBe(`Aktion ${MAX_ACTIVITIES + 4}`);
  });

  it('benennt die Aufbewahrungsdauer', () => {
    expect(retentionLabel(365)).toBe('1 Jahr');
    expect(retentionLabel(30)).toBe('30 Tage');
  });
});
