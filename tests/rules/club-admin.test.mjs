// Emulator-Tests: Vereinsadmin (SCRUM-183, PO-Entscheidung B vom 02.11.2026). Der Admin eines Vereins liest in den
// Teams seines Vereins wie ein Trainer mit - nur lesen, nichts aendern, keine Gesundheitsdaten. Er laedt weitere
// Trainer per Trainercode in ein bestehendes Team ein und entfernt Trainer. Teams fremder Vereine sieht er nie.
// Starten: siehe tests/rules/README.md. Nur erfundene Testdaten im Emulator.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { Timestamp, collection, doc, getDoc, getDocs, query, setDoc, deleteDoc, updateDoc, where, writeBatch, serverTimestamp } from "firebase/firestore";

const FAR = Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000);
const PAST = Timestamp.fromMillis(Date.now() - 60 * 1000);
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-club-admin",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

// Gesundheitsdaten und Daten, die der Vereinsadmin nie liest (Spielerdokument mit Status, Rueckmeldung, Notizen,
// persoenliche Einstellungen, technische Kennzeichen). Spieler-Einladungscodes: gezielter Abruf eines BEKANNTEN Codes
// ist fuer jeden Angemeldeten erlaubt (Anmeldung, seit SCRUM-77), auflisten darf der Vereinsadmin sie nicht (Test 2).
const HIDDEN = [
  "players/p1", "players/p2", "players/p1/absences/a1", "players/p1/measurements/m1", "players/p1/maturity/parents",
  "players/p1/wellness/e1", "events/e1/ratings/p1", "events/e1/privateNotes/p1", "events/e1/responses/p1",
  "playerCards/p2", "notifications/acoach", "meta/playerView", "meta/playerStats", "meta/operations", "appState/current"
];
// Was ein Trainer liest und der Vereinsadmin mitlesen darf (keine Gesundheitsdaten).
const READABLE = [
  "members/acoach", "members/aplayer", "events/e1", "events/e1/ratingValues/p1", "events/e1/ratingGrades/p1",
  "events/e1/responses/p2", "gradeReleases/p1", "scoutProfiles/p1", "playerStats/p1", "opponents/o1",
  "players/p1/developmentPlans/f1", "players/p1/selfReports/e1", "meta/lineup", "meta/settings", "meta/planning",
  "meta/breaks", "meta/ranking", "meta/clubOverview", "learningPaths/l1", "learningProgress/p1"
];

