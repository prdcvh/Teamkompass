// Emulator-Tests: Angaben der Spieler nach einem Termin (SCRUM-138) unter
// players/{playerId}/selfReports/{eventId} (Anstrengung) und players/{playerId}/wellness/{eventId} (Befinden).
// PO-Entscheidung 02.11.2026: Trainerteam und Medizin lesen; Spieler und Eltern lesen und schreiben nur die eigenen
// Angaben; Befinden nur bei dokumentierter Einwilligung speichern, bei widerrufener nicht mehr fuer Medizin/Spieler/Eltern
// lesbar. Starten: siehe tests/rules/README.md. Es werden nur erfundene Testdaten im Emulator verwendet.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

const TEAM = "TESTTEAM";
const t = (path) => `teams/${TEAM}/${path}`;
const iso = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
// Heute (UTC) ist sicher in der Frist; vor 3 Tagen sicher vorbei, in 2 Tagen sicher noch nicht offen.
const TODAY = iso(0);
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-self-reports",
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
      cocoach: { role: "trainer" },
      medic: { role: "physio" },
      scout: { role: "scout" },
      oldscout: { role: "medical" },
      pl1: { role: "player", playerId: "p1", expiresAt: null },
      parent1: { role: "parent", playerId: "p1", expiresAt: null },
      pl2: { role: "player", playerId: "p2", expiresAt: null },
      pl3: { role: "player", playerId: "p3", expiresAt: null },
      oldpl: { role: "player", playerId: "p1", expiresAt: Timestamp.fromMillis(Date.now() - 86_400_000) }
    };
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), data);
    // Einwilligung: p1 dokumentiert, p2 offen, p3 widerrufen.
    await setDoc(doc(db, t("players/p1")), { name: "Eins", consentStatus: "granted" });
    await setDoc(doc(db, t("players/p2")), { name: "Zwei", consentStatus: "pending" });
    await setDoc(doc(db, t("players/p3")), { name: "Drei", consentStatus: "revoked" });
    for (const [id, date] of [["heute", TODAY], ["alt", iso(-3)], ["bald", iso(2)]]) {
      await setDoc(doc(db, t(`events/${id}`)), { title: "Training", date, exertion: 5 });
      for (const p of ["p1", "p2", "p3"]) await setDoc(doc(db, t(`events/${id}/ratings/${p}`)), { playerId: p, attendance: "present" });
    }
    await setDoc(doc(db, t("events/heute/ratings/p2")), { playerId: "p2", attendance: "limited" });
    await setDoc(doc(db, t("events/fehlt")), { title: "Training", date: TODAY, exertion: 5 });
    await setDoc(doc(db, t("events/fehlt/ratings/p1")), { playerId: "p1", attendance: "absent" });
    await setDoc(doc(db, t("events/offen")), { title: "Training", date: TODAY, exertion: 5 });
    // Bestehende Angaben (zum Lesen).
    for (const p of ["p1", "p2", "p3"]) {
      await setDoc(doc(db, t(`players/${p}/selfReports/alt`)), { playerId: p, eventId: "alt", date: iso(-3), exertion: 7, by: "player", updatedAt: Timestamp.now() });
      await setDoc(doc(db, t(`players/${p}/wellness/alt`)), { playerId: p, eventId: "alt", date: iso(-3), fatigue: 3, sleep: 4, soreness: 5, stress: 4, by: "player", updatedAt: Timestamp.now() });
    }
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const report = (uid, playerId = "p1", eventId = "heute") => doc(as(uid), t(`players/${playerId}/selfReports/${eventId}`));
const wellness = (uid, playerId = "p1", eventId = "heute") => doc(as(uid), t(`players/${playerId}/wellness/${eventId}`));
const exertion = (by, extra = {}, playerId = "p1", eventId = "heute", date = TODAY) =>
  ({ playerId, eventId, date, exertion: 6, by, updatedAt: serverTimestamp(), ...extra });
const answers = (by, extra = {}, playerId = "p1", eventId = "heute", date = TODAY) =>
  ({ playerId, eventId, date, fatigue: 5, sleep: 6, soreness: null, stress: 4, by, updatedAt: serverTimestamp(), ...extra });

