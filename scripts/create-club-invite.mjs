#!/usr/bin/env node
// Einladungscode fuer die Registrierung (SCRUM-181) - Ausfuehrung nur durch den PO (Admin-Zugang).
//   node scripts/create-club-invite.mjs --email trainer@verein.de            Probelauf (Standard, schreibt nichts)
//   node scripts/create-club-invite.mjs --email trainer@verein.de --apply    Code wirklich anlegen
//   node scripts/create-club-invite.mjs --club <clubId> --apply              Beitrittscode fuer bestehenden Verein
// Ausgabe: Code und Registrierungslink zum Weitergeben. Details: FIREBASE_SETUP.md, Abschnitt 10.
import { formatCode, parseArgs, planInvite } from "./club-invite-lib.mjs";

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

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

appModule.initializeApp(useEmulator ? { projectId: process.env.GCLOUD_PROJECT || "demo-club-invite" } : { credential: appModule.applicationDefault() });
const db = firestoreModule.getFirestore();

const known = { clubs: new Map(), teams: new Map(), codes: new Map() };
async function existsDoc(map, path) {
  if (!map.has(path)) map.set(path, (await db.doc(path).get()).exists);
  return map.get(path);
}
// planInvite erwartet synchrone Pruefungen: die ueblichen Kandidaten vorab laden (Kollisionen sind praktisch ausgeschlossen,
// der Schreibvorgang unten nutzt trotzdem create() und bricht bei einem vorhandenen Dokument ab).
if (options.clubId) await existsDoc(known.clubs, `clubs/${options.clubId}`);
const state = {
  clubExists: (clubId) => known.clubs.get(`clubs/${clubId}`) ?? false,
  teamExists: (teamId) => known.teams.get(`teams/${teamId}`) ?? false,
  codeExists: (code) => known.codes.get(`clubInvites/${code}`) ?? false
};

const plan = planInvite({ options, state, createdAt: firestoreModule.FieldValue.serverTimestamp() });
if (plan.errors.length) {
  for (const error of plan.errors) console.error(`  Fehler: ${error}`);
  console.error("Abbruch, es wurde nichts geschrieben.");
  process.exit(1);
}
const { write, code, link } = plan;
for (const [map, path] of [[known.clubs, `clubs/${write.data.clubId}`], [known.teams, `teams/${write.data.teamId}`]]) {
  if (write.data.kind === "club" || map === known.teams) {
    if (await existsDoc(map, path)) {
      console.error(`${path} gibt es schon (Zufallskollision) - bitte Skript erneut starten. Nichts geschrieben.`);
      process.exit(1);
    }
  }
}

const art = write.data.kind === "club" ? "NEUER Verein (Einloesender wird Vereinsadmin und erster Trainer)" : `Beitritt zu Verein ${write.data.clubId} (neues Team, kein Admin)`;
console.log(`${options.apply ? "Lege an" : "[Probelauf] Wuerde anlegen"}: ${write.path}`);
console.log(`  Art:        ${art}`);
console.log(`  Gueltig bis: ${write.data.expiresAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} (${options.days} Tage)`);
console.log(`  Nur fuer:   ${write.data.email ?? "jede bestaetigte E-Mail-Adresse (besser --email angeben)"}`);
console.log(`  Vereins-ID: ${write.data.clubId}   Team-ID: ${write.data.teamId}`);
if (!options.apply) {
  console.log("Nichts geschrieben. Fuer den echten Lauf denselben Befehl mit --apply wiederholen (es entsteht dann ein neuer Code).");
  process.exit(0);
}

const data = { ...write.data, expiresAt: firestoreModule.Timestamp.fromDate(write.data.expiresAt) };
try {
  await db.doc(write.path).create(data);
} catch (error) {
  console.error(`Schreiben fehlgeschlagen: ${error.message}`);
  process.exit(1);
}
console.log("");
console.log(`Code:  ${formatCode(code)}`);
console.log(`Link:  ${link}`);
console.log("Den Link (oder den Code) nur an diese eine Person schicken. Er funktioniert genau einmal.");
