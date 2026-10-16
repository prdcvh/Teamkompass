// Emulator-Tests: wer darf was? (SCRUM-38) Rollen-Matrix fuer die wichtigsten Pfade von firestore.rules.
// Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, deleteDoc, updateDoc, where, Timestamp } from "firebase/firestore";

const TEAM = "TESTTEAM";
const t = (path) => `teams/${TEAM}/${path}`;
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-roles",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const past = () => Timestamp.fromMillis(Date.now() - 86_400_000);
const future = () => Timestamp.fromMillis(Date.now() + 86_400_000);

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = {
      coach: { role: "trainer" },
      medic: { role: "medical" },
      pl1: { role: "player", playerId: "p1", expiresAt: null },
      parent1: { role: "parent", playerId: "p1", expiresAt: null },
      pl2: { role: "player", playerId: "p2", expiresAt: null },
      oldpl: { role: "player", playerId: "p1", expiresAt: past() },
      futurepl: { role: "player", playerId: "p1", expiresAt: future() }
    };
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
    for (const id of ["p1", "p2"]) {
      await setDoc(doc(db, t(`players/${id}`)), { name: id });
      await setDoc(doc(db, t(`players/${id}/developmentPlans/f1`)), { playerId: id, focus: "x", selfReflection: "", selfReflectionAt: "" });
      await setDoc(doc(db, t(`players/${id}/absences/a1`)), { playerId: id, label: "Urlaub" });
      await setDoc(doc(db, t(`players/${id}/measurements/m1`)), { playerId: id, value: 1 });
      await setDoc(doc(db, t(`events/e1/ratings/${id}`)), { playerId: id, effort: 2 });
      await setDoc(doc(db, t(`events/e1/privateNotes/${id}`)), { note: "intern" });
    }
    await setDoc(doc(db, t("events/e1")), { title: "Training" });
    await setDoc(doc(db, t("opponents/o1")), { name: "Gegner" });
    await setDoc(doc(db, t("meta/lineup")), { assignments: {} });
    await setDoc(doc(db, t("meta/settings")), { defaultLocation: { text: "Heimplatz", coords: null } });
    await setDoc(doc(db, t("meta/planning")), { series: { s1: { weekday: 2, startTime: "17:30" } } });
    await setDoc(doc(db, t("meta/breaks")), { breaks: { b1: { name: "Winterpause", startDate: "2026-12-20", endDate: "2027-01-10" } } });
    await setDoc(doc(db, t("invites/code1")), { role: "player", playerId: "p1", expiresAt: null });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const canRead = (uid, path) => assertSucceeds(getDoc(doc(as(uid), t(path))));
const cannotRead = (uid, path) => assertFails(getDoc(doc(as(uid), t(path))));

test("Trainer liest und schreibt alles Wesentliche", async () => {
  for (const path of ["players/p1", "players/p2", "events/e1", "events/e1/ratings/p2", "events/e1/privateNotes/p1", "opponents/o1", "meta/lineup", "meta/settings", "meta/planning", "meta/breaks", "players/p1/absences/a1", "players/p1/measurements/m1", "players/p1/developmentPlans/f1"]) await canRead("coach", path);
  const db = as("coach");
  await assertSucceeds(setDoc(doc(db, t("players/p3")), { name: "neu" }));
  await assertSucceeds(setDoc(doc(db, t("events/e2")), { title: "neu" }));
  await assertSucceeds(setDoc(doc(db, t("meta/planning")), { series: { s2: { weekday: 4 } } }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, t("meta/breaks")), { breaks: { b2: { name: "Herbstferien", startDate: "2026-10-26", endDate: "2026-11-08" } } }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, t("events/e1/ratings/p3")), { playerId: "p3" }));
  await assertSucceeds(deleteDoc(doc(db, t("opponents/o1"))));
  await assertSucceeds(getDocs(collection(db, t("members"))));
  await assertSucceeds(getDocs(collection(db, t("invites"))));
});

test("Ohne Anmeldung und als Nicht-Mitglied geht nichts", async () => {
  for (const uid of [null, "fremd"]) {
    for (const path of ["players/p1", "events/e1", "events/e1/ratings/p1", "opponents/o1", "meta/lineup", "meta/settings", "meta/planning", "meta/breaks"]) await cannotRead(uid, path);
    await assertFails(setDoc(doc(as(uid), t("players/p9")), { name: "x" }));
  }
});

