/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// SCRUM-143: Symbole fuer den Startbildschirm. Prueft, dass jedes Team-Manifest
// nur auf vorhandene Symbole in der angegebenen Groesse zeigt und dass die
// Symbole undurchsichtig sind (iPhone fuellt Transparenz sonst schwarz).

const root = process.cwd();
const publicDir = resolve(root, 'public');

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

function pngInfo(path: string): { width: number; height: number; colorType: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

const teams = readdirSync(resolve(root, 'teams'));

describe('PWA-Symbole', () => {
  it('findet die Team-Manifeste', () => {
    expect(teams.sort()).toEqual(['mein-team', 'u14', 'u15', 'u17']);
  });

  for (const team of teams) {
    describe(`Team ${team}`, () => {
      const manifest = JSON.parse(readFileSync(resolve(root, 'teams', team, 'manifest.webmanifest'), 'utf8')) as {
        short_name: string;
        background_color: string;
        icons: ManifestIcon[];
      };

      it('hat einen kurzen Namen "Koenigstein Uxx"', () => {
        expect(manifest.short_name).toMatch(/^Königstein U\d{2}$/);
        expect(manifest.short_name.length).toBeLessThanOrEqual(14);
      });

      it('hat weissen Hintergrund passend zum Symbol', () => {
        expect(manifest.background_color).toBe('#ffffff');
      });

      it('enthaelt 192, 512 und maskable 512', () => {
        const key = (i: ManifestIcon) => `${i.sizes}/${i.purpose}`;
        expect(manifest.icons.map(key).sort()).toEqual(['192x192/any', '512x512/any', '512x512/maskable']);
      });

      it('zeigt nur auf vorhandene, undurchsichtige Symbole in der angegebenen Groesse', () => {
        for (const icon of manifest.icons) {
          const file = resolve(publicDir, icon.src);
          expect(existsSync(file), icon.src).toBe(true);
          const [w, h] = icon.sizes.split('x').map(Number);
          const info = pngInfo(file);
          expect([info.width, info.height], icon.src).toEqual([w, h]);
          expect(info.colorType, `${icon.src} darf keinen Alphakanal haben`).toBe(2);
        }
      });
    });
  }

  it('bindet das iPhone-Symbol 180x180 per apple-touch-icon ein', () => {
    const html = readFileSync(resolve(root, 'src/index.html'), 'utf8');
    const match = /<link rel="apple-touch-icon" sizes="180x180" href="([^"]+)">/.exec(html);
    expect(match).not.toBeNull();
    const file = resolve(publicDir, match![1]);
    expect(existsSync(file)).toBe(true);
    const info = pngInfo(file);
    expect([info.width, info.height]).toEqual([180, 180]);
    expect(info.colorType).toBe(2);
  });
});
