// Emulator-Tests: Vereinsvergleich (SCRUM-197, PO-Entscheidung vom 06.11.2026 - nur innerhalb des eigenen Vereins,
// ohne Cloud Function). Je Team eine Kurzfassung clubs/{clubId}/comparison/{teamId}, die nur der Trainer dieses Teams
// schreibt. Lesen: Trainer von Teams desselben Vereins (ueber den Verweis comparisonReaders/{uid}, live geprueft) und der
// Vereinsadmin - nur bei eingeschaltetem Vergleich (Opt-in je Verein). Spieler, Eltern, Medizin, Scout, fremde Vereine:
// nichts. Trainer bekommen dadurch KEINEN Zugriff auf die Teamdaten anderer Teams.
// Starten: siehe tests/rules/README.md. Nur erfundene Testdaten im Emulator.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { Timestamp, collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";

const PAST = Timestamp.fromMillis(Date.now() - 60 * 1000);
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-club-comparison",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const summary = (teamName = "U13") => ({
  version: 1,
  teamName,
  team: { playerCount: 1, attendanceRate: 90, avgExertion: 5.5, avgGrade: 2.4, trainings: 10, games: 3, focus: { "Eigener Ballbesitz": 6, "Gegnerischer Ballbesitz": 3, "Umschalten": 1 } },
  players: [{ id: "p1", name: "Ali", birthYear: 2013, average: 2.1, rated: 5, attendanceRate: 95 }],
  updatedAt: serverTimestamp()
});

async function seedTeam(db, teamId, prefix, clubId) {
  const t = (path) => `teams/${teamId}/${path}`;
  if (clubId !== undefined) await setDoc(doc(db, `teams/${teamId}`), { clubId, name: `Team ${teamId}`, label: "U13", hasTrainer: true });
  await setDoc(doc(db, t(`members/${prefix}coach`)), { role: "trainer", email: `${prefix}coach@example.test`, uid: `${prefix}coach` });
  await setDoc(doc(db, t(`members/${prefix}old`)), { role: "trainer", uid: `${prefix}old`, expiresAt: PAST });
  await setDoc(doc(db, t(`members/${prefix}player`)), { role: "player", playerId: "p1", uid: `${prefix}player`, expiresAt: null });
  await setDoc(doc(db, t(`members/${prefix}parent`)), { role: "parent", playerId: "p1", uid: `${prefix}parent`, expiresAt: null });
  await setDoc(doc(db, t(`members/${prefix}physio`)), { role: "physio", uid: `${prefix}physio` });
  await setDoc(doc(db, t(`members/${prefix}scout`)), { role: "scout", uid: `${prefix}scout` });
  await setDoc(doc(db, t("players/p1")), { name: "Ali", status: "Verletzt", injuryUntil: "2026-12-01", birthdate: "2013-04-01" });
  await setDoc(doc(db, t("players/p1/absences/a1")), { playerId: "p1", label: "krank" });
  await setDoc(doc(db, t("playerStats/p1")), { playerId: "p1", version: 1, events: {} });
  await setDoc(doc(db, t("events/e1/ratings/p1")), { playerId: "p1", note: "intern" });
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "clubs/A"), { name: "Verein A", logoUrl: null, comparisonEnabled: true });
    await setDoc(doc(db, "clubs/B"), { name: "Verein B", logoUrl: null, comparisonEnabled: true });
    await setDoc(doc(db, "clubs/OFF"), { name: "Verein aus", logoUrl: null });
    await setDoc(doc(db, "clubs/A/admins/adminA"), { uid: "adminA", role: "admin" });
    await setDoc(doc(db, "clubs/B/admins/adminB"), { uid: "adminB", role: "admin" });
    await setDoc(doc(db, "clubs/OFF/admins/adminOff"), { uid: "adminOff", role: "admin" });
    await seedTeam(db, "A1", "a1", "A");
    await seedTeam(db, "A2", "a2", "A");
    await seedTeam(db, "B1", "b1", "B");
    await seedTeam(db, "OFF1", "o1", "OFF");
    await seedTeam(db, "OFF2", "o2", "OFF");
    await seedTeam(db, "NOCLUB", "n", null);
    await seedTeam(db, "LEGACY", "l");
    for (const [club, team] of [["A", "A1"], ["A", "A2"], ["B", "B1"], ["OFF", "OFF1"]]) {
      await setDoc(doc(db, `clubs/${club}/comparison/${team}`), { ...summary(team), updatedAt: Timestamp.now() });
    }
    // Verweise der Trainer (so, wie sie die App anlegt).
    await setDoc(doc(db, "clubs/A/comparisonReaders/a1coach"), { teamId: "A1" });
    await setDoc(doc(db, "clubs/A/comparisonReaders/a2coach"), { teamId: "A2" });
    await setDoc(doc(db, "clubs/B/comparisonReaders/b1coach"), { teamId: "B1" });
    await setDoc(doc(db, "clubs/OFF/comparisonReaders/o1coach"), { teamId: "OFF1" });
  });
});

