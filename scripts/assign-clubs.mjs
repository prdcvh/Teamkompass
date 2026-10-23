#!/usr/bin/env node
// Einmal-Skript (SCRUM-180): ordnet mein-team, U15, U17 dem Verein fc-koenigstein und U14 dem Test-Verein zu.
//   node scripts/assign-clubs.mjs --admin-uid <UID>            Probelauf (Standard, schreibt nichts)
//   node scripts/assign-clubs.mjs --admin-uid <UID> --apply    echter Lauf
// Es zieht nichts um und ueberschreibt nichts: nur neue Dokumente/Felder (merge). Mehrfach ausfuehrbar.
// Details und Einrichtung: FIREBASE_SETUP.md, Abschnitt "Teams einem Verein zuordnen".
import { CLUBS, TEAMS, parseArgs, planAssignment, summarize } from "./assign-clubs-lib.mjs";

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const { adminUid, apply } = options;

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

appModule.initializeApp(useEmulator ? { projectId: process.env.GCLOUD_PROJECT || "demo-assign-clubs" } : { credential: appModule.applicationDefault() });
const db = firestoreModule.getFirestore();

const state = { clubs: {}, admins: {}, teams: {} };
for (const clubId of Object.keys(CLUBS)) {
  const snapshot = await db.doc(`clubs/${clubId}`).get();
  state.clubs[clubId] = snapshot.exists ? snapshot.data() : null;
  state.admins[`${clubId}/${adminUid}`] = (await db.doc(`clubs/${clubId}/admins/${adminUid}`).get()).exists;
}
for (const teamId of Object.keys(TEAMS)) {
  const ref = db.doc(`teams/${teamId}`);
  const snapshot = await ref.get();
  const members = (await ref.collection("members").get()).docs.map((entry) => ({ id: entry.id, data: entry.data() }));
  const hasContent = members.length > 0 || (await ref.listCollections()).length > 0;
  state.teams[teamId] = { data: snapshot.exists ? snapshot.data() : null, hasContent, members };
}

const { writes, notes, errors } = planAssignment({ adminUid, state, timestamp: firestoreModule.FieldValue.serverTimestamp() });

for (const note of notes) console.log(`  Hinweis: ${note}`);
if (errors.length) {
  for (const error of errors) console.error(`  Fehler: ${error}`);
  console.error("Abbruch, es wurde nichts geschrieben.");
  process.exit(1);
}

console.log(`${apply ? "Schreibe" : "[Probelauf] Wuerde schreiben"}: ${writes.length} Dokument(e)`);
for (const [key, count] of Object.entries(summarize(writes)).sort()) console.log(`  ${key}: ${count}`);
for (const { path, data } of writes.filter((entry) => !entry.path.includes("/members/"))) {
  const shown = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value instanceof firestoreModule.FieldValue ? "(Serverzeit)" : value]));
  console.log(`  ${path} <- ${JSON.stringify(shown)}`);
}
if (!apply) {
  console.log("Nichts geschrieben. Fuer den echten Lauf denselben Befehl mit --apply wiederholen.");
  process.exit(0);
}

const writer = db.bulkWriter();
let writeErrors = 0;
writer.onWriteError((error) => {
  if (error.failedAttempts < 5) return true;
  writeErrors += 1;
  console.error(`Schreiben fehlgeschlagen: ${error.documentRef.path}: ${error.message}`);
  return false;
});
for (const { path, data } of writes) writer.set(db.doc(path), data, { merge: true });
await writer.close();
if (writeErrors) {
  console.error(`${writeErrors} Dokument(e) konnten nicht geschrieben werden. Skript kann gefahrlos erneut laufen.`);
  process.exit(1);
}
console.log("Fertig.");
