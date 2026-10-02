#!/usr/bin/env node
// Kopiert alle Daten unter teams/<quelle> nach teams/<ziel> (Firestore, rekursiv inkl. Sub-Collections).
//   node scripts/copy-team.mjs mein-team U14 --dry-run
//   node scripts/copy-team.mjs mein-team U14
//   node scripts/copy-team.mjs mein-team U14 --overwrite   (Ziel ist schon belegt, z.B. fuer den Cutover)
// Die Quelle wird nie veraendert. Details und Einrichtung: FIREBASE_SETUP.md, Abschnitt "Daten in ein neues Team kopieren".
import { collectionKey, mapPath, mapValue, parseArgs } from "./copy-team-lib.mjs";

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const { from, to, dryRun, overwrite } = options;

let appModule;
let firestoreModule;
try {
  appModule = await import("firebase-admin/app");
  firestoreModule = await import("firebase-admin/firestore");
} catch {
  console.error("firebase-admin fehlt. Einmalig ausfuehren: npm install --no-save firebase-admin");
  process.exit(2);
}
const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST); // lokaler Test ohne Zugangsdaten
if (!useEmulator && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS fehlt (Pfad zur Service-Account-JSON, nicht ins Repo einchecken).");
  process.exit(2);
}

appModule.initializeApp(useEmulator ? { projectId: process.env.GCLOUD_PROJECT || "demo-copy-team" } : { credential: appModule.applicationDefault() });
const db = firestoreModule.getFirestore();
const refHelpers = { isRef: (value) => value instanceof firestoreModule.DocumentReference, makeRef: (path) => db.doc(path) };

const sourceRoot = db.doc(`teams/${from}`);
const targetRoot = db.doc(`teams/${to}`);

const counts = {};
const writer = dryRun ? null : db.bulkWriter();
let writeErrors = 0;
writer?.onWriteError((error) => {
  if (error.failedAttempts < 5) return true;
  writeErrors += 1;
  console.error(`Schreiben fehlgeschlagen: ${error.documentRef.path}: ${error.message}`);
  return false;
});

async function copyDocument(sourceRef) {
  const snapshot = await sourceRef.get();
  if (snapshot.exists) {
    const key = collectionKey(sourceRef.path, from);
    counts[key] = (counts[key] || 0) + 1;
    if (writer) writer.set(db.doc(mapPath(sourceRef.path, from, to)), mapValue(snapshot.data(), from, to, refHelpers));
  }
  for (const sub of await sourceRef.listCollections()) {
    // listDocuments() liefert auch Dokumente ohne eigene Felder, unter denen nur Sub-Collections liegen.
    for (const docRef of await sub.listDocuments()) await copyDocument(docRef);
  }
}

// Vorab-Check: ist das Ziel schon belegt?
const targetHasData = (await targetRoot.get()).exists || (await targetRoot.listCollections()).length > 0;
if (targetHasData && !overwrite) {
  console.error(`Abbruch: teams/${to} enthaelt bereits Daten. Mit --overwrite werden gleichnamige Dokumente ueberschrieben (zusaetzliche Ziel-Dokumente bleiben bestehen).`);
  process.exit(1);
}

await copyDocument(sourceRoot);
if (writer) await writer.close();

console.log(`${dryRun ? "[Dry-Run] Wuerde kopieren" : "Kopiert"}: teams/${from} -> teams/${to}`);
for (const [key, count] of Object.entries(counts).sort()) console.log(`  ${key}: ${count}`);
if (writeErrors) {
  console.error(`${writeErrors} Dokument(e) konnten nicht geschrieben werden.`);
  process.exit(1);
}