async function seedTeam(db, teamId, prefix, clubId) {
  const t = (path) => `teams/${teamId}/${path}`;
  if (clubId !== undefined) await setDoc(doc(db, `teams/${teamId}`), { clubId, name: `Team ${teamId}`, label: "U14", hasTrainer: true });
  await setDoc(doc(db, t(`members/${prefix}coach`)), { role: "trainer", email: `${prefix}coach@example.test`, uid: `${prefix}coach` });
  await setDoc(doc(db, t(`members/${prefix}coach2`)), { role: "trainer", email: `${prefix}coach2@example.test`, uid: `${prefix}coach2` });
  await setDoc(doc(db, t(`members/${prefix}player`)), { role: "player", playerId: "p1", uid: `${prefix}player`, expiresAt: null });
  await setDoc(doc(db, t(`members/${prefix}physio`)), { role: "physio", email: `${prefix}physio@example.test`, uid: `${prefix}physio` });
  await setDoc(doc(db, t(`members/${prefix}scout`)), { role: "scout", email: `${prefix}scout@example.test`, uid: `${prefix}scout` });
  await setDoc(doc(db, t("players/p1")), { name: "Spieler", status: "Verletzt", injuryUntil: "2026-12-01", consentStatus: "granted" });
  await setDoc(doc(db, t("players/p2")), { name: "Spieler 2", status: "Fit", consentStatus: "revoked" });
  await setDoc(doc(db, t("players/p1/developmentPlans/f1")), { playerId: "p1", focus: "Passspiel" });
  await setDoc(doc(db, t("players/p1/absences/a1")), { playerId: "p1", label: "krank" });
  await setDoc(doc(db, t("players/p1/measurements/m1")), { playerId: "p1", value: 1 });
  await setDoc(doc(db, t("players/p1/maturity/parents")), { playerId: "p1", sex: "m", parentsConsent: true, motherHeight: 170 });
  await setDoc(doc(db, t("players/p1/wellness/e1")), { playerId: "p1", fatigue: 3 });
  await setDoc(doc(db, t("players/p1/selfReports/e1")), { playerId: "p1", exertion: 6 });
  await setDoc(doc(db, t("events/e1")), { title: "Training", date: "2026-10-01" });
  await setDoc(doc(db, t("events/e1/ratings/p1")), { playerId: "p1", effort: 2, note: "war krank" });
  await setDoc(doc(db, t("events/e1/ratingValues/p1")), { playerId: "p1", attendance: "present", minutes: 60 });
  await setDoc(doc(db, t("events/e1/ratingGrades/p1")), { playerId: "p1", grade: 2, ratedAt: Timestamp.now() });
  await setDoc(doc(db, t("events/e1/privateNotes/p1")), { note: "intern" });
  await setDoc(doc(db, t("events/e1/responses/p1")), { playerId: "p1", status: "no", reason: "krank", by: "player" });
  await setDoc(doc(db, t("events/e1/responses/p2")), { playerId: "p2", status: "yes", reason: "", by: "player" });
  await setDoc(doc(db, t("gradeReleases/p1")), { playerId: "p1", publishedUntil: Timestamp.now(), expiresAt: null });
  await setDoc(doc(db, t("scoutProfiles/p1")), { playerId: "p1", name: "Spieler", entries: [] });
  await setDoc(doc(db, t("playerStats/p1")), { playerId: "p1", version: 1, events: {} });
  await setDoc(doc(db, t("playerCards/p2")), { playerId: "p2", name: "Spieler 2", consentStatus: "revoked" });
  await setDoc(doc(db, t("opponents/o1")), { name: "Gegner" });
  await setDoc(doc(db, t("invites/c1")), { role: "player", playerId: "p1", expiresAt: null });
  await setDoc(doc(db, t("learningPaths/l1")), { title: "Pfad" });
  await setDoc(doc(db, t("learningProgress/p1")), { playerId: "p1", paths: {} });
  await setDoc(doc(db, t(`notifications/${prefix}coach`)), { emailReminders: true });
  await setDoc(doc(db, t("appState/current")), { x: 1 });
  for (const name of ["lineup", "settings", "planning", "breaks", "ranking", "operations", "playerStats", "playerView"]) await setDoc(doc(db, t(`meta/${name}`)), { x: 1 });
  await setDoc(doc(db, t("meta/clubOverview")), { version: 1, playerCount: 2, consentPending: 0, consentRevoked: 1, players: [{}, {}], updatedAt: Timestamp.now() });
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "clubs/A"), { name: "Verein A", logoUrl: null });
    await setDoc(doc(db, "clubs/B"), { name: "Verein B", logoUrl: null });
    await setDoc(doc(db, "clubs/A/admins/adminA"), { uid: "adminA", role: "admin" });
    await setDoc(doc(db, "clubs/B/admins/adminB"), { uid: "adminB", role: "admin" });
    await seedTeam(db, "A1", "a", "A");
    await seedTeam(db, "B1", "b", "B");
    await seedTeam(db, "LEGACY", "l"); // Altteam ohne Team-Dokument
    await seedTeam(db, "NOCLUB", "n", null); // Team-Dokument ohne Verein
    await setDoc(doc(db, "clubInvites/TRAINERCODE2ABCD"), { kind: "trainer", clubId: "A", teamId: "A1", teamName: "Team A1", expiresAt: FAR, createdAt: Timestamp.now(), email: null, createdBy: "adminA" });
    await setDoc(doc(db, "clubInvites/TRAINERBOUND2ABC"), { kind: "trainer", clubId: "A", teamId: "A1", teamName: "Team A1", expiresAt: FAR, createdAt: Timestamp.now(), email: "neu@example.test", createdBy: "adminA" });
    await setDoc(doc(db, "clubInvites/TRAINEROLD2ABCDE"), { kind: "trainer", clubId: "A", teamId: "A1", teamName: "Team A1", expiresAt: PAST, createdAt: Timestamp.now(), email: null, createdBy: "adminA" });
    await setDoc(doc(db, "clubInvites/TRAINERBEE2ABCDE"), { kind: "trainer", clubId: "B", teamId: "B1", teamName: "Team B1", expiresAt: FAR, createdAt: Timestamp.now(), email: null, createdBy: "adminB" });
    // Fehlkonfiguriert: Code von Verein A, der auf ein Team von Verein B zeigt.
    await setDoc(doc(db, "clubInvites/TRAINERMIX2ABCDE"), { kind: "trainer", clubId: "A", teamId: "B1", teamName: "Team B1", expiresAt: FAR, createdAt: Timestamp.now(), email: null, createdBy: "adminA" });
  });
});

