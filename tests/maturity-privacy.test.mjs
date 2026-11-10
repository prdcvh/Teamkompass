// SCRUM-252: Reifedaten (Groesse der Eltern, Geschlecht fuer die Formel, abgeleiteter Reifestand, Bio-Banding) bleiben
// in Trainer-/Medizin-Ansichten. Dieser Test listet jede App-Datei, die die Reife-Module einbindet oder die Sammlung
// "maturity" anspricht, und vergleicht sie mit einer festen Liste. Kommt eine neue Stelle dazu (Export, Suche,
// Spielerkarte, Rangliste, Noten/Punkte, Scout-Ansicht ...), schlaegt der Test fehl: dann bewusst pruefen, ob die
// Stelle die Rollen- und Widerrufsregeln aus docs/legal/reife-kompass.md einhaelt, und die Liste hier ergaenzen.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../angular/src/app/", import.meta.url));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "testing") out.push(...(await sourceFiles(path)));
    } else if ((entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")) || entry.name.endsWith(".html")) {
      out.push(path);
    }
  }
  return out;
}

const MATURITY_IMPORT = /from '[^']*\/(maturity|maturity\.api|maturity\.service|bio-banding|bio-banding\.service|maturity-card)'/;
const MATURITY_PATH = /'maturity'/;

// Erlaubte Stellen und warum (das Rechen-Modul core/records/maturity.ts selbst bindet sich nicht ein).
const ALLOWED = {
  "core/firebase/maturity.api.ts": "Lesen/Schreiben/Loeschen des Dokuments maturity/parents",
  "core/firebase/players.api.ts": "Spieler loeschen loescht maturity mit",
  "core/records/maturity.service.ts": "nur Trainer/Medizin",
  "core/records/bio-banding.ts": "Vorschlag, rechnet ueber maturityInputsForCalculation",
  "core/records/bio-banding.service.ts": "nur Trainer/Medizin, ohne widerrufene Spieler",
  "pages/event-rating/event-details.ts": "Bio-Banding bei Trainings, nur Trainer/Medizin",
  "pages/profile/maturity-card.ts": "Karte im Profil, nur Trainer/Medizin",
  "pages/profile/profile-extras.ts": "bindet die Karte ein",
  "pages/profile/consent-panel.ts": "Aufgabe Gesundheitsdaten pruefen und loeschen (nur Trainer)"
};

test("Reifedaten werden nur an den bekannten Stellen verwendet (kein Export, keine Suche, keine Noten/Punkte)", async () => {
  const found = [];
  for (const file of await sourceFiles(root)) {
    const text = await readFile(file, "utf8");
    if (MATURITY_IMPORT.test(text) || MATURITY_PATH.test(text)) found.push(relative(root, file).split("\\").join("/"));
  }
  assert.deepEqual(found.sort(), Object.keys(ALLOWED).sort());
});

test("Export, Datensicherung, Profil-PDF, Suche und Spielerkarte kennen keine Reifedaten", async () => {
  for (const path of [
    "angular/src/app/core/export/export.ts",
    "angular/src/app/core/export/backup-import.ts",
    "angular/src/app/pages/export/export.ts",
    "angular/src/app/core/shell/search.ts",
    "angular/src/app/core/profile/profile-report.ts",
    "angular/src/app/core/player/consent-card.service.ts"
  ]) {
    const text = await read(path);
    for (const word of ["maturity", "motherHeight", "fatherHeight", "parentsConsent", "bioBand"]) {
      assert.ok(!text.includes(word), `${path} enthaelt ${word}`);
    }
  }
});

test("Regeln: maturity nur fuer Trainer und Medizin, Widerruf sperrt neue Groessen der Eltern", async () => {
  const rules = await read("firestore.rules");
  const block = rules.slice(rules.indexOf("match /maturity/{docId}"), rules.indexOf("match /selfReports/{eventId}"));
  assert.match(block, /allow read: if isTrainer\(\) \|\| \(isPhysio\(\) && !consentRevoked\(playerId\)\);/);
  assert.match(block, /!revokedAfterWrite\(\) \|\| noParentHeights\(request\.resource\.data\)/);
  assert.match(block, /parentsConsentRecordOk\(request\.resource\.data\)/);
  assert.ok(!/collectionGroup|\{path=\*\*\}\/maturity/.test(rules.replace(/\/\/.*$/gm, "")), "kein collectionGroup-Zugriff auf maturity");
});