const denied = (label, promise) => assertFails(promise).catch((error) => { throw new Error(`${label}: ${error.message}`); });
const allowed = (label, promise) => assertSucceeds(promise).catch((error) => { throw new Error(`${label}: ${error.message}`); });
const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

test("1. Trainer desselben Vereins lesen die Kurzfassungen aller Teams des Vereins (einzeln und als Liste)", async () => {
  for (const uid of ["a1coach", "a2coach"]) {
    const db = as(uid);
    await allowed(`${uid} A1`, getDoc(doc(db, "clubs/A/comparison/A1")));
    await allowed(`${uid} A2`, getDoc(doc(db, "clubs/A/comparison/A2")));
    const list = await assertSucceeds(getDocs(collection(db, "clubs/A/comparison")));
    assert.deepEqual(list.docs.map((entry) => entry.id).sort(), ["A1", "A2"]);
  }
  // Auch der Vereinsadmin des Vereins.
  await allowed("adminA", getDocs(collection(as("adminA"), "clubs/A/comparison")));
});

test("2. Keine Einzelwerte fremder Vereine: Trainer und Admin von Verein B lesen nichts von Verein A (und umgekehrt)", async () => {
  for (const uid of ["b1coach", "adminB"]) {
    const db = as(uid);
    await denied(`${uid} get`, getDoc(doc(db, "clubs/A/comparison/A1")));
    await denied(`${uid} list`, getDocs(collection(db, "clubs/A/comparison")));
  }
  await denied("a1coach -> B", getDoc(doc(as("a1coach"), "clubs/B/comparison/B1")));
  await denied("a1coach -> B list", getDocs(collection(as("a1coach"), "clubs/B/comparison")));
  // Ein Trainer von B kann sich keinen Verweis in Verein A anlegen - weder auf sein Team noch auf ein Team von A.
  await denied("b1coach Verweis B1", setDoc(doc(as("b1coach"), "clubs/A/comparisonReaders/b1coach"), { teamId: "B1" }));
  await denied("b1coach Verweis A1", setDoc(doc(as("b1coach"), "clubs/A/comparisonReaders/b1coach"), { teamId: "A1" }));
});

test("3. Spieler, Eltern, Medizin, Scout, abgelaufene Trainer, Teams ohne Verein und Gaeste lesen nichts", async () => {
  for (const uid of ["a1player", "a1parent", "a1physio", "a1scout", "a1old", "ncoach", "lcoach", "fremd", null]) {
    const db = as(uid);
    await denied(`${uid} get`, getDoc(doc(db, "clubs/A/comparison/A1")));
    await denied(`${uid} list`, getDocs(collection(db, "clubs/A/comparison")));
  }
  // Auch mit einem selbst angelegten Verweis nicht (Rolle wird live geprueft).
  for (const uid of ["a1player", "a1parent", "a1physio", "a1scout", "a1old"]) {
    await denied(`${uid} Verweis`, setDoc(doc(as(uid), `clubs/A/comparisonReaders/${uid}`), { teamId: "A1" }));
  }
  // Ein (manipulierter) Verweis auf ein Team, in dem das Konto nicht Trainer ist, gibt nichts frei.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "clubs/A/comparisonReaders/a1player"), { teamId: "A1" });
    await setDoc(doc(ctx.firestore(), "clubs/A/comparisonReaders/b1coach"), { teamId: "B1" });
  });
  await denied("a1player mit Verweis", getDocs(collection(as("a1player"), "clubs/A/comparison")));
  await denied("b1coach mit Verweis", getDocs(collection(as("b1coach"), "clubs/A/comparison")));
});

test("4. Trainer wird entfernt -> Lesen sofort gesperrt (Verweis allein reicht nicht)", async () => {
  await allowed("vorher", getDoc(doc(as("a2coach"), "clubs/A/comparison/A1")));
  await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), "teams/A2/members/a2coach")); });
  await denied("nachher", getDoc(doc(as("a2coach"), "clubs/A/comparison/A1")));
});