// Wie assertFails/assertSucceeds, nennt bei einem Fehlschlag aber den Pfad.
const denied = (label, promise) => assertFails(promise).catch((error) => { throw new Error(`${label}: ${error.message}`); });
const allowed = (label, promise) => assertSucceeds(promise).catch((error) => { throw new Error(`${label}: ${error.message}`); });

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const verified = (uid, email = `${uid}@example.test`) => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: "password" } }).firestore();
const unverified = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: false, firebase: { sign_in_provider: "password" } }).firestore();

test("1. Vereinsadmin liest im eigenen Verein wie ein Trainer mit (Einzeldokumente und Listen)", async () => {
  const db = as("adminA");
  for (const path of READABLE) await allowed(path, getDoc(doc(db, `teams/A1/${path}`)));
  for (const name of ["members", "events", "events/e1/ratingValues", "events/e1/ratingGrades", "gradeReleases", "scoutProfiles", "playerStats",
    "opponents", "players/p1/developmentPlans", "players/p1/selfReports", "learningPaths", "learningProgress"]) {
    await allowed(name, getDocs(collection(db, `teams/A1/${name}`)));
  }
  const trainers = await assertSucceeds(getDocs(query(collection(db, "teams/A1/members"), where("role", "==", "trainer"))));
  assert.deepEqual(trainers.docs.map((entry) => entry.id).sort(), ["acoach", "acoach2"]);
  // Zu-/Absagen nur ohne Grund - als Liste nur mit dem passenden Filter.
  const responses = await assertSucceeds(getDocs(query(collection(db, "teams/A1/events/e1/responses"), where("reason", "==", ""))));
  assert.deepEqual(responses.docs.map((entry) => entry.id), ["p2"]);
  await assertFails(getDocs(collection(db, "teams/A1/events/e1/responses")));
});

test("2. Keine Gesundheitsdaten, keine Rueckmeldungen/Notizen, keine Spieler-Codes - auch nicht als Liste", async () => {
  const db = as("adminA");
  for (const path of HIDDEN) await denied(path, getDoc(doc(db, `teams/A1/${path}`)));
  for (const name of ["players", "players/p1/absences", "players/p1/measurements", "players/p1/maturity", "players/p1/wellness",
    "events/e1/ratings", "events/e1/privateNotes", "invites", "playerCards", "notifications"]) {
    await denied(name, getDocs(collection(db, `teams/A1/${name}`)));
  }
  await assertFails(getDocs(query(collection(db, "teams/A1/players"), where("consentStatus", "!=", "revoked"))));
  await assertFails(getDocs(query(collection(db, "teams/A1/events/e1/responses"), where("reason", "==", "krank"))));
});

