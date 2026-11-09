// SCRUM-282: In der Browser-Tableiste steht das TeamKompass-Logo, nicht das Angular-Standard-Logo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const pub = join(root, 'angular', 'public');
const indexHtml = readFileSync(join(root, 'angular', 'src', 'index.html'), 'utf8');

// sha256 der Angular-CLI-Standard-favicon.ico (zuvor in angular/public/)
const ANGULAR_DEFAULT_ICO_SHA256 = 'f9102be80297c0529207607be5277b4f90bca89d65988fa1771b91c7894e815f';

test('index.html bindet das SVG-Favicon und das ICO-Rückfall-Favicon ein', () => {
  assert.match(indexHtml, /<link rel="icon" type="image\/svg\+xml" href="favicon\.svg">/);
  assert.match(indexHtml, /<link rel="icon"[^>]*type="image\/x-icon"[^>]*href="favicon\.ico"/);
});

test('favicon.svg ist das TeamKompass-Logo (Markenrot, Kompass)', () => {
  const svg = readFileSync(join(pub, 'favicon.svg'), 'utf8');
  assert.match(svg, /fill="#d8072e"/);
  assert.match(svg, /rotate\(35 256 256\)/);
});

test('favicon.ico enthält 16, 32 und 48 px als PNG und ist nicht das Angular-Standardicon', () => {
  const ico = readFileSync(join(pub, 'favicon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  const n = ico.readUInt16LE(4);
  assert.equal(n, 3);
  const sizes = [];
  for (let i = 0; i < n; i++) {
    const o = 6 + 16 * i;
    sizes.push(ico[o]);
    const offset = ico.readUInt32LE(o + 12);
    assert.equal(ico.subarray(offset + 1, offset + 4).toString('latin1'), 'PNG');
  }
  assert.deepEqual(sizes, [16, 32, 48]);
});

test('keine Angular-Standarddatei mehr im Auslieferungsordner', () => {
  assert.ok(existsSync(join(pub, 'favicon.svg')));
  const ico = readFileSync(join(pub, 'favicon.ico'));
  assert.notEqual(createHash('sha256').update(ico).digest('hex'), ANGULAR_DEFAULT_ICO_SHA256);
});
