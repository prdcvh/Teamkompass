// SCRUM-198: Die Funktionen nutzen dieselbe „Spieler bewertet?“-Logik wie die App (angular/src/app/core/ratings),
// mitkompiliert statt kopiert. Die fachlichen Tests stehen in angular/src/app/core/ratings/rating.spec.ts; hier wird
// nur geprüft, dass die Backend-Ausgabe genau diese Quelle verwendet und gleich rechnet.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const shared = require('../lib/functions/src/shared/rating.js');

test('Gemeinsame Logik stammt aus dem App-Quelltext, nicht aus einer Kopie', () => {
  assert.ok(existsSync(new URL('../lib/angular/src/app/core/ratings/rating.js', import.meta.url)));
  const app = require('../lib/angular/src/app/core/ratings/rating.js');
  assert.equal(shared.isRated, app.isRated);
  assert.equal(shared.ratingFromDoc, app.ratingFromDoc);
});

test('„Spieler bewertet?“ rechnet im Backend wie in der App', () => {
  const doc = (data) => shared.ratingFromDoc(data);
  assert.equal(shared.isRated(doc({ attendance: 'present', effort: 2, technique: 3, tactics: 2, comprehension: 1 })), true);
  assert.equal(shared.isRated(doc({ attendance: 'present', effort: 2, technique: '', tactics: 2, comprehension: 1 })), false);
  assert.equal(shared.isRated(doc({ attendance: 'absent' })), true);
  assert.equal(shared.isRated(doc({ attendance: 'excluded' })), true);
  assert.equal(shared.isRated(doc({ attendance: 'open' })), false);
  assert.equal(shared.isRated(doc({ attendance: 'present', grade: 3 })), true, 'alte Dokumente mit nur einer Gesamtnote');
  assert.equal(shared.isRated(doc(undefined)), false);
  assert.deepEqual(shared.progress([doc({ attendance: 'absent' }), doc({ attendance: 'open' })]), { done: 1, total: 2, share: 50 });
});