test("3. Nur lesen: der Vereinsadmin schreibt und loescht keine Teamdaten", async () => {
  const db = as("adminA");
  const writes = [
    ["players/p9", { name: "x" }], ["players/p1/absences/a9", { playerId: "p1", label: "x" }], ["events/e9", { title: "x" }],
    ["events/e1/ratings/p1", { playerId: "p1", effort: 1 }], ["events/e1/ratingValues/p1", { playerId: "p1", attendance: "present", minutes: 1, goals: 0, assists: 0 }],
    ["events/e1/ratingGrades/p1", { playerId: "p1", grade: 1, ratedAt: serverTimestamp() }], ["events/e1/responses/p1", { playerId: "p1", status: "yes", reason: "", by: "trainer", updatedAt: serverTimestamp() }],
    ["gradeReleases/p1", { playerId: "p1", publishedUntil: serverTimestamp(), expiresAt: null, createdBy: "adminA" }],
    ["scoutProfiles/p1", { playerId: "p1", name: "x", entries: [] }], ["playerStats/p1", { playerId: "p1", version: 1, events: {} }],
    ["opponents/o9", { name: "x" }], ["meta/lineup", { x: 2 }], ["meta/settings", { x: 2 }], ["meta/planning", { x: 2 }],
    ["meta/breaks", { x: 2 }], ["meta/ranking", { week: [], month: [], updatedAt: "x" }],
    ["meta/clubOverview", { version: 1, playerCount: 0, consentPending: 0, consentRevoked: 0, players: [], updatedAt: serverTimestamp() }],
    ["learningPaths/l9", { title: "x" }], ["learningProgress/p1", { playerId: "p1", paths: {}, updatedAt: serverTimestamp() }],
    ["players/p1/developmentPlans/f1", { playerId: "p1", focus: "y" }], ["invites/c9", { role: "player", playerId: "p1", expiresAt: null }]
  ];
  for (const [path, data] of writes) await assertFails(setDoc(doc(db, `teams/A1/${path}`), data));
  for (const path of ["players/p1", "events/e1", "opponents/o1", "meta/lineup", "playerStats/p1", "players/p1/absences/a1", "invites/c1", "members/aplayer", "members/aphysio", "members/ascout"]) {
    await assertFails(deleteDoc(doc(db, `teams/A1/${path}`)));
  }
  // Sich selbst oder einen Spion direkt eintragen geht nicht (nur ueber einen Code, den jemand anderes einloest).
  await assertFails(setDoc(doc(db, "teams/A1/members/adminA"), { role: "trainer", uid: "adminA", email: "adminA@example.test", createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, "teams/A1/members/spion"), { role: "physio", uid: "spion", createdAt: serverTimestamp() }));
});

test("4. Fremde Vereine, Altteams und Teams ohne Verein: nichts lesbar", async () => {
  for (const [uid, teamId] of [["adminA", "B1"], ["adminB", "A1"], ["adminA", "LEGACY"], ["adminA", "NOCLUB"]]) {
    const db = as(uid);
    const prefix = { A1: "a", B1: "b", LEGACY: "l", NOCLUB: "n" }[teamId];
    for (const path of [...READABLE, ...HIDDEN]) await denied(`${uid} ${teamId}/${path}`, getDoc(doc(db, `teams/${teamId}/${path}`)));
    for (const name of ["members", "events", "playerStats", "scoutProfiles"]) await denied(`${uid} ${teamId}/${name}`, getDocs(collection(db, `teams/${teamId}/${name}`)));
    await denied(`${uid} ${teamId} delete`, deleteDoc(doc(db, `teams/${teamId}/members/${prefix}coach2`)));
  }
});

test("5. Trainer entfernen: Vereinsadmin nur Trainer-Zugaenge im eigenen Verein", async () => {
  const db = as("adminA");
  await assertSucceeds(deleteDoc(doc(db, "teams/A1/members/acoach2")));
  for (const uid of ["aplayer", "aphysio", "ascout"]) await assertFails(deleteDoc(doc(db, `teams/A1/members/${uid}`)));
  await assertFails(deleteDoc(doc(db, "teams/B1/members/bcoach2")));
  // Andere Rollen im Team koennen keine Trainer entfernen.
  for (const uid of ["aplayer", "aphysio", "ascout", "bcoach", "fremd"]) await assertFails(deleteDoc(doc(as(uid), "teams/A1/members/acoach")));
  // Der Trainer selbst darf es weiterhin.
  await assertSucceeds(deleteDoc(doc(as("acoach"), "teams/A1/members/acoach2")));
});

