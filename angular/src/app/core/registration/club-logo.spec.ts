import { LOGO_ATTEMPTS, LOGO_INPUT_MAX_BYTES, LOGO_MAX_CHARS, type LogoAttempt, fitWithin, isLogoDataUrl, logoFileProblem, logoFromDoc, pickLogo } from './club-logo';

const ofLength = (type: string, length: number) => {
  const prefix = `data:image/${type};base64,`;
  return prefix + 'A'.repeat(length - prefix.length);
};

describe('Vereinslogo (SCRUM-182)', () => {
  it('nimmt nur PNG/JPEG/WebP als base64-data:-URL bis zur Grenze der Regeln an', () => {
    for (const type of ['png', 'jpeg', 'webp']) expect(isLogoDataUrl(ofLength(type, 500))).toBe(true);
    expect(isLogoDataUrl(ofLength('png', LOGO_MAX_CHARS))).toBe(true);
    expect(isLogoDataUrl(ofLength('png', LOGO_MAX_CHARS + 1))).toBe(false);
    for (const bad of [
      'https://example.test/logo.png',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:text/html;base64,PGgxPg==',
      'data:image/png;base64,ab cd',
      'javascript:alert(1)',
      '',
      42,
      null,
    ]) {
      expect(isLogoDataUrl(bad)).toBe(false);
    }
  });

  it('Logo aus der Datenbank: unzulässige Werte werden zu „kein Logo“', () => {
    expect(logoFromDoc('data:image/webp;base64,AAAA')).toBe('data:image/webp;base64,AAAA');
    expect(logoFromDoc('https://example.test/x.png')).toBeNull();
    expect(logoFromDoc(undefined)).toBeNull();
  });

  it('prüft Dateityp und Dateigröße vor dem Einlesen', () => {
    expect(logoFileProblem({ type: 'image/png', size: 1000 })).toBe('');
    expect(logoFileProblem({ type: 'image/svg+xml', size: 1000 })).toContain('PNG, JPG oder WebP');
    expect(logoFileProblem({ type: 'application/pdf', size: 1000 })).toContain('PNG, JPG oder WebP');
    expect(logoFileProblem({ type: 'image/jpeg', size: LOGO_INPUT_MAX_BYTES + 1 })).toContain('zu groß');
  });

  it('verkleinert auf höchstens 256 px, behält das Seitenverhältnis, vergrößert nie', () => {
    expect(fitWithin(1024, 512, 256)).toEqual({ width: 256, height: 128 });
    expect(fitWithin(300, 1200, 256)).toEqual({ width: 64, height: 256 });
    expect(fitWithin(100, 80, 256)).toEqual({ width: 100, height: 80 });
    expect(fitWithin(0, 80, 256)).toEqual({ width: 0, height: 0 });
  });

  it('nimmt den ersten Versuch, der unter die Grenze passt (erst groß mit Transparenz, dann kleiner, zuletzt JPEG)', () => {
    expect(LOGO_ATTEMPTS[0]).toEqual({ edge: 256, type: 'image/webp', quality: 0.9 });
    const seen: LogoAttempt[] = [];
    const logo = pickLogo((attempt) => {
      seen.push(attempt);
      // Zu groß bis 128 px, dann passt WebP.
      const length = attempt.edge > 128 ? LOGO_MAX_CHARS + 10 : 5000;
      return ofLength(attempt.type.slice(6), length);
    });
    expect(logo?.startsWith('data:image/webp;base64,')).toBe(true);
    expect(seen.at(-1)).toEqual({ edge: 128, type: 'image/webp', quality: 0.9 });
  });

  it('ein Browser ohne WebP liefert PNG – auch das zählt; ganz zu große Bilder ergeben kein Logo', () => {
    expect(pickLogo(() => ofLength('png', 3000))?.startsWith('data:image/png')).toBe(true);
    expect(pickLogo(() => ofLength('png', LOGO_MAX_CHARS + 1))).toBeNull();
    // Unbekanntes Ergebnis (z. B. „data:,“ bei leerem Canvas) zählt nie.
    expect(pickLogo(() => 'data:,')).toBeNull();
  });
});
