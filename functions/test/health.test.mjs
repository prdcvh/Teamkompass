// Unit-Tests der Beispielfunktion (SCRUM-198), gegen die gebaute Ausgabe in lib/ (vorher npm run build).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { healthResponse, healthCheck } = require('../lib/functions/src/health.js');
const index = require('../lib/functions/src/index.js');

test('GET und HEAD antworten 200 mit {"status":"ok"} und sonst nichts', () => {
  for (const method of ['GET', 'HEAD']) {
    const answer = healthResponse(method);
    assert.equal(answer.status, 200);
    assert.deepEqual(JSON.parse(answer.body), { status: 'ok' });
    assert.equal(answer.headers['Cache-Control'], 'no-store');
  }
});

test('Andere Methoden werden mit 405 abgelehnt', () => {
  for (const method of ['POST', 'PUT', 'DELETE', undefined]) {
    const answer = healthResponse(method);
    assert.equal(answer.status, 405);
    assert.equal(answer.headers.Allow, 'GET, HEAD');
  }
});

test('Antwort enthält keine Versions-, Projekt- oder Umgebungsangaben', () => {
  const body = healthResponse('GET').body;
  assert.equal(body, '{"status":"ok"}');
  assert.doesNotMatch(body, /version|project|env|node|region/i);
});

test('Funktion ist exportiert, läuft in europe-west3 und ist in der Instanzzahl begrenzt', () => {
  assert.equal(index.healthCheck, healthCheck);
  const endpoint = index.healthCheck.__endpoint;
  assert.equal(endpoint.platform, 'gcfv2');
  assert.deepEqual(endpoint.region, ['europe-west3']);
  assert.ok(endpoint.httpsTrigger, 'HTTP-Funktion erwartet');
  assert.ok(endpoint.maxInstances >= 1 && endpoint.maxInstances <= 10, `maxInstances: ${endpoint.maxInstances}`);
  // Nicht gesetzt = null bzw. ResetValue (Standard 0); eine Zahl > 0 hieße dauerhaft laufende Instanzen (Kosten).
  assert.ok(typeof endpoint.minInstances !== 'number' || endpoint.minInstances === 0, 'keine dauerhaft laufenden Instanzen');
  assert.equal(endpoint.secretEnvironmentVariables, undefined, 'Beispielfunktion braucht keine Geheimnisse');
});
