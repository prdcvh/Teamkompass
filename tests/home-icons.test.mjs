// SCRUM-244: Startbildschirm-Symbol ist das neutrale TeamKompass-Logo (nicht das Königstein-Wappen),
// für alle Team-Builds gleich.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const ng = join(root, 'angular');
const pub = join(ng, 'public');
const teams = readdirSync(join(ng, 'teams'));

function pngSize(file) {
  const b = readFileSync(file);
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', `${file} ist kein PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('es gibt Manifeste für alle Team-Builds', () => {
  assert.ok(teams.length >= 4);
  for (const t of teams) assert.ok(existsSync(join(ng, 'teams', t, 'manifest.webmanifest')), t);
});

for (const t of teams) {
  test(`Manifest ${t}: Symbole zeigen auf vorhandene, gleich große PNGs (any + maskable)`, () => {
    const m = JSON.parse(readFileSync(join(ng, 'teams', t, 'manifest.webmanifest'), 'utf8'));
    const purposes = m.icons.map((i) => i.purpose);
    assert.ok(purposes.includes('any'));
    assert.ok(purposes.includes('maskable'));
    for (const icon of m.icons) {
      const file = join(pub, icon.src);
      assert.ok(existsSync(file), `${icon.src} fehlt`);
      const [w, h] = pngSize(file);
      assert.equal(`${w}x${h}`, icon.sizes);
    }
    assert.ok(m.icons.some((i) => i.sizes === '192x192'));
    assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'));
  });
}

test('alle Team-Manifeste verwenden dieselben Symbole', () => {
  const sets = teams.map((t) =>
    JSON.stringify(
      JSON.parse(readFileSync(join(ng, 'teams', t, 'manifest.webmanifest'), 'utf8')).icons,
    ),
  );
  assert.equal(new Set(sets).size, 1);
});

test('index.html: Apple-Touch-Icon (180 px) existiert', () => {
  const html = readFileSync(join(ng, 'src', 'index.html'), 'utf8');
  const m = html.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"/);
  assert.ok(m);
  assert.deepEqual(pngSize(join(pub, m[1])), [180, 180]);
});

// SHA-256 der bisherigen Königstein-Symbole (vor SCRUM-244): dürfen nicht mehr ausgeliefert werden.
const OLD = {
  'apple-touch-icon-180.png': 'b07dc1547dca48d58f1ac6e56dc1a2f7fef0075c52e65bc611354b785da152b5',
  'icon-192.png': '828c4bfc338167a799fd4d4e6ab8b9476a668cc340a02b8b5afd49c0f76239b3',
  'icon-512.png': '7fd9397b4e460e27c12ac367236921958585817ce7270af6c41461ff84a8f64d',
  'icon-maskable-512.png': '46032291a774b17664b40a205d0cc3a592058258e11be4450a8a1cfcafd32c40',
};
test('Symbole sind nicht mehr die alten Königstein-Symbole', () => {
  for (const [f, oldHash] of Object.entries(OLD)) {
    const b = readFileSync(join(pub, 'icons', f));
    assert.notEqual(createHash('sha256').update(b).digest('hex'), oldHash, f);
  }
});
