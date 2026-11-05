import { isReleaseActive, releaseFromDoc, releaseText } from './grade-release';

describe('Freigabe der Noten (SCRUM-115)', () => {
  const now = new Date('2026-11-03T18:00:00Z');
  const ts = (iso: string) => ({ toDate: () => new Date(iso) });

  it('liest Firestore-Zeitstempel und Date; ohne Veröffentlichungszeitpunkt keine Freigabe', () => {
    expect(releaseFromDoc({ publishedUntil: ts('2026-11-03T17:00:00Z'), expiresAt: null })).toEqual({ publishedUntil: new Date('2026-11-03T17:00:00Z'), expiresAt: null });
    expect(releaseFromDoc({ publishedUntil: new Date('2026-11-03T17:00:00Z'), expiresAt: ts('2026-11-10T17:00:00Z') })?.expiresAt).toEqual(new Date('2026-11-10T17:00:00Z'));
    expect(releaseFromDoc({ publishedUntil: null })).toBeNull();
    expect(releaseFromDoc({ publishedUntil: 'gestern' })).toBeNull();
    expect(releaseFromDoc(null)).toBeNull();
  });

  it('gilt unbefristet oder bis zum Ablauf', () => {
    expect(isReleaseActive(null, now)).toBe(false);
    expect(isReleaseActive({ publishedUntil: now, expiresAt: null }, now)).toBe(true);
    expect(isReleaseActive({ publishedUntil: now, expiresAt: new Date('2026-11-04T00:00:00Z') }, now)).toBe(true);
    expect(isReleaseActive({ publishedUntil: now, expiresAt: new Date('2026-11-03T17:59:59Z') }, now)).toBe(false);
  });

  it('Text für Trainer und Spieler', () => {
    expect(releaseText(null, now)).toBe('Noten sind nicht veröffentlicht.');
    expect(releaseText({ publishedUntil: new Date('2026-11-01T10:00:00Z'), expiresAt: null }, now)).toMatch(/^Noten bis 01\.11\.2026, \d\d:\d\d Uhr veröffentlicht, unbefristet sichtbar\.$/);
    expect(releaseText({ publishedUntil: new Date('2026-11-01T10:00:00Z'), expiresAt: new Date('2026-11-30T10:00:00Z') }, now)).toContain('sichtbar bis 30.11.2026');
    expect(releaseText({ publishedUntil: new Date('2026-10-01T10:00:00Z'), expiresAt: new Date('2026-10-15T10:00:00Z') }, now)).toBe('Freigabe abgelaufen am 15.10.2026.');
  });
});