test("5. Opt-in: ausgeschaltet (Standard) liest kein Trainer, schreibt keiner; der Admin kann aufraeumen", async () => {
  await denied("o1coach liest", getDoc(doc(as("o1coach"), "clubs/OFF/comparison/OFF1")));
  await denied("o1coach Liste", getDocs(collection(as("o1coach"), "clubs/OFF/comparison")));
  await denied("o1coach schreibt", setDoc(doc(as("o1coach"), "clubs/OFF/comparison/OFF1"), summary()));
  await denied("o2coach schreibt", setDoc(doc(as("o2coach"), "clubs/OFF/comparison/OFF2"), summary()));
  // Der Admin listet und loescht (beim Ausschalten) - auch die Verweise.
  await allowed("adminOff Liste", getDocs(collection(as("adminOff"), "clubs/OFF/comparison")));
  await allowed("adminOff loescht", deleteDoc(doc(as("adminOff"), "clubs/OFF/comparison/OFF1")));
  await allowed("adminOff Verweise", getDocs(collection(as("adminOff"), "clubs/OFF/comparisonReaders")));
  await allowed("adminOff loescht Verweis", deleteDoc(doc(as("adminOff"), "clubs/OFF/comparisonReaders/o1coach")));
  // Ausschalten in Verein A sperrt sofort.
  await allowed("adminA schaltet aus", updateDoc(doc(as("adminA"), "clubs/A"), { comparisonEnabled: false }));
  await denied("a1coach nach Ausschalten", getDoc(doc(as("a1coach"), "clubs/A/comparison/A2")));
});

test("6. Nur der Vereinsadmin schaltet ein/aus - nur als bool", async () => {
  await allowed("adminOff an", updateDoc(doc(as("adminOff"), "clubs/OFF"), { comparisonEnabled: true }));
  await denied("Text statt bool", updateDoc(doc(as("adminOff"), "clubs/OFF"), { comparisonEnabled: "ja" }));
  for (const uid of ["o1coach", "o1player", "adminA"]) {
    await denied(`${uid} schaltet`, updateDoc(doc(as(uid), "clubs/OFF"), { comparisonEnabled: false }));
  }
  // Name/Logo aendern geht weiterhin.
  await allowed("adminOff Name", updateDoc(doc(as("adminOff"), "clubs/OFF"), { name: "Neuer Name" }));
});

test("7. Schreiben: nur der Trainer des eigenen Teams, nur das eigene Team, nur die vorgesehenen Felder", async () => {
  const db = as("a1coach");
  await allowed("eigenes Team", setDoc(doc(db, "clubs/A/comparison/A1"), summary()));
  await denied("anderes Team im Verein", setDoc(doc(db, "clubs/A/comparison/A2"), summary()));
  await denied("in fremden Verein", setDoc(doc(db, "clubs/B/comparison/A1"), summary()));
  await denied("fremdes Team loeschen", deleteDoc(doc(db, "clubs/A/comparison/A2")));
  await denied("Zusatzfeld oben", setDoc(doc(db, "clubs/A/comparison/A1"), { ...summary(), notes: "intern" }));
  await denied("Gesundheit im Teamteil", setDoc(doc(db, "clubs/A/comparison/A1"), { ...summary(), team: { ...summary().team, injured: 2 } }));
  await denied("Zeit vom Client", setDoc(doc(db, "clubs/A/comparison/A1"), { ...summary(), updatedAt: Timestamp.now() }));
  await denied("zu viele Spieler", setDoc(doc(db, "clubs/A/comparison/A1"), { ...summary(), players: Array.from({ length: 201 }, (_, i) => ({ id: `p${i}` })) }));
  for (const uid of ["a1player", "a1parent", "a1physio", "a1scout", "a1old", "adminA", "b1coach"]) {
    await denied(`${uid} schreibt`, setDoc(doc(as(uid), "clubs/A/comparison/A1"), summary()));
  }
  await allowed("eigenes Team loeschen", deleteDoc(doc(db, "clubs/A/comparison/A1")));
});

test("8. Verweis: nur das eigene Konto, nur ein Team, in dem es Trainer ist; fremde Verweise unsichtbar", async () => {
  const db = as("a1coach");
  await allowed("eigener Verweis", setDoc(doc(db, "clubs/A/comparisonReaders/a1coach"), { teamId: "A1" }));
  await allowed("eigener Verweis lesen", getDoc(doc(db, "clubs/A/comparisonReaders/a1coach")));
  await denied("auf fremdes Team", setDoc(doc(db, "clubs/A/comparisonReaders/a1coach"), { teamId: "A2" }));
  await denied("fuer anderes Konto", setDoc(doc(db, "clubs/A/comparisonReaders/a2coach"), { teamId: "A1" }));
  await denied("Zusatzfeld", setDoc(doc(db, "clubs/A/comparisonReaders/a1coach"), { teamId: "A1", role: "admin" }));
  await denied("fremden Verweis lesen", getDoc(doc(db, "clubs/A/comparisonReaders/a2coach")));
  await denied("Verweise auflisten", getDocs(collection(db, "clubs/A/comparisonReaders")));
});

test("9. Keine Ausweitung auf Teamdaten: Trainer anderer Teams des Vereins lesen dort weiterhin nichts", async () => {
  const db = as("a2coach");
  for (const path of ["players/p1", "players/p1/absences/a1", "playerStats/p1", "events/e1/ratings/p1", "members/a1coach"]) {
    await denied(path, getDoc(doc(db, `teams/A1/${path}`)));
  }
});
