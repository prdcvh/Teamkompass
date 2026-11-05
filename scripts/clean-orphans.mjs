#!/usr/bin/env node
// Einmal-Skript (SCRUM-278): findet und loescht Unterdaten geloeschter Spieler, die zurueckgeblieben sind
// (vor allem Anstrengung `selfReports` und Befinden `wellness` aus dem Check-in, SCRUM-138).
//   node scripts/clean-orphans.mjs U17            Probelauf (Standard, loescht nichts, zeigt nur an)
//   node scripts/clean-orphans.mjs U17 --apply    echter Lauf
// Angefasst wird nur teams/<teamId>/players/<id>/..., wenn es das Spielerdokument players/<id> nicht mehr gibt.
// Bestehende Spieler bleiben unveraendert. Mehrfach ausfuehrbar. Einrichtung wie FIREBASE_SETUP.md, Abschnitt 7.
import { parseArgs, planCleanup, summarize } from "./clean-orphans-lib.mjs";

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const { teamId, apply } = options;

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

appModule.initializeApp(useEmulator ? { projectId: process.env.GCLOUD_PROJECT || "demo-clean-orphans" } : { credential: appModule.applicationDefault() });
const db = firestoreModule.getFirestore();

// listDocuments() liefert auch Spieler ohne eigenes Dokument, unter denen nur noch Unterdaten liegen.
const players = [];
for (const ref of await db.collection(`teams/${teamId}/players`).listDocuments()) {
  const exists = (await ref.get()).exists;
  const collections = {};
  if (!exists) {
    for (const sub of await ref.listCollections()) {
      collections[sub.id] = (await sub.listDocuments()).map((doc) => doc.path);
    }
  }
  players.push({ id: ref.id, exists, collections });
}

const orphans = planCleanup(players);
let errors = 0;
if (apply && orphans.length) {
  const writer = db.bulkWriter();
  writer.onWriteError((error) => {
    if (error.failedAttempts < 5) return true;
    errors += 1;
    console.error(`Loeschen fehlgeschlagen: ${error.documentRef.path}: ${error.message}`);
    return false;
  });
  for (const orphan of orphans) for (const path of orphan.paths) writer.delete(db.doc(path));
  await writer.close();
}

for (const line of summarize(teamId, orphans, apply)) console.log(line);
if (errors) {
  console.error(`${errors} Dokument(e) konnten nicht geloescht werden.`);
  process.exit(1);
}