test("Medizin: Spieler, Abwesenheiten und Messwerte lesbar; keine Noten, Notizen, Pläne, Gegner, Aufstellung; nichts schreibbar", async () => {
  for (const path of ["players/p1", "players/p2", "players/p1/absences/a1", "players/p2/measurements/m1", "events/e1"]) await canRead("medic", path);
  for (const path of ["events/e1/ratings/p1", "events/e1/privateNotes/p1", "players/p1/developmentPlans/f1", "opponents/o1", "meta/lineup", "meta/settings", "meta/planning"]) await cannotRead("medic", path);
  await assertFails(setDoc(doc(as("medic"), t("players/p1/absences/a2")), { playerId: "p1", label: "x" }));
  await assertFails(setDoc(doc(as("medic"), t("players/p9")), { name: "x" }));
});

test("Spieler und Eltern: nur das eigene Profil samt Noten, Plänen, Abwesenheiten, Messwerten; nie fremde Daten oder interne Notizen", async () => {
  for (const uid of ["pl1", "parent1"]) {
    for (const path of ["players/p1", "events/e1/ratings/p1", "players/p1/developmentPlans/f1", "players/p1/absences/a1", "players/p1/measurements/m1", "events/e1"]) await canRead(uid, path);
    for (const path of ["players/p2", "events/e1/ratings/p2", "players/p2/developmentPlans/f1", "players/p2/absences/a1", "events/e1/privateNotes/p1", "opponents/o1", "meta/lineup", "meta/settings", "meta/planning"]) await cannotRead(uid, path);
    await assertFails(getDocs(collection(as(uid), t("members"))));
    await assertFails(getDocs(collection(as(uid), t("invites"))));
    await assertFails(getDocs(collection(as(uid), t("players"))));
  }
});

test("Spieler listen Pläne und Noten nur mit passendem playerId-Filter (so fragt die App ab)", async () => {
  const db = as("pl1");
  const plans = (id) => collection(db, t(`players/${id}/developmentPlans`));
  await assertSucceeds(getDocs(query(plans("p1"), where("playerId", "==", "p1"))));
  await assertFails(getDocs(plans("p1")));
  await assertFails(getDocs(query(plans("p2"), where("playerId", "==", "p2"))));
  const ratings = collection(db, t("events/e1/ratings"));
  await assertSucceeds(getDocs(query(ratings, where("playerId", "==", "p1"))));
  await assertFails(getDocs(ratings));
  await assertFails(getDocs(query(ratings, where("playerId", "==", "p2"))));
});

test("Spieler dürfen nur die Selbstreflexion des eigenen Förderplans ändern (Eltern gar nichts)", async () => {
  const plan = (uid) => doc(as(uid), t("players/p1/developmentPlans/f1"));
  await assertSucceeds(updateDoc(plan("pl1"), { selfReflection: "ok", selfReflectionAt: "2026-10-12" }));
  await assertFails(updateDoc(plan("pl1"), { focus: "geändert" }));
  await assertFails(updateDoc(plan("pl2"), { selfReflection: "fremd" }));
  await assertFails(updateDoc(plan("parent1"), { selfReflection: "eltern" }));
});

test("Spieler, Eltern und Medizin können keine Bewertungen, Spieler, Events oder Gegner schreiben oder löschen", async () => {
  for (const uid of ["pl1", "parent1", "medic"]) {
    const db = as(uid);
    await assertFails(setDoc(doc(db, t("events/e1/ratings/p1")), { playerId: "p1", effort: 1 }));
    await assertFails(setDoc(doc(db, t("players/p1")), { name: "hack" }));
    await assertFails(deleteDoc(doc(db, t("players/p1"))));
    await assertFails(setDoc(doc(db, t("events/e9")), { title: "x" }));
    await assertFails(setDoc(doc(db, t("opponents/o9")), { name: "x" }));
    await assertFails(setDoc(doc(db, t("meta/lineup")), { assignments: {} }));
    await assertFails(setDoc(doc(db, t("meta/settings")), { defaultLocation: null }));
    await assertFails(setDoc(doc(db, t("meta/planning")), { series: {} }));
    await assertFails(deleteDoc(doc(db, t("meta/planning"))));
    await assertFails(setDoc(doc(db, t("meta/breaks")), { breaks: {} }));
    await assertFails(setDoc(doc(db, t("meta/breaks")), { breaks: { b9: { name: "Hack", startDate: "2026-01-01", endDate: "2026-12-31" } } }, { merge: true }));
    await assertFails(deleteDoc(doc(db, t("meta/breaks"))));
  }
});

