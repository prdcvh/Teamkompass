// SCRUM-198: Was `firebase deploy` hochladen wuerde – mit genau der Dateiauswahl der gelockten CLI (tests/rules) und
// den ignore-Mustern aus firebase.json. Die CLI vergleicht Muster ohne "/" mit jedem Namen im Pfad; ein Muster wie
// "src" wuerde lib/functions/src/index.js ausschliessen und die Funktionen liessen sich nicht starten.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sourceDir = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8')).functions[0];

test('Upload enthaelt den gebauten Code samt geteilter App-Logik, aber keine node_modules', async () => {
  const fsAsync = require('../../tests/rules/node_modules/firebase-tools/lib/fsAsync.js');
  const ignore = [...config.ignore, 'firebase-debug.log', 'firebase-debug.*.log'];
  const files = (await fsAsync.readdirRecursive({ path: sourceDir, ignoreStrings: ignore })).map((file) => relative(sourceDir, file.name));
  const main = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).main;
  for (const needed of [main, 'lib/functions/src/health.js', 'lib/angular/src/app/core/ratings/rating.js', 'package.json', 'package-lock.json']) {
    assert.ok(files.includes(needed), `${needed} fehlt im Upload`);
  }
  assert.ok(!files.some((file) => file.startsWith('node_modules/')), 'node_modules wird in der Cloud installiert, nicht hochgeladen');
});
