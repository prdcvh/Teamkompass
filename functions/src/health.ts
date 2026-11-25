/**
 * Beispielfunktion (SCRUM-198): beweist einmal Build → Test → Deploy. Sie liest und schreibt keine Daten, braucht
 * keine Anmeldung und gibt nichts Vertrauliches aus (keine Version, keine Projekt- oder Umgebungsangaben).
 *
 * Sicherheit für alle späteren Funktionen: Cloud Functions laufen mit Admin-Rechten und umgehen `firestore.rules`.
 * Jede Funktion, die Daten liest oder schreibt, muss deshalb selbst prüfen, wer sie aufruft (angemeldet, Rolle
 * Trainer/Spieler, eigenes Team) – siehe FIREBASE_SETUP.md, Abschnitt 14.
 */
import { onRequest } from 'firebase-functions/v2/https';
// Globale Optionen (Region, Instanzgrenze) vor dem Definieren laden – auch wenn diese Datei allein geladen wird.
import './options';

export interface HealthResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

/** Reine Logik der Antwort (ohne Firebase testbar): nur GET/HEAD, Antwort immer gleich. */
export function healthResponse(method: string | undefined): HealthResponse {
  if (method === 'GET' || method === 'HEAD') {
    return { status: 200, headers: HEADERS, body: JSON.stringify({ status: 'ok' }) };
  }
  return { status: 405, headers: { ...HEADERS, Allow: 'GET, HEAD' }, body: JSON.stringify({ status: 'method-not-allowed' }) };
}

/** Öffentlich erreichbar (kein Datenzugriff); `maxInstances` aus den globalen Optionen begrenzt die Kosten. */
export const healthCheck = onRequest((request, response) => {
  const answer = healthResponse(request.method);
  response.status(answer.status).set(answer.headers).send(answer.body);
});
