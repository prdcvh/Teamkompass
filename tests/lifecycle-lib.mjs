// SCRUM-299: Aufräumen und Zeitgrenzen für Tests mit Server und Browser (siehe responsive.test.mjs).
// Ziel: Ein Test endet immer – mit Ergebnis oder einer verständlichen Fehlermeldung – und lässt keine offenen Handles zurück.

/** Bricht mit klarer Meldung ab, wenn `work` (Promise oder Funktion) länger als `ms` braucht. */
export function withTimeout(work, ms, label) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Zeitüberschreitung nach ${ms} ms: ${label}`)), ms);
  });
  const promise = typeof work === 'function' ? Promise.resolve().then(work) : Promise.resolve(work);
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/**
 * Führt `body(cleanup)` aus. Ressourcen werden mit `cleanup.add(label, fn)` angemeldet und am Ende in umgekehrter
 * Reihenfolge geschlossen – auch bei Fehlern und Hängern (jeder Schritt mit eigener Zeitgrenze). Ein Fehler im
 * Aufräumen verdeckt nie den ursprünglichen Fehler des Tests.
 */
export async function withCleanup(body, { closeTimeoutMs = 10_000 } = {}) {
  const steps = [];
  const cleanup = { add(label, fn) { steps.push({ label, fn }); } };
  let failure;
  let failed = false;
  let result;
  try {
    result = await body(cleanup);
  } catch (error) {
    failed = true;
    failure = error;
  }
  const closeErrors = [];
  for (const { label, fn } of steps.reverse()) {
    try {
      await withTimeout(fn, closeTimeoutMs, `Aufräumen: ${label}`);
    } catch (error) {
      closeErrors.push(error);
    }
  }
  if (failed) {
    if (closeErrors.length) failure.cleanupErrors = closeErrors;
    throw failure;
  }
  if (closeErrors.length) throw new AggregateError(closeErrors, `Aufräumen fehlgeschlagen: ${closeErrors.map((e) => e.message).join('; ')}`);
  return result;
}

/** Schließt einen HTTP-Server wirklich: auch offene Keep-Alive-Verbindungen werden getrennt. */
export function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections?.();
  });
}
