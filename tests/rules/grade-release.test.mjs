// Emulator-Tests: Noten erst nach "Bewertung veroeffentlichen" (SCRUM-115).
// - events/{e}/ratings/{p}: vollstaendige Bewertung inkl. Kommentar - nur Trainer.
// - events/{e}/ratingValues/{p}: Werte (Anwesenheit, Minuten, Tore, Vorlagen) - Spieler/Eltern immer (eigene).
// - events/{e}/ratingGrades/{p}: Noten mit ratedAt - Spieler/Eltern nur bei gueltiger Freigabe und ratedAt <= publishedUntil.
// - gradeReleases/{p}: Freigabe (publishedUntil = Klick, expiresAt) - schreiben nur Trainer, lesen auch der eigene Spieler.
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, Timestamp } from "firebase/firestore";

const TEAM = "TESTTEAM";
const t = (path) => `teams/${TEAM}/${path}`;
let env;

const HOUR = 3_600_000;
const at = (offsetMs) => Timestamp.fromMillis(Date.now() + offsetMs);
const values = (playerId) => ({ playerId, attendance: "present", minutes: 60, goals: 1, assists: "" });
const grades = (playerId, ratedAt) => ({ playerId, grade: 2.1, effort: 2, technique: 2, tactics: 3, comprehension: 1, ratedAt });
const release = (playerId, publishedUntil, expiresAt) => ({ playerId, publishedUntil, expiresAt, createdBy: "coach" });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-grade-release",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = {
      coach: { role: "trainer" },
      coach2: { role: "trainer" },
      medic: { role: "physio" },
      scout: { role: "scout" },
      pl1: { role: "player", playerId: "p1", expiresAt: null },
      parent1: { role: "parent", playerId: "p1", expiresAt: null },
      pl2: { role: "player", playerId: "p2", expiresAt: null },
      oldpl: { role: "player", playerId: "p1", expiresAt: at(-24 * HOUR) }
    };
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
    for (const id of ["p1", "p2"]) {
      await setDoc(doc(db, t(`players/${id}`)), { name: id, consentStatus: "pending" });
      // e1: vor der Freigabe bewertet, e2: nach der Freigabe.
      for (const event of ["e1", "e2"]) {
        await setDoc(doc(db, t(`events/${event}`)), { title: event, date: "2026-11-01" });
        await setDoc(doc(db, t(`events/${event}/ratings/${id}`)), { playerId: id, attendance: "present", effort: 2, note: "Kommentar" });
        await setDoc(doc(db, t(`events/${event}/ratingValues/${id}`)), values(id));
      }
      await setDoc(doc(db, t(`events/e1/ratingGrades/${id}`)), grades(id, at(-3 * HOUR)));
      await setDoc(doc(db, t(`events/e2/ratingGrades/${id}`)), grades(id, at(-1 * HOUR)));
    }
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const canRead = (uid, path) => assertSucceeds(getDoc(doc(as(uid), t(path))));
const cannotRead = (uid, path) => assertFails(getDoc(doc(as(uid), t(path))));
const seed = (path, data) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), t(path)), data));

test("Ohne Freigabe: Spieler und Eltern sehen die Werte, aber keine Noten und nie die Bewertung mit Kommentar", async () => {
  for (const uid of ["pl1", "parent1"]) {
    await canRead(uid, "events/e1/ratingValues/p1");
    await canRead(uid, "events/e2/ratingValues/p1");
    await cannotRead(uid, "events/e1/ratingGrades/p1");
    await cannotRead(uid, "events/e2/ratingGrades/p1");
    // Auch nicht vorhandene Noten-Dokumente: ohne Freigabe gibt es keine Antwort.
    await cannotRead(uid, "events/e9/ratingGrades/p1");
    await cannotRead(uid, "events/e1/ratings/p1");
    // Die eigene (noch nicht vorhandene) Freigabe darf die App abfragen.
    await canRead(uid, "gradeReleases/p1");
  }
});

test("Mit Freigabe: nur Noten, die bis zum Klick vergeben wurden; Kommentare weiter nie; fremde nie", async () => {
  await seed("gradeReleases/p1", release("p1", at(-2 * HOUR), null));
  for (const uid of ["pl1", "parent1"]) {
    await canRead(uid, "gradeReleases/p1");
    await canRead(uid, "events/e1/ratingGrades/p1");
    // e2 wurde nach dem Klick bewertet: bleibt verborgen bis zur nächsten Veröffentlichung.
    await cannotRead(uid, "events/e2/ratingGrades/p1");
    // Termin ohne Bewertung: gezielter Abruf erlaubt (das Profil fragt jeden Termin ab).
    await canRead(uid, "events/e9/ratingGrades/p1");
    await cannotRead(uid, "events/e1/ratings/p1");
    await cannotRead(uid, "events/e1/privateNotes/p1");
    await cannotRead(uid, "events/e1/ratingGrades/p2");
    await cannotRead(uid, "events/e1/ratingValues/p2");
    await cannotRead(uid, "gradeReleases/p2");
  }
  // Die Freigabe von p1 gibt p2 nichts frei.
  await cannotRead("pl2", "events/e1/ratingGrades/p2");
  await cannotRead("pl2", "events/e1/ratingGrades/p1");
  // Listen bleiben gesperrt - die App fragt gezielt je Termin ab.
  await assertFails(getDocs(collection(as("pl1"), t("events/e1/ratingGrades"))));
  await assertFails(getDocs(query(collection(as("pl1"), t("events/e1/ratingGrades")), where("playerId", "==", "p1"))));
});