test("Spieler und Eltern geben die eigene Anstrengung an und ändern sie in der Frist", async () => {
  await assertSucceeds(setDoc(report("pl1"), exertion("player")));
  await assertSucceeds(setDoc(report("pl1"), exertion("player", { exertion: 8 })));
  await assertSucceeds(setDoc(report("parent1"), exertion("parent", { exertion: 0 })));
  await assertSucceeds(setDoc(report("parent1"), exertion("parent", { exertion: 10 })));
  // Auch "eingeschraenkt" zaehlt als Teilnahme; Anstrengung geht ohne Einwilligung (p2 offen, p3 widerrufen).
  await assertSucceeds(setDoc(report("pl2", "p2"), exertion("player", {}, "p2")));
  await assertSucceeds(setDoc(report("pl3", "p3"), exertion("player", {}, "p3")));
});

test("Niemand schreibt die Anstrengung eines fremden Spielers", async () => {
  await assertFails(setDoc(report("pl2", "p1"), exertion("player")));
  await assertFails(setDoc(report("pl1", "p2"), exertion("player", {}, "p2")));
  await assertFails(setDoc(report("pl1", "p2"), exertion("player")));
  for (const uid of [null, "fremd", "oldpl", "medic", "scout", "oldscout", "coach", "cocoach"]) {
    await assertFails(setDoc(report(uid), exertion(uid === "coach" || uid === "cocoach" ? "trainer" : "player")));
  }
});

test("Anstrengung nur in der Frist, nur mit Teilnahme, nur gültige Werte und Felder", async () => {
  await assertFails(setDoc(report("pl1", "p1", "alt"), exertion("player", {}, "p1", "alt", iso(-3))));
  await assertFails(setDoc(report("pl1", "p1", "bald"), exertion("player", {}, "p1", "bald", iso(2))));
  // Falsches Datum, um die Frist zu umgehen.
  await assertFails(setDoc(report("pl1", "p1", "alt"), exertion("player", {}, "p1", "alt", TODAY)));
  // Nicht anwesend bzw. noch keine Anwesenheit eingetragen; Event gibt es nicht.
  await assertFails(setDoc(report("pl1", "p1", "fehlt"), exertion("player", {}, "p1", "fehlt")));
  await assertFails(setDoc(report("pl1", "p1", "offen"), exertion("player", {}, "p1", "offen")));
  await assertFails(setDoc(report("pl1", "p1", "gibtsnicht"), exertion("player", {}, "p1", "gibtsnicht")));
  for (const value of [-1, 11, 5.5, "5", null]) await assertFails(setDoc(report("pl1"), exertion("player", { exertion: value })));
  await assertFails(setDoc(report("pl1"), exertion("parent")));
  await assertFails(setDoc(report("parent1"), exertion("player")));
  await assertFails(setDoc(report("pl1"), exertion("player", { updatedAt: Timestamp.fromMillis(0) })));
  await assertFails(setDoc(report("pl1"), exertion("player", { fatigue: 3 })));
  await assertFails(setDoc(report("pl1"), exertion("player", { eventId: "alt" })));
  await assertFails(setDoc(report("pl1"), exertion("player", { playerId: "p2" })));
});

test("Anstrengung lesen Trainerteam, Medizin und der eigene Spieler bzw. die eigenen Eltern", async () => {
  for (const uid of ["coach", "cocoach", "medic"]) {
    for (const p of ["p1", "p2", "p3"]) await assertSucceeds(getDoc(report(uid, p, "alt")));
    await assertSucceeds(getDocs(collection(as(uid), t("players/p2/selfReports"))));
  }
  for (const uid of ["pl1", "parent1"]) {
    await assertSucceeds(getDoc(report(uid, "p1", "alt")));
    await assertSucceeds(getDocs(collection(as(uid), t("players/p1/selfReports"))));
    await assertFails(getDoc(report(uid, "p2", "alt")));
    await assertFails(getDocs(collection(as(uid), t("players/p2/selfReports"))));
  }
  for (const uid of [null, "fremd", "oldpl", "scout", "oldscout"]) await assertFails(getDoc(report(uid, "p1", "alt")));
});

