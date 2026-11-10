import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../angular/src/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL("../angular/public/splash.css", import.meta.url), "utf8");
const js = readFileSync(new URL('../angular/public/splash.js', import.meta.url), 'utf8');
const firebaseJson = readFileSync(new URL('../firebase.json', import.meta.url), 'utf8');

test('index.html enthält die Start-Animation mit Logo, Begrüßung und reduzierter Bewegung (SCRUM-283)', () => {
  assert.match(html, /id="tk-splash"/);
  assert.match(html, /Willkommen bei TeamKompass/);
  assert.match(html, /href="splash\.css"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(html, /rotate\(35 256 256\)/);
  assert.match(html, /<script src="splash\.js"><\/script>/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'kein Inline-Script (CSP: script-src self)');
});

test('splash.js hat Sicherheits-Timeout und stellt hide() bereit', () => {
  assert.match(js, /window\.tkSplash\s*=\s*\{\s*hide:\s*hide\s*\}/);
  assert.match(js, /Lädt länger als üblich/);
  assert.match(js, /setTimeout\(hide,\s*\d+\)/);
});

test('CSP erlaubt kein Inline-Script, die Start-Animation braucht also die externe Datei', () => {
  assert.doesNotMatch(firebaseJson, /script-src[^;"]*unsafe-inline/);
});