test("Neue Veröffentlichung gibt auch neuere Noten frei", async () => {
  await seed("gradeReleases/p1", release("p1", at(-2 * HOUR), null));
  await cannotRead("pl1", "events/e2/ratingGrades/p1");
  await assertSucceeds(setDoc(doc(as("coach"), t("gradeReleases/p1")), { playerId: "p1", publishedUntil: serverTimestamp(), expiresAt: null, createdBy: "coach" }));
  await canRead("pl1", "events/e2/ratingGrades/p1");
});

test("Abgelaufene oder zurückgenommene Freigabe: wieder keine Noten", async () => {
  await seed("gradeReleases/p1", release("p1", at(-2 * HOUR), at(-1 * HOUR)));
  await cannotRead("pl1", "events/e1/ratingGrades/p1");
  await seed("gradeReleases/p1", release("p1", at(-2 * HOUR), at(24 * HOUR)));
  await canRead("pl1", "events/e1/ratingGrades/p1");
  await assertSucceeds(deleteDoc(doc(as("coach"), t("gradeReleases/p1"))));
  await cannotRead("pl1", "events/e1/ratingGrades/p1");
});

test("Noten-Dokument ohne gültigen Zeitpunkt oder mit fremder playerId bleibt auch bei Freigabe verborgen", async () => {
  await seed("gradeReleases/p1", release("p1", at(-2 * HOUR), null));
  await seed("events/e3/ratingGrades/p1", { playerId: "p1", effort: 1 });
  await seed("events/e4/ratingGrades/p1", { ...grades("p2", at(-3 * HOUR)) });
  await cannotRead("pl1", "events/e3/ratingGrades/p1");
  await cannotRead("pl1", "events/e4/ratingGrades/p1");
});

test("Abgelaufene Zugänge, Medizin, Scout und Fremde lesen weder Werte, Noten noch Freigaben", async () => {
  await seed("gradeReleases/p1", release("p1", at(-2 * HOUR), null));
  for (const uid of [null, "fremd", "oldpl", "medic", "scout"]) {
    for (const path of ["events/e1/ratingValues/p1", "events/e1/ratingGrades/p1", "gradeReleases/p1", "events/e1/ratings/p1"]) await cannotRead(uid, path);
  }
});

test("Spieler und Eltern schreiben nichts davon (auch keine eigene Freigabe)", async () => {
  for (const uid of ["pl1", "parent1"]) {
    const db = as(uid);
    await assertFails(setDoc(doc(db, t("gradeReleases/p1")), { playerId: "p1", publishedUntil: serverTimestamp(), expiresAt: null, createdBy: uid }));
    await assertFails(setDoc(doc(db, t("events/e1/ratingValues/p1")), values("p1")));
    await assertFails(setDoc(doc(db, t("events/e1/ratingGrades/p1")), grades("p1", serverTimestamp())));
    await assertFails(setDoc(doc(db, t("events/e1/ratings/p1")), { playerId: "p1", effort: 1 }));
    await assertFails(deleteDoc(doc(db, t("events/e1/ratingValues/p1"))));
  }
  await seed("gradeReleases/p1", release("p1", at(-2 * HOUR), null));
  await assertFails(updateDoc(doc(as("pl1"), t("gradeReleases/p1")), { expiresAt: null }));
  await assertFails(deleteDoc(doc(as("pl1"), t("gradeReleases/p1"))));
});