test("Befinden speichern nur Spieler/Eltern mit dokumentierter Einwilligung", async () => {
  await assertSucceeds(setDoc(wellness("pl1"), answers("player")));
  await assertSucceeds(setDoc(wellness("parent1"), answers("parent", { fatigue: null, sleep: null, stress: null })));
  // Einwilligung offen bzw. widerrufen: kein Befinden (auch nicht leer), Anstrengung geht weiter.
  await assertFails(setDoc(wellness("pl2", "p2"), answers("player", {}, "p2")));
  await assertFails(setDoc(wellness("pl3", "p3"), answers("player", {}, "p3")));
  await assertFails(setDoc(wellness("pl3", "p3"), answers("player", { fatigue: null, sleep: null, stress: null }, "p3")));
  // Fremde Spieler, andere Rollen.
  await assertFails(setDoc(wellness("pl2", "p1"), answers("player")));
  for (const uid of [null, "fremd", "oldpl", "medic", "scout", "coach"]) await assertFails(setDoc(wellness(uid), answers("player")));
});

test("Befinden nur in der Frist, mit Teilnahme und Werten 1–7", async () => {
  await assertFails(setDoc(wellness("pl1", "p1", "alt"), answers("player", {}, "p1", "alt", iso(-3))));
  await assertFails(setDoc(wellness("pl1", "p1", "bald"), answers("player", {}, "p1", "bald", iso(2))));
  await assertFails(setDoc(wellness("pl1", "p1", "fehlt"), answers("player", {}, "p1", "fehlt")));
  for (const value of [0, 8, 2.5, "3"]) await assertFails(setDoc(wellness("pl1"), answers("player", { sleep: value })));
  await assertFails(setDoc(wellness("pl1"), answers("player", { exertion: 5 })));
  await assertFails(setDoc(wellness("pl1"), answers("player", { updatedAt: Timestamp.fromMillis(0) })));
});

test("Befinden lesen: Trainer immer, Medizin/Spieler/Eltern nicht bei widerrufener Einwilligung", async () => {
  for (const uid of ["coach", "cocoach"]) {
    for (const p of ["p1", "p2", "p3"]) await assertSucceeds(getDoc(wellness(uid, p, "alt")));
  }
  // Einwilligung dokumentiert und offen: Medizin liest (auch als Liste).
  for (const p of ["p1", "p2"]) {
    await assertSucceeds(getDoc(wellness("medic", p, "alt")));
    await assertSucceeds(getDocs(collection(as("medic"), t(`players/${p}/wellness`))));
  }
  await assertFails(getDoc(wellness("medic", "p3", "alt")));
  await assertFails(getDocs(collection(as("medic"), t("players/p3/wellness"))));
  await assertSucceeds(getDoc(wellness("pl1", "p1", "alt")));
  await assertSucceeds(getDoc(wellness("parent1", "p1", "alt")));
  await assertSucceeds(getDocs(collection(as("pl2"), t("players/p2/wellness"))));
  await assertFails(getDoc(wellness("pl3", "p3", "alt")));
  await assertFails(getDocs(collection(as("pl3"), t("players/p3/wellness"))));
  // Fremde Angaben nie, Scouts und abgelaufene Zugänge gar nicht.
  await assertFails(getDoc(wellness("pl1", "p2", "alt")));
  await assertFails(getDocs(collection(as("pl1"), t("players/p2/wellness"))));
  for (const uid of [null, "fremd", "oldpl", "scout", "oldscout"]) await assertFails(getDoc(wellness(uid, "p1", "alt")));
});

test("Löschen nur das Trainerteam", async () => {
  for (const uid of ["pl1", "parent1", "medic", "scout"]) {
    await assertFails(deleteDoc(report(uid, "p1", "alt")));
    await assertFails(deleteDoc(wellness(uid, "p1", "alt")));
  }
  await assertSucceeds(deleteDoc(report("coach", "p1", "alt")));
  await assertSucceeds(deleteDoc(wellness("cocoach", "p3", "alt")));
});
