#!/usr/bin/env node
// Einmal-Skript (SCRUM-202): stellt alle Konten mit der alten Rollenkennung "medical" (frueherer Scout-Zugang)
// in allen Teams auf "scout" um.
//   node scripts/migrate-medical-role.mjs            Probelauf (Standard, schreibt nichts)
//   node scripts/migrate-medical-role.mjs --apply    echter Lauf
// Aendert nur das Feld "role" der betroffenen members-Dokumente (merge), sonst nichts. Mehrfach ausfuehrbar.
// Details und Einrichtung: FIREBASE_SETUP.md, Abschnitt "Alte Rollenkennung medical aufraeumen".
import { NEW_ROLE, OLD_ROLE, parseArgs, planMigration } from "./migrate-medical-role-lib.mjs";

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const { apply } = options;

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

appModule.initializeApp(useEmulator ? { projectId: process.env.GCLOUD_PROJECT || "demo-migrate-medical" } : { credential: appModule.applicationDefault() });
const db = firestoreModule.getFirestore();

// Alle Teams auf einmal (mein-team, U15, U17, U14 und kuenftige): Sammlungsgruppe "members", nur Lesen.
async function findMedical() {
  const snapshot = await db.collectionGroup("members").where("role", "==", OLD_ROLE).get();
  return planMigration(snapshot.docs.map((entry) => ({ path: entry.ref.path, data: entry.data() })));
}

const plan = await findMedical();
for (const path of plan.skipped) console.log(`  Hinweis: ${path} hat role "${OLD_ROLE}", liegt aber nicht unter teams/<Team>/members - wird nicht angefasst.`);
console.log(`${apply ? "Stelle um" : "[Probelauf] Wuerde umstellen"}: ${plan.writes.length} Konto/Konten von "${OLD_ROLE}" auf "${NEW_ROLE}"`);
for (const [teamId, uids] of Object.entries(plan.byTeam).sort()) console.log(`  teams/${teamId}: ${uids.length} (${uids.join(", ")})`);

if (!apply) {
  console.log(plan.writes.length === 0 && plan.skipped.length === 0
    ? 'Kein Konto mit "medical" - der Alias kann entfernt werden (PR mergen).'
    : "Nichts geschrieben. Fuer den echten Lauf denselben Befehl mit --apply wiederholen.");
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
for (const { path, data } of plan.writes) writer.set(db.doc(path), data, { merge: true });
await writer.close();
if (writeErrors) {
  console.error(`${writeErrors} Dokument(e) konnten nicht geschrieben werden. Skript kann gefahrlos erneut laufen.`);
  process.exit(1);
}
const remaining = (await findMedical()).writes.length;
console.log(remaining === 0 ? 'Fertig. Kontrolle: kein Konto mit "medical" mehr uebrig.' : `Fertig, aber noch ${remaining} Konto/Konten mit "medical" - Skript erneut ausfuehren.`);
process.exit(remaining === 0 ? 0 : 1);