test("6. Trainercode anlegen: nur Vereinsadmin, nur fuer bestehende Teams des eigenen Vereins", async () => {
  const adminA = as("adminA");
  const code = (data) => ({ kind: "trainer", clubId: "A", teamId: "A1", teamName: "Team A1", expiresAt: FAR, createdAt: serverTimestamp(), email: null, createdBy: "adminA", ...data });
  await allowed("trainer code", setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDE"), code()));
  await allowed("bound trainer code", setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDF"), code({ email: "x@example.test" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDG"), code({ teamId: "B1" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDG"), code({ teamId: "B1", clubId: "B" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDG"), code({ teamId: "LEGACY" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDG"), code({ teamId: "NOCLUB" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDG"), code({ teamId: "Neu12345678901234567" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDG"), code({ teamName: "x".repeat(101) })));
  await assertFails(setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDG"), code({ role: "admin" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDG"), code({ expiresAt: PAST })));
  await assertFails(setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDG"), code({ createdBy: "jemand" })));
  // Beitrittscodes (neues Team) duerfen keinen teamName tragen und kein bestehendes Team.
  await assertFails(setDoc(doc(adminA, "clubInvites/NEWTRAXNER2ABCDG"), code({ kind: "team" })));
  for (const uid of ["acoach", "aplayer", "adminB", "fremd"]) {
    await assertFails(setDoc(doc(as(uid), "clubInvites/NEWTRAXNER2ABCDH"), code({ createdBy: uid })));
  }
  // Zurueckziehen: nur Admins des Vereins.
  await assertFails(deleteDoc(doc(as("adminB"), "clubInvites/TRAINERCODE2ABCD")));
  await assertFails(deleteDoc(doc(as("acoach"), "clubInvites/TRAINERCODE2ABCD")));
  await assertSucceeds(deleteDoc(doc(adminA, "clubInvites/TRAINERCODE2ABCD")));
  const list = await assertSucceeds(getDocs(query(collection(adminA, "clubInvites"), where("clubId", "==", "A"))));
  assert.ok(list.docs.every((entry) => entry.data().clubId === "A"));
  await assertFails(getDocs(query(collection(adminA, "clubInvites"), where("clubId", "==", "B"))));
});

// Einloesen eines Trainercodes: eigener Trainer-Zugang + Code loeschen, in einem Schreibvorgang.
function claim(db, uid, code, { teamId = "A1", email = `${uid}@example.test`, extra = {}, deleteCode = true } = {}) {
  const batch = writeBatch(db);
  if (deleteCode) batch.delete(doc(db, `clubInvites/${code}`));
  batch.set(doc(db, `teams/${teamId}/members/${uid}`), { role: "trainer", email, uid, createdAt: serverTimestamp(), claimedInviteCode: code, ...extra });
  return batch.commit();
}

test("7. Trainercode einloesen: neuer Trainer im bestehenden Team, genau einmal", async () => {
  await assertSucceeds(claim(verified("neu"), "neu", "TRAINERCODE2ABCD"));
  await assertSucceeds(getDoc(doc(as("neu"), "teams/A1/players/p1"))); // jetzt Trainer mit vollen Rechten
  await assertFails(claim(verified("zweiter"), "zweiter", "TRAINERCODE2ABCD")); // verbraucht
});

test("8. Trainercode: nicht ohne Bestaetigung, nicht abgelaufen, nur passende E-Mail, nicht fuer fremde Teams", async () => {
  await assertFails(claim(unverified("neu"), "neu", "TRAINERCODE2ABCD"));
  await assertFails(claim(as("neu"), "neu", "TRAINERCODE2ABCD"));
  await assertFails(claim(verified("neu"), "neu", "TRAINEROLD2ABCDE"));
  await assertFails(claim(verified("anders"), "anders", "TRAINERBOUND2ABC"));
  await assertSucceeds(claim(verified("neu", "neu@example.test"), "neu", "TRAINERBOUND2ABC", { email: "neu@example.test" }));
  // Code fuer A1 in einem anderen Team einloesen - oder ein falsch angelegter Code von A fuer B1.
  await assertFails(claim(verified("neu2"), "neu2", "TRAINERBEE2ABCDE", { teamId: "A1" }));
  await assertFails(claim(verified("neu3"), "neu3", "TRAINERMIX2ABCDE", { teamId: "B1" }));
  await assertFails(claim(verified("neu4"), "neu4", "TRAINERCODE2ABCD", { teamId: "LEGACY" }));
  // Code nicht loeschen, andere Rolle, fremde E-Mail, Zusatzfelder.
  await assertFails(claim(verified("neu5"), "neu5", "TRAINERCODE2ABCD", { deleteCode: false }));
  await assertFails(claim(verified("neu5"), "neu5", "TRAINERCODE2ABCD", { extra: { role: "physio" } }));
  await assertFails(claim(verified("neu5"), "neu5", "TRAINERCODE2ABCD", { email: "jemand@example.test" }));
  await assertFails(claim(verified("neu5"), "neu5", "TRAINERCODE2ABCD", { extra: { playerId: "p1" } }));
  // Fuer ein anderes Konto einloesen.
  const neu6 = verified("neu6");
  const batch = writeBatch(neu6);
  batch.delete(doc(neu6, "clubInvites/TRAINERCODE2ABCD"));
  batch.set(doc(neu6, "teams/A1/members/opfer"), { role: "trainer", email: "neu6@example.test", uid: "opfer", createdAt: serverTimestamp(), claimedInviteCode: "TRAINERCODE2ABCD" });
  await assertFails(batch.commit());
});

test("9. Der Vereinsadmin macht sich mit dem eigenen Code nicht selbst zum Trainer", async () => {
  await assertFails(claim(verified("adminA"), "adminA", "TRAINERCODE2ABCD"));
  await assertFails(getDoc(doc(as("adminA"), "teams/A1/players/p1")));
});

test("10. Niemand macht sich zum Vereinsadmin - auch kein Trainer oder eingeladener Trainer", async () => {
  await assertSucceeds(claim(verified("neu"), "neu", "TRAINERCODE2ABCD"));
  for (const uid of ["acoach", "neu", "aplayer", "adminB"]) {
    await assertFails(setDoc(doc(verified(uid), `clubs/A/admins/${uid}`), { uid, role: "admin", createdAt: serverTimestamp() }));
    await assertFails(getDocs(collection(as(uid), "clubs/A/admins")));
  }
  // Ein Trainer kann dem Team keinen anderen Verein geben (dann waere ein anderer Admin zustaendig).
  await assertFails(updateDoc(doc(as("acoach"), "teams/A1"), { clubId: "B" }));
});

test("11. Vereinsuebersicht: schreibt nur der Trainer, nur im festen Format; Spieler/Medizin/Scout lesen sie nicht", async () => {
  const overview = (data = {}) => ({ version: 1, playerCount: 1, consentPending: 1, consentRevoked: 0, players: [{ id: "p1", name: "S", number: 7, positions: ["ST"] }], updatedAt: serverTimestamp(), ...data });
  const coach = as("acoach");
  await assertSucceeds(setDoc(doc(coach, "teams/A1/meta/clubOverview"), overview()));
  await assertFails(setDoc(doc(coach, "teams/A1/meta/clubOverview"), overview({ status: "Verletzt" })));
  await assertFails(setDoc(doc(coach, "teams/A1/meta/clubOverview"), overview({ playerCount: 2 })));
  await assertFails(setDoc(doc(coach, "teams/A1/meta/clubOverview"), overview({ updatedAt: Timestamp.now() })));
  await assertFails(setDoc(doc(coach, "teams/A1/meta/clubOverview"), overview({ consentPending: "1" })));
  for (const uid of ["aplayer", "aphysio", "ascout", "bcoach", "adminB"]) await assertFails(getDoc(doc(as(uid), "teams/A1/meta/clubOverview")));
  for (const uid of ["aplayer", "aphysio", "ascout", "adminA"]) await assertFails(setDoc(doc(as(uid), "teams/A1/meta/clubOverview"), overview()));
  await assertSucceeds(getDoc(doc(as("adminA"), "teams/A1/meta/clubOverview")));
});
