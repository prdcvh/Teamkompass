// SCRUM-266: Konzept (docs/bewertungsmodell.md), Katalog im Code und Firestore-Regeln passen zusammen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const doc = read('docs', 'bewertungsmodell.md');
const catalog = read('angular', 'src', 'app', 'core', 'competence', 'competence-catalog.ts');
const rules = read('firestore.rules');

test('Rasterversion im Dokument = COMPETENCE_FRAMEWORK_VERSION im Code', () => {
  const docVersion = doc.match(/\*\*Rasterversion (raster-\d+)\*\*/)?.[1];
  const codeVersion = catalog.match(/export const COMPETENCE_FRAMEWORK_VERSION = '(raster-\d+)';/)?.[1];
  assert.ok(docVersion, 'Dokument nennt keine Rasterversion');
  assert.equal(codeVersion, docVersion);
});

test('jedes Kriterium und jedes Gewichtsprofil des Katalogs steht im Dokument', () => {
  const criteria = [...catalog.matchAll(/\{ id: '([a-z]+\.[A-Za-z]+)', domain:/g)].map((m) => m[1]);
  assert.equal(criteria.length, 15);
  for (const id of criteria) assert.ok(doc.includes(`\`${id}\``), `Kriterium ${id} fehlt im Dokument`);
  const profiles = [...catalog.matchAll(/\{ id: '(\w+)', label: '[^']+', weights: \{ technique: (\d+), tactics: (\d+), physical: (\d+), psychological: (\d+), social: (\d+) \}/g)];
  assert.equal(profiles.length, 3);
  for (const [, id, ...weights] of profiles) {
    const row = doc.split('\n').find((line) => line.startsWith(`| \`${id}\``));
    assert.ok(row, `Profil ${id} fehlt im Dokument`);
    assert.deepEqual(row.split('|').slice(2, 7).map((cell) => cell.trim()), weights, `Gewichte von ${id} weichen ab`);
  }
});

test('Dokument enthält die vom Ticket verlangten Teile', () => {
  for (const heading of ['## 2. Zwei getrennte Modelle', '## 3. Bereiche und Kriterien', '## 4. Skala', '## 5. Beobachtung (Datenmodell)', '## 7. Team-Konfiguration und Gewichte', '## 8. Optionaler Gesamtindex', '## 9. Rollen, Sichtbarkeit, Datenschutz', '## 10. Was mit den Altnoten passiert']) {
    assert.ok(doc.includes(heading), `fehlt: ${heading}`);
  }
});

test('Regeln: Beobachtungen und Konfigurationen nur Trainer, nie ändern', () => {
  const observations = rules.match(/match \/competenceObservations\/\{observationId\} \{([\s\S]*?)\n        \}/)?.[1];
  assert.ok(observations, 'Regel für competenceObservations fehlt');
  assert.match(observations, /allow read: if isTrainer\(\);/);
  assert.match(observations, /!consentRevoked\(playerId\)/);
  assert.match(observations, /request\.resource\.data\.byUid == request\.auth\.uid/);
  assert.ok(!/allow (update|write)/.test(observations), 'Beobachtungen dürfen nicht geändert werden');
  const configs = rules.match(/match \/competenceConfigs\/\{configId\} \{([\s\S]*?)\n      \}/)?.[1];
  assert.ok(configs, 'Regel für competenceConfigs fehlt');
  assert.match(configs, /allow read: if isTrainer\(\);/);
  assert.ok(!/allow (update|delete|write)/.test(configs), 'Konfigurationsversionen dürfen nicht geändert oder gelöscht werden');
  // Gewichtsprofile in den Regeln = Profile im Katalog.
  const ruleProfiles = configs.match(/weightProfile in \[([^\]]*)\]/)?.[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));
  const codeProfiles = [...catalog.matchAll(/\{ id: '(\w+)', label: '[^']+', weights:/g)].map((m) => m[1]);
  assert.deepEqual(ruleProfiles, codeProfiles);
});
