// SCRUM-198: Schreibt die Funktionsliste functions/functions.yaml aus dem gebauten Code (lib/), im CI-Job ohne
// Schluessel. Liegt die Datei neben package.json, liest `firebase deploy` sie statt den Code der Funktionen
// auszufuehren: Der Deploy-Job mit dem Dienstkonto-Schluessel fuehrt so keinen Projektcode aus (wie SCRUM-57 fuer
// Hosting). `npm run build` loescht die Datei wieder, damit lokal nie eine veraltete Liste liegen bleibt.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('..', import.meta.url));
const output = fileURLToPath(new URL('../functions.yaml', import.meta.url));
const bin = fileURLToPath(new URL('../node_modules/.bin/firebase-functions', import.meta.url));

const result = spawnSync(process.execPath, [bin, dir], {
  cwd: dir,
  stdio: 'inherit',
  env: { PATH: process.env.PATH, FUNCTIONS_MANIFEST_OUTPUT_PATH: output, GCLOUD_PROJECT: 'teamkompass-b8aac' },
});
if (result.status !== 0) process.exit(result.status ?? 1);

const manifest = JSON.parse(readFileSync(output, 'utf8'));
const endpoints = Object.entries(manifest.endpoints ?? {});
if (endpoints.length === 0) throw new Error('functions.yaml: keine Funktion gefunden');
for (const [name, endpoint] of endpoints) {
  const regions = endpoint.region ?? [];
  if (regions.length !== 1 || regions[0] !== 'europe-west3') throw new Error(`${name}: Region ${JSON.stringify(regions)} statt europe-west3`);
}
console.log(`functions.yaml geschrieben: ${endpoints.map(([name]) => name).join(', ')} (europe-west3)`);
