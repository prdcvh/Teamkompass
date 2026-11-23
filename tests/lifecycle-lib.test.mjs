// SCRUM-299: Regressionstest für das Aufräumen in tests/responsive.test.mjs – Fehler, Hänger und offene Server-Verbindungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent, createServer, request } from 'node:http';
import { closeServer, withCleanup, withTimeout } from './lifecycle-lib.mjs';

test('withTimeout: Hänger bricht mit verständlicher Meldung ab', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 30, 'Seite laden'), /Zeitüberschreitung nach 30 ms: Seite laden/);
  assert.equal(await withTimeout(Promise.resolve(7), 1000, 'schnell'), 7);
});

test('withCleanup: schließt in umgekehrter Reihenfolge, auch wenn der Test fehlschlägt', async () => {
  const order = [];
  await assert.rejects(
    withCleanup(async (cleanup) => {
      cleanup.add('Server', () => order.push('server'));
      cleanup.add('Browser', () => order.push('browser'));
      throw new Error('Navigation fehlgeschlagen');
    }),
    /Navigation fehlgeschlagen/,
  );
  assert.deepEqual(order, ['browser', 'server']);
});

test('withCleanup: hängendes Schließen blockiert nicht und verdeckt den Testfehler nicht', async () => {
  const closed = [];
  const error = await withCleanup(async (cleanup) => {
    cleanup.add('Server', () => closed.push('server'));
    cleanup.add('Browser (hängt)', () => new Promise(() => {}));
    throw new Error('Build kaputt');
  }, { closeTimeoutMs: 30 }).catch((e) => e);
  assert.equal(error.message, 'Build kaputt');
  assert.match(error.cleanupErrors[0].message, /Aufräumen: Browser \(hängt\)/);
  assert.deepEqual(closed, ['server'], 'nachfolgende Schritte laufen trotz Hänger weiter');
});

test('withCleanup: Fehler beim Aufräumen allein wird als Testfehler gemeldet', async () => {
  await assert.rejects(withCleanup(async (cleanup) => { cleanup.add('Context', () => { throw new Error('kaputt'); }); }), /Aufräumen fehlgeschlagen: kaputt/);
});

test('closeServer: beendet auch bei offener Keep-Alive-Verbindung', async () => {
  const server = createServer((_, res) => res.end('ok'));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const agent = new Agent({ keepAlive: true });
  await new Promise((done, fail) => {
    request({ port: server.address().port, host: '127.0.0.1', agent }, (res) => { res.resume(); res.on('end', done); }).on('error', fail).end();
  });
  await withTimeout(closeServer(server), 2000, 'Server schließen');
  assert.equal(server.listening, false);
  agent.destroy();
});
