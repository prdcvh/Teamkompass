// SCRUM-251: Die Methodenspezifikation des Reife-Kompass und der Rechner tragen dieselbe Methodenversion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const doc = readFileSync(join(root, 'docs', 'reife-kompass-methoden.md'), 'utf8');
const code = readFileSync(join(root, 'angular', 'src', 'app', 'core', 'records', 'maturity.ts'), 'utf8');

test('Methodenversion im Dokument = MATURITY_METHOD_VERSION im Rechner', () => {
  const docVersion = doc.match(/\*\*Methodenversion (\d+\.\d+)\*\*/)?.[1];
  const codeVersion = code.match(/export const MATURITY_METHOD_VERSION = '(\d+\.\d+)';/)?.[1];
  assert.ok(docVersion, 'Dokument nennt keine Methodenversion');
  assert.equal(codeVersion, docVersion);
});

test('Dokument enthält die vom Ticket verlangten Teile', () => {
  for (const heading of [
    '## 2. Methodenmatrix',
    '## 4. Entscheidungsvorlage: Kategorien aus SCRUM-190',
    '## 6. Verlaufshinweise: Mindestdaten, Aktualität, Messfehler',
    '## 7. Grenzen der Übertragbarkeit',
    '## 8. Quellen',
  ]) {
    assert.ok(doc.includes(heading), `fehlt: ${heading}`);
  }
});