test("Trainer: veröffentlicht nur mit Server-Zeit und eigenem Konto, Ablauf in der Zukunft oder unbefristet", async () => {
  const db = as("coach");
  const ok = (expiresAt) => ({ playerId: "p1", publishedUntil: serverTimestamp(), expiresAt, createdBy: "coach" });
  await assertSucceeds(setDoc(doc(db, t("gradeReleases/p1")), ok(null)));
  await assertSucceeds(setDoc(doc(db, t("gradeReleases/p1")), ok(at(14 * 24 * HOUR))));
  await assertSucceeds(getDoc(doc(db, t("gradeReleases/p1"))));
  await assertSucceeds(getDocs(collection(db, t("gradeReleases"))));
  // Zurückdatieren, fremdes Konto, abgelaufene Dauer, fremde Felder oder falsche playerId: abgelehnt.
  await assertFails(setDoc(doc(db, t("gradeReleases/p1")), { ...ok(null), publishedUntil: at(24 * HOUR) }));
  await assertFails(setDoc(doc(db, t("gradeReleases/p1")), { ...ok(null), createdBy: "coach2" }));
  await assertFails(setDoc(doc(db, t("gradeReleases/p1")), ok(at(-HOUR))));
  await assertFails(setDoc(doc(db, t("gradeReleases/p1")), ok("2099-01-01")));
  await assertFails(setDoc(doc(db, t("gradeReleases/p1")), { ...ok(null), withComments: true }));
  await assertFails(setDoc(doc(db, t("gradeReleases/p1")), { ...ok(null), playerId: "p2" }));
  await assertSucceeds(deleteDoc(doc(db, t("gradeReleases/p1"))));
});

test("Trainer: speichert Bewertung, Werte- und Noten-Kopie in einem Schreibvorgang; Format der Kopien abgesichert", async () => {
  const db = as("coach");
  const batch = writeBatch(db);
  batch.set(doc(db, t("events/e5/ratings/p1")), { playerId: "p1", attendance: "present", effort: 1, note: "nur Trainer" }, { merge: true });
  batch.set(doc(db, t("events/e5/ratingValues/p1")), values("p1"));
  batch.set(doc(db, t("events/e5/ratingGrades/p1")), { ...grades("p1", serverTimestamp()), scale: "levels" });
  await assertSucceeds(batch.commit());
  for (const name of ["ratings", "ratingValues", "ratingGrades"]) {
    await assertSucceeds(getDoc(doc(db, t(`events/e5/${name}/p1`))));
    await assertSucceeds(getDocs(collection(db, t(`events/e5/${name}`))));
  }
  // Kein Kommentar und keine Noten in der Werte-Kopie, keine Werte/Kommentare in der Noten-Kopie.
  await assertFails(setDoc(doc(db, t("events/e5/ratingValues/p1")), { ...values("p1"), note: "x" }));
  await assertFails(setDoc(doc(db, t("events/e5/ratingValues/p1")), { ...values("p1"), effort: 2 }));
  await assertFails(setDoc(doc(db, t("events/e5/ratingValues/p1")), values("p2")));
  await assertFails(setDoc(doc(db, t("events/e5/ratingGrades/p1")), { ...grades("p1", serverTimestamp()), note: "x" }));
  await assertFails(setDoc(doc(db, t("events/e5/ratingGrades/p1")), { ...grades("p1", serverTimestamp()), minutes: 60 }));
  await assertFails(setDoc(doc(db, t("events/e5/ratingGrades/p1")), grades("p2", serverTimestamp())));
  // ratedAt muss die Server-Zeit sein (sonst ließe sich eine Note in eine alte Freigabe "zurückdatieren").
  await assertFails(setDoc(doc(db, t("events/e5/ratingGrades/p1")), grades("p1", at(-24 * HOUR))));
  await assertFails(setDoc(doc(db, t("events/e5/ratingGrades/p1")), { playerId: "p1", effort: 1 }));
  for (const name of ["ratings", "ratingValues", "ratingGrades"]) await assertSucceeds(deleteDoc(doc(db, t(`events/e5/${name}/p1`))));
});

test("Kennzeichen der Kopien (meta/playerView): nur Trainer", async () => {
  await assertSucceeds(setDoc(doc(as("coach"), t("meta/playerView")), { version: 1, builtAt: "2026-11-03T20:00:00.000Z" }));
  await assertSucceeds(getDoc(doc(as("coach"), t("meta/playerView"))));
  for (const uid of ["pl1", "parent1", "medic", "scout", null]) {
    await cannotRead(uid, "meta/playerView");
    await assertFails(setDoc(doc(as(uid), t("meta/playerView")), { version: 1 }));
  }
});

test("Anstrengung nach dem Termin geht weiter (Regel liest die Anwesenheit aus der Bewertung)", async () => {
  // Gleiche Voraussetzung wie in self-reports.test.mjs, hier nur als Rauchtest: die Bewertung ist für Spieler nicht
  // mehr lesbar, die Regel für selfReports darf sie trotzdem auswerten.
  const today = new Date().toISOString().slice(0, 10);
  await seed("events/heute", { title: "Training", date: today });
  await seed("events/heute/ratings/p1", { playerId: "p1", attendance: "present" });
  await assertSucceeds(setDoc(doc(as("pl1"), t("players/p1/selfReports/heute")), { playerId: "p1", eventId: "heute", date: today, exertion: 6, by: "player", updatedAt: serverTimestamp() }));
});