// SCRUM-150: Pausen liegen in einem eigenen Dokument, das jedes aktive Teammitglied lesen darf (Hinweis
// "Winterpause bis 10.01."), die Serien in meta/planning aber nicht.
test("Pausen (meta/breaks): jedes aktive Teammitglied liest sie, die Serien (meta/planning) nur der Trainer", async () => {
  for (const uid of ["coach", "pl1", "pl2", "parent1", "medic", "futurepl"]) {
    await canRead(uid, "meta/breaks");
    const snap = await getDoc(doc(as(uid), t("meta/breaks")));
    assert.deepEqual(Object.keys(snap.data().breaks), ["b1"]);
  }
  for (const uid of ["pl1", "pl2", "parent1", "medic", "futurepl"]) await cannotRead(uid, "meta/planning");
  for (const uid of [null, "fremd", "oldpl"]) await cannotRead(uid, "meta/breaks");
});

test("Pausen: Spieler sehen weiter nur ihre eigenen Daten, auch wenn sie die Pausen lesen", async () => {
  await canRead("pl1", "meta/breaks");
  for (const path of ["players/p2", "events/e1/ratings/p2", "players/p2/developmentPlans/f1", "players/p2/absences/a1", "events/e1/privateNotes/p1", "opponents/o1", "meta/lineup", "meta/settings", "meta/planning", "meta/operations", "appState/current"]) await cannotRead("pl1", path);
  await canRead("pl1", "players/p1");
  await canRead("pl1", "events/e1/ratings/p1");
});

test("Pausen: nur der Trainer schreibt und löscht", async () => {
  const coach = as("coach");
  await assertSucceeds(setDoc(doc(coach, t("meta/breaks")), { breaks: { b3: { name: "Sommerpause", startDate: "2027-07-01", endDate: "2027-08-15" } } }, { merge: true }));
  await assertSucceeds(deleteDoc(doc(coach, t("meta/breaks"))));
  for (const uid of [null, "fremd", "oldpl"]) await assertFails(setDoc(doc(as(uid), t("meta/breaks")), { breaks: {} }));
});

test("Abgelaufene Zugänge sehen nichts mehr, befristete noch gültige schon", async () => {
  await cannotRead("oldpl", "players/p1");
  await cannotRead("oldpl", "events/e1");
  await canRead("futurepl", "players/p1");
});

test("Mitgliedschaften: nur Trainer legen Trainer-/Medizin-Konten an; niemand ändert Rollen", async () => {
  await assertSucceeds(setDoc(doc(as("coach"), t("members/neu-medic")), { role: "medical" }));
  await assertFails(setDoc(doc(as("pl1"), t("members/selfmade")), { role: "trainer" }));
  await assertFails(setDoc(doc(as("fremd"), t("members/fremd")), { role: "trainer" }));
  await assertFails(setDoc(doc(as("fremd"), t("members/fremd")), { role: "medical" }));
  await assertFails(updateDoc(doc(as("coach"), t("members/pl1")), { role: "trainer" }));
  await assertFails(updateDoc(doc(as("pl1"), t("members/pl1")), { role: "trainer" }));
  await assertSucceeds(deleteDoc(doc(as("coach"), t("members/pl2"))));
  await assertFails(deleteDoc(doc(as("pl1"), t("members/pl2"))));
});

test("Jeder liest nur das eigene Mitglieds-Dokument; Einladungen gezielt per Code, nicht als Liste", async () => {
  await canRead("pl1", "members/pl1");
  await cannotRead("pl1", "members/pl2");
  await canRead("fremd", "invites/code1");
  await cannotRead(null, "invites/code1");
  await assertFails(getDocs(collection(as("fremd"), t("invites"))));
  await assertFails(setDoc(doc(as("fremd"), t("invites/neu")), { role: "player", playerId: "p1" }));
  await assertSucceeds(setDoc(doc(as("coach"), t("invites/neu")), { role: "player", playerId: "p1", expiresAt: null }));
});
