// SCRUM-198: Test im Firebase-Emulator (Functions-Emulator, Projekt demo-teamkompass = ohne echte Daten/Zugang).
// Läuft nur über `npm --prefix functions run test:emulator`: firebase emulators:exec setzt FIREBASE_EMULATOR_HUB,
// dort steht, wo der Functions-Emulator lauscht.
import assert from 'node:assert/strict';
import { before, test } from 'node:test';

const project = process.env.GCLOUD_PROJECT;
let host;

before(async () => {
  const hub = process.env.FIREBASE_EMULATOR_HUB;
  assert.ok(hub, 'FIREBASE_EMULATOR_HUB fehlt – Test bitte über npm run test:emulator starten');
  const emulators = await (await fetch(`http://${hub}/emulators`)).json();
  assert.ok(emulators.functions, 'Functions-Emulator läuft nicht');
  host = `${emulators.functions.host}:${emulators.functions.port}`;
});

test('Emulator läuft mit Demo-Projekt (keine echten Daten, kein Zugang)', () => {
  assert.equal(project, 'demo-teamkompass');
});

test('healthCheck ist in europe-west3 erreichbar und antwortet {"status":"ok"}', async () => {
  const response = await fetch(`http://${host}/${project}/europe-west3/healthCheck`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('healthCheck lehnt POST ab', async () => {
  const response = await fetch(`http://${host}/${project}/europe-west3/healthCheck`, { method: 'POST' });
  assert.equal(response.status, 405);
});

test('In einer anderen Region gibt es die Funktion nicht', async () => {
  const response = await fetch(`http://${host}/${project}/us-central1/healthCheck`);
  assert.notEqual(response.status, 200);
});
