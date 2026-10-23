// Emulator-Tests: mehrere Vereine (SCRUM-180). Zwei Vereine A und B mit je einem Team (A1, B1), dazu ein
// Altteam ohne Team-Dokument (wie mein-team/U15/U17/U14 vor dem Skriptlauf), ein Team ohne Verein und ein
// neues Team ohne Trainer. Starten: siehe tests/rules/README.md. Nur erfundene Testdaten im Emulator.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, collectionGroup, doc, getDoc, getDocs, query, setDoc, deleteDoc, updateDoc, where, writeBatch, serverTimestamp, deleteField } from "firebase/firestore";
import { planAssignment } from "../../scripts/assign-clubs-lib.mjs";

const NEW_TEAM = "Abcdefghij0123456789"; // zufaellige 20-stellige ID wie bei neuen Teams
const NEW_TEAM_B = "Zyxwvutsrq9876543210";
const LEGACY = "LEGACY"; // Altteam ohne Team-Dokument und ohne uid-Felder
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-clubs",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

// Alle Pfade, unter denen ein Team Daten hat (inkl. Gesundheitsdaten, Noten, Notizen, Zugaenge).
// Ausnahme (unveraendert seit SCRUM-77, bewusst): einen Einladungscode, den man KENNT, darf jeder Angemeldete
// gezielt abrufen - sonst koennte sich ein neuer Spieler nicht anmelden. Auflisten bleibt Trainern vorbehalten
// (siehe Test 1). Thema fuer SCRUM-181, Architektur-Notiz Abschnitt 6/8.
const teamPaths = (prefix) => [
  "players/p1", "players/p1/developmentPlans/f1", "players/p1/absences/a1", "players/p1/measurements/m1",
  "events/e1", "events/e1/ratings/p1", "events/e1/privateNotes/p1", "events/e1/responses/p1",
  "scoutProfiles/p1", "playerStats/p1", "opponents/o1",
  "meta/lineup", "meta/settings", "meta/planning", "meta/breaks", "meta/operations", "meta/playerStats",
  `notifications/${prefix}coach`
];
const withInvite = (prefix) => [...teamPaths(prefix), "invites/c1"];

async function seedTeam(db, teamId, prefix, { withUid = true } = {}) {
  const t = (path) => `teams/${teamId}/${path}`;
  const members = {
    [`${prefix}coach`]: { role: "trainer", email: `${prefix}coach@example.test` },
    [`${prefix}player`]: { role: "player", playerId: "p1", expiresAt: null },
    [`${prefix}parent`]: { role: "parent", playerId: "p1", expiresAt: null },
    [`${prefix}physio`]: { role: "physio", email: `${prefix}physio@example.test` },
    [`${prefix}scout`]: { role: "scout", email: `${prefix}scout@example.test` }
  };
  for (const [uid, data] of Object.entries(members)) await setDoc(doc(db, t(`members/${uid}`)), withUid ? { ...data, uid } : data);
  await setDoc(doc(db, t("players/p1")), { name: "Spieler" });
  await setDoc(doc(db, t("players/p1/developmentPlans/f1")), { playerId: "p1", focus: "x" });
  await setDoc(doc(db, t("players/p1/absences/a1")), { playerId: "p1", label: "krank" });
  await setDoc(doc(db, t("players/p1/measurements/m1")), { playerId: "p1", value: 1 });
  await setDoc(doc(db, t("events/e1")), { title: "Training" });
  await setDoc(doc(db, t("events/e1/ratings/p1")), { playerId: "p1", effort: 2 });
  await setDoc(doc(db, t("events/e1/privateNotes/p1")), { note: "intern" });
  await setDoc(doc(db, t("events/e1/responses/p1")), { playerId: "p1", status: "no", reason: "krank", by: "player" });
  await setDoc(doc(db, t("scoutProfiles/p1")), { playerId: "p1", name: "Spieler", entries: [] });
  await setDoc(doc(db, t("playerStats/p1")), { playerId: "p1", version: 1, events: {} });
  await setDoc(doc(db, t("opponents/o1")), { name: "Gegner" });
  await setDoc(doc(db, t("invites/c1")), { role: "player", playerId: "p1", expiresAt: null });
  for (const name of ["lineup", "settings", "planning", "breaks", "operations", "playerStats"]) await setDoc(doc(db, t(`meta/${name}`)), { x: 1 });
  await setDoc(doc(db, t(`notifications/${prefix}coach`)), { emailReminders: true });
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "clubs/A"), { name: "Verein A", logoUrl: null });
    await setDoc(doc(db, "clubs/B"), { name: "Verein B", logoUrl: null });
    await setDoc(doc(db, "clubs/A/admins/adminA"), { uid: "adminA", role: "admin" });
    await setDoc(doc(db, "clubs/B/admins/adminB"), { uid: "adminB", role: "admin" });
    await setDoc(doc(db, "teams/A1"), { clubId: "A", name: "Verein A U14", label: "U14", hasTrainer: true });
    await setDoc(doc(db, "teams/B1"), { clubId: "B", name: "Verein B U14", label: "U14", hasTrainer: true });
    await seedTeam(db, "A1", "a");
    await seedTeam(db, "B1", "b");
    await seedTeam(db, LEGACY, "l", { withUid: false });
    await setDoc(doc(db, `teams/${NEW_TEAM}`), { clubId: "A", name: "Verein A U9", label: "U9", hasTrainer: false });
    await setDoc(doc(db, `teams/${NEW_TEAM_B}`), { clubId: "B", name: "Verein B U9", label: "U9", hasTrainer: false });
    // Team mit Dokument, aber ohne Verein (z.B. von Hand angelegt).
    await setDoc(doc(db, "teams/NOCLUB"), { name: "ohne Verein" });
    await setDoc(doc(db, "teams/NOCLUB/members/ncoach"), { role: "trainer", uid: "ncoach" });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const A_MEMBERS = ["acoach", "aplayer", "aparent", "aphysio", "ascout"];

test("1. Mitglieder von Verein A (alle Rollen) lesen und schreiben nichts in Verein B", async () => {
  for (const uid of A_MEMBERS) {
    const db = as(uid);
    await assertFails(getDoc(doc(db, "teams/B1")));
    await assertFails(updateDoc(doc(db, "teams/B1"), { name: "gekapert" }));
    for (const path of [...teamPaths("b"), "members/bcoach", "members/bplayer"]) {
      await assertFails(getDoc(doc(db, `teams/B1/${path}`)));
    }
    for (const path of ["players/p1", "players/p9", "events/e9", "events/e1/ratings/p1", "players/p1/absences/a9", "opponents/o9", "meta/settings", "invites/c9"]) {
      await assertFails(setDoc(doc(db, `teams/B1/${path}`), { playerId: "p1", name: "x" }));
    }
    await assertFails(deleteDoc(doc(db, "teams/B1/players/p1")));
    await assertFails(setDoc(doc(db, `teams/B1/members/${uid}`), { role: "trainer", uid }));
    for (const name of ["members", "invites", "players", "events/e1/ratings"]) await assertFails(getDocs(collection(db, `teams/B1/${name}`)));
    await assertFails(getDocs(query(collection(db, "teams"), where("clubId", "==", "B"))));
  }
});

test("2. Vereinsadmin A erreicht in Verein B nichts", async () => {
  const db = as("adminA");
  await assertFails(getDoc(doc(db, "teams/B1")));
  await assertFails(getDocs(query(collection(db, "teams"), where("clubId", "==", "B"))));
  await assertFails(setDoc(doc(db, "teams/Qwertzuiop1234567890"), { clubId: "B", name: "x", label: "", hasTrainer: false, createdAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "clubs/B"), { name: "gekapert" }));
  await assertFails(setDoc(doc(db, "clubs/B/admins/adminA"), { uid: "adminA", role: "admin", createdAt: serverTimestamp() }));
  await assertFails(getDocs(collection(db, "clubs/B/admins")));
  await assertFails(getDoc(doc(db, "clubs/B/admins/adminB")));
  // Ersten Trainer im Team von B einsetzen (B hat dort noch keinen) - verboten.
  const batch = writeBatch(db);
  batch.update(doc(db, `teams/${NEW_TEAM_B}`), { hasTrainer: true, firstTrainerUid: "adminA" });
  batch.set(doc(db, `teams/${NEW_TEAM_B}/members/adminA`), { role: "trainer", uid: "adminA", createdAt: serverTimestamp() });
  await assertFails(batch.commit());
  for (const path of teamPaths("b")) await assertFails(getDoc(doc(db, `teams/B1/${path}`)));
});

test("3. Vereinsadmin ohne Teammitgliedschaft sieht keine Spieler-, Noten- oder Gesundheitsdaten des eigenen Vereins", async () => {
  const db = as("adminA");
  for (const path of [...teamPaths("a"), "members/acoach", "members/aplayer"]) await assertFails(getDoc(doc(db, `teams/A1/${path}`)));
  for (const name of ["members", "invites", "players", "events", "players/p1/absences", "players/p1/measurements", "events/e1/ratings", "scoutProfiles", "playerStats"]) {
    await assertFails(getDocs(collection(db, `teams/A1/${name}`)));
  }
  await assertFails(getDocs(query(collection(db, "teams/A1/events/e1/ratings"), where("playerId", "==", "p1"))));
  await assertFails(setDoc(doc(db, "teams/A1/players/p9"), { name: "x" }));
  await assertFails(setDoc(doc(db, "teams/A1/invites/c9"), { role: "player", playerId: "p1", expiresAt: null }));
  // Weitere Trainer/Scouts im besetzten Team anlegen geht nur fuer Trainer, nicht fuer den Vereinsadmin.
  await assertFails(setDoc(doc(db, "teams/A1/members/adminA"), { role: "trainer", uid: "adminA", createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, "teams/A1/members/spion"), { role: "scout", uid: "spion" }));
  // Verwaltung ist erlaubt: Team-Dokumente des eigenen Vereins lesen und auflisten, Name aendern.
  await assertSucceeds(getDoc(doc(db, "teams/A1")));
  const list = await assertSucceeds(getDocs(query(collection(db, "teams"), where("clubId", "==", "A"))));
  assert.deepEqual(list.docs.map((entry) => entry.id).sort(), ["A1", NEW_TEAM].sort());
  await assertFails(getDocs(collection(db, "teams")));
  await assertSucceeds(updateDoc(doc(db, "teams/A1"), { name: "Verein A U14 neu" }));
});

test("4. Teamsuche: nur eigene Mitgliedschaften, nie fremde (mit E-Mail-Adressen)", async () => {
  const db = as("acoach");
  const mine = await assertSucceeds(getDocs(query(collectionGroup(db, "members"), where("uid", "==", "acoach"))));
  assert.deepEqual(mine.docs.map((entry) => entry.ref.path), ["teams/A1/members/acoach"]);
  await assertFails(getDocs(collectionGroup(db, "members")));
  await assertFails(getDocs(query(collectionGroup(db, "members"), where("uid", "==", "bcoach"))));
  await assertFails(getDocs(query(collectionGroup(db, "members"), where("role", "==", "trainer"))));
  await assertFails(getDoc(doc(db, "teams/B1/members/bcoach")));
  // Jemand, der in mehreren Vereinen Mitglied ist, findet beide Teams.
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "teams/B1/members/acoach"), { role: "parent", playerId: "p1", uid: "acoach" }));
  const both = await assertSucceeds(getDocs(query(collectionGroup(db, "members"), where("uid", "==", "acoach"))));
  assert.deepEqual(both.docs.map((entry) => entry.ref.path).sort(), ["teams/A1/members/acoach", "teams/B1/members/acoach"]);
  // Ein frisch (anonym) angemeldetes Konto findet nichts, aber die Abfrage ist erlaubt.
  const none = await assertSucceeds(getDocs(query(collectionGroup(as("anon"), "members"), where("uid", "==", "anon"))));
  assert.equal(none.size, 0);
  await assertFails(getDocs(query(collectionGroup(as(null), "members"), where("uid", "==", "acoach"))));
  // Vereinssuche fuer Admins: gleiche Absicherung.
  const clubs = await assertSucceeds(getDocs(query(collectionGroup(as("adminA"), "admins"), where("uid", "==", "adminA"))));
  assert.deepEqual(clubs.docs.map((entry) => entry.ref.path), ["clubs/A/admins/adminA"]);
  await assertFails(getDocs(collectionGroup(as("adminA"), "admins")));
  await assertFails(getDocs(query(collectionGroup(as("adminA"), "admins"), where("uid", "==", "adminB"))));
});

test("4b. uid-Feld muss beim Anlegen der Dokument-ID entsprechen (sonst taeuchte es in fremder Teamsuche auf)", async () => {
  const db = as("acoach");
  await assertFails(setDoc(doc(db, "teams/A1/members/neuerScout"), { role: "scout", email: "x@example.test", uid: "bcoach" }));
  await assertSucceeds(setDoc(doc(db, "teams/A1/members/neuerScout"), { role: "scout", email: "x@example.test", uid: "neuerScout" }));
  await assertSucceeds(setDoc(doc(db, "teams/A1/members/neuerTrainer"), { role: "trainer", email: "y@example.test" }));
  // Spieler loest Einladung mit fremder uid ein - verboten; mit eigener uid erlaubt.
  const claim = (uid, data) => {
    const user = as(uid);
    const batch = writeBatch(user);
    batch.set(doc(user, `teams/A1/members/${uid}`), { role: "player", playerId: "p1", claimedInviteCode: "c1", expiresAt: null, createdAt: serverTimestamp(), ...data });
    batch.delete(doc(user, "teams/A1/invites/c1"));
    return batch.commit();
  };
  await assertFails(claim("neu1", { uid: "acoach" }));
  await assertSucceeds(claim("neu1", { uid: "neu1" }));
});

test("5. clubId ist unveraenderlich, Team-Dokument nur fuer Mitglieder und eigene Admins", async () => {
  for (const uid of ["acoach", "adminA", "adminB", "bcoach"]) {
    await assertFails(updateDoc(doc(as(uid), "teams/A1"), { clubId: "B" }));
    await assertFails(updateDoc(doc(as(uid), "teams/A1"), { clubId: deleteField() }));
  }
  await assertSucceeds(updateDoc(doc(as("acoach"), "teams/A1"), { name: "Neuer Name", label: "U15" }));
  await assertFails(updateDoc(doc(as("acoach"), "teams/A1"), { geheim: "x" }));
  await assertFails(updateDoc(doc(as("aplayer"), "teams/A1"), { name: "x" }));
  for (const uid of A_MEMBERS) await assertSucceeds(getDoc(doc(as(uid), "teams/A1")));
  for (const uid of ["bcoach", "fremd", "adminB", null]) await assertFails(getDoc(doc(as(uid), "teams/A1")));
  for (const uid of ["acoach", "adminA"]) await assertFails(deleteDoc(doc(as(uid), "teams/A1")));
  // Team ohne Verein: niemand kann es nachtraeglich einem Verein zuordnen.
  await assertFails(updateDoc(doc(as("ncoach"), "teams/NOCLUB"), { clubId: "A" }));
  await assertFails(updateDoc(doc(as("adminA"), "teams/NOCLUB"), { clubId: "A" }));
  await assertSucceeds(updateDoc(doc(as("ncoach"), "teams/NOCLUB"), { name: "Umbenannt" }));
});

test("5b. Altteams ohne Team-Dokument kann niemand fuer einen Verein beanspruchen; neue Teams nur mit Zufalls-ID im eigenen Verein", async () => {
  const team = (data) => ({ name: "x", label: "", hasTrainer: false, createdAt: serverTimestamp(), ...data });
  for (const uid of ["adminA", "lcoach"]) {
    await assertFails(setDoc(doc(as(uid), `teams/${LEGACY}`), team({ clubId: "A" })));
  }
  await assertFails(setDoc(doc(as("adminA"), "teams/mein-team"), team({ clubId: "A" })));
  await assertFails(setDoc(doc(as("adminA"), "teams/Neu12345678901234567"), team({ clubId: "A", hasTrainer: true })));
  await assertFails(setDoc(doc(as("adminA"), "teams/Neu12345678901234567"), team({ clubId: "A", firstTrainerUid: "adminA" })));
  await assertFails(setDoc(doc(as("fremd"), "teams/Neu12345678901234567"), team({ clubId: "A" })));
  await assertSucceeds(setDoc(doc(as("adminA"), "teams/Neu12345678901234567"), team({ clubId: "A" })));
  await assertFails(setDoc(doc(as("adminA"), `teams/${NEW_TEAM}`), team({ clubId: "A" }))); // existiert: kein Ueberschreiben
});

test("6. Vereinsdokument: Name/Logo fuer Angemeldete lesbar, nicht auflistbar, nur eigene Admins aendern nur Name/Logo", async () => {
  for (const uid of ["acoach", "bplayer", "anon", "adminB"]) await assertSucceeds(getDoc(doc(as(uid), "clubs/A")));
  await assertFails(getDoc(doc(as(null), "clubs/A")));
  await assertFails(getDocs(collection(as("adminA"), "clubs")));
  await assertSucceeds(updateDoc(doc(as("adminA"), "clubs/A"), { name: "Verein A e.V.", logoUrl: "https://example.test/logo.png" }));
  await assertFails(updateDoc(doc(as("adminA"), "clubs/A"), { name: "" }));
  await assertFails(updateDoc(doc(as("adminA"), "clubs/A"), { plan: "pro" }));
  await assertFails(updateDoc(doc(as("adminA"), "clubs/A"), { logoUrl: 42 }));
  for (const uid of ["acoach", "adminB", "fremd"]) await assertFails(updateDoc(doc(as(uid), "clubs/A"), { name: "x" }));
  for (const uid of ["adminA", "fremd"]) {
    await assertFails(setDoc(doc(as(uid), "clubs/C"), { name: "Neu" }));
    await assertFails(deleteDoc(doc(as(uid), "clubs/A")));
  }
});

test("7. Erster Trainer: Vereinsadmin setzt genau einen ein, nur solange das Team keinen hat", async () => {
  const db = as("adminA");
  const firstTrainer = (teamId, uid, { flag = true, firstUid = uid, role = "trainer", extra = {} } = {}) => {
    const batch = writeBatch(db);
    if (flag) batch.update(doc(db, `teams/${teamId}`), { hasTrainer: true, firstTrainerUid: firstUid });
    batch.set(doc(db, `teams/${teamId}/members/${uid}`), { role, email: `${uid}@example.test`, uid, createdAt: serverTimestamp(), ...extra });
    return batch.commit();
  };
  // Ohne gleichzeitiges Setzen von hasTrainer, mit falscher Rolle, fremder uid oder Zusatzfeldern: nein.
  await assertFails(firstTrainer(NEW_TEAM, "t1", { flag: false }));
  await assertFails(firstTrainer(NEW_TEAM, "t1", { firstUid: "t2" }));
  await assertFails(firstTrainer(NEW_TEAM, "t1", { role: "scout" }));
  await assertFails(firstTrainer(NEW_TEAM, "t1", { extra: { playerId: "p1" } }));
  // hasTrainer allein umschalten (ohne Trainer anzulegen) geht nicht.
  await assertFails(updateDoc(doc(db, `teams/${NEW_TEAM}`), { hasTrainer: true, firstTrainerUid: "t1" }));
  // Nicht-Admins (auch Mitglieder anderer Teams) duerfen das nicht.
  const other = as("acoach");
  const batch = writeBatch(other);
  batch.update(doc(other, `teams/${NEW_TEAM}`), { hasTrainer: true, firstTrainerUid: "acoach" });
  batch.set(doc(other, `teams/${NEW_TEAM}/members/acoach`), { role: "trainer", uid: "acoach", createdAt: serverTimestamp() });
  await assertFails(batch.commit());
  // Richtig: genau einmal.
  await assertSucceeds(firstTrainer(NEW_TEAM, "t1"));
  await assertSucceeds(getDoc(doc(as("t1"), `teams/${NEW_TEAM}`)));
  await assertFails(firstTrainer(NEW_TEAM, "t2"));
  await assertFails(setDoc(doc(db, `teams/${NEW_TEAM}/members/adminA`), { role: "trainer", uid: "adminA", createdAt: serverTimestamp() }));
  // Auch der neue Trainer kann das Team nicht wieder auf "ohne Trainer" setzen (sonst haette der Admin einen zweiten Weg).
  await assertFails(updateDoc(doc(as("t1"), `teams/${NEW_TEAM}`), { hasTrainer: false }));
  await assertFails(updateDoc(doc(db, `teams/${NEW_TEAM}`), { hasTrainer: false, firstTrainerUid: "adminA" }));
  // Besetzte Teams, Altteams ohne Dokument und Teams ohne hasTrainer-Feld: nie.
  await assertFails(firstTrainer("A1", "adminA"));
  await assertFails(firstTrainer(LEGACY, "adminA"));
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "teams/OHNEFLAG"), { clubId: "A", name: "x" }));
  await assertFails(firstTrainer("OHNEFLAG", "adminA"));
});

test("8. Niemand macht sich selbst zum Vereinsadmin; Admins ernennen Admins nur im eigenen Verein", async () => {
  const admin = (uid, data = {}) => ({ uid, role: "admin", createdAt: serverTimestamp(), ...data });
  for (const uid of ["fremd", "acoach", "adminB"]) await assertFails(setDoc(doc(as(uid), `clubs/A/admins/${uid}`), admin(uid)));
  await assertFails(setDoc(doc(as("adminA"), "clubs/A/admins/neu"), admin("andere")));
  await assertFails(setDoc(doc(as("adminA"), "clubs/A/admins/neu"), admin("neu", { role: "owner" })));
  await assertSucceeds(setDoc(doc(as("adminA"), "clubs/A/admins/neu"), admin("neu")));
  await assertFails(updateDoc(doc(as("adminA"), "clubs/A/admins/neu"), { role: "admin" }));
  await assertFails(deleteDoc(doc(as("adminA"), "clubs/A/admins/adminA")));
  await assertSucceeds(deleteDoc(doc(as("adminA"), "clubs/A/admins/neu")));
  await assertSucceeds(getDoc(doc(as("adminA"), "clubs/A/admins/adminA")));
  await assertSucceeds(getDocs(collection(as("adminA"), "clubs/A/admins")));
  await assertFails(getDocs(collection(as("acoach"), "clubs/A/admins")));
});

test("9. Rueckwaertskompatibel: Altteam ohne Team-Dokument, ohne clubId und ohne uid-Felder funktioniert wie bisher", async () => {
  const t = (path) => `teams/${LEGACY}/${path}`;
  for (const path of withInvite("l")) await assertSucceeds(getDoc(doc(as("lcoach"), t(path))));
  await assertSucceeds(getDoc(doc(as("lcoach"), `teams/${LEGACY}`))); // existiert nicht, Lesen trotzdem erlaubt
  await assertSucceeds(getDocs(collection(as("lcoach"), t("members"))));
  await assertSucceeds(setDoc(doc(as("lcoach"), t("players/p2")), { name: "neu" }));
  await assertSucceeds(setDoc(doc(as("lcoach"), t("members/neuScout")), { role: "scout", email: "s@example.test", createdAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(as("lplayer"), t("players/p1"))));
  await assertSucceeds(getDocs(query(collection(as("lplayer"), t("events/e1/ratings")), where("playerId", "==", "p1"))));
  await assertFails(getDoc(doc(as("lplayer"), t("events/e1/privateNotes/p1"))));
  await assertSucceeds(getDoc(doc(as("lphysio"), t("players/p1/absences/a1"))));
  await assertFails(getDoc(doc(as("lscout"), t("players/p1/absences/a1"))));
  // Einladung einloesen wie heute (ohne uid-Feld).
  const db = as("neuSpieler");
  const batch = writeBatch(db);
  batch.set(doc(db, t("members/neuSpieler")), { role: "player", playerId: "p1", claimedInviteCode: "c1", expiresAt: null, createdAt: serverTimestamp() });
  batch.delete(doc(db, t("invites/c1")));
  await assertSucceeds(batch.commit());
  // Ohne uid-Feld taucht das Altteam (noch) nicht in der Teamsuche auf - erst nach dem Skriptlauf.
  const found = await assertSucceeds(getDocs(query(collectionGroup(as("lcoach"), "members"), where("uid", "==", "lcoach"))));
  assert.equal(found.size, 0);
  // Kein Vereinsadmin erreicht das Altteam.
  for (const path of teamPaths("l")) await assertFails(getDoc(doc(as("adminA"), t(path))));
});

test("10. Einmal-Skript: Zuordnung schreibt nur Ergaenzungen, danach findet die Teamsuche das Team, alle Rechte bleiben", async () => {
  const clubs = { A: { name: "Verein A" } };
  const teams = { [LEGACY]: { clubId: "A", name: "Verein A Alt", label: "Alt" } };
  const readState = async () => {
    let state;
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const team = await getDoc(doc(db, `teams/${LEGACY}`));
      const members = (await getDocs(collection(db, `teams/${LEGACY}/members`))).docs.map((entry) => ({ id: entry.id, data: entry.data() }));
      const club = await getDoc(doc(db, "clubs/A"));
      const admin = await getDoc(doc(db, "clubs/A/admins/adminA"));
      state = { clubs: { A: club.exists() ? club.data() : null }, admins: { "A/adminA": admin.exists() }, teams: { [LEGACY]: { data: team.exists() ? team.data() : null, hasContent: members.length > 0, members } } };
    });
    return state;
  };
  const plan = planAssignment({ adminUid: "adminA", state: await readState(), timestamp: serverTimestamp(), clubs, teams });
  assert.deepEqual(plan.errors, []);
  // Verein und Admin existieren schon -> unveraendert; Team-Dokument + 5 uid-Felder.
  assert.deepEqual(plan.writes.map((entry) => entry.path).sort(), [`teams/${LEGACY}`, ...["lcoach", "lparent", "lphysio", "lplayer", "lscout"].map((uid) => `teams/${LEGACY}/members/${uid}`)].sort());
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const { path, data } of plan.writes) await setDoc(doc(ctx.firestore(), path), data, { merge: true });
  });
  // Rollen und Rechte unveraendert, Teamsuche findet das Team, Admin sieht Team-Dokument, aber keine Spielerdaten.
  const coachDoc = await assertSucceeds(getDoc(doc(as("lcoach"), `teams/${LEGACY}/members/lcoach`)));
  assert.deepEqual(coachDoc.data(), { role: "trainer", email: "lcoach@example.test", uid: "lcoach" });
  const found = await assertSucceeds(getDocs(query(collectionGroup(as("lcoach"), "members"), where("uid", "==", "lcoach"))));
  assert.deepEqual(found.docs.map((entry) => entry.ref.path), [`teams/${LEGACY}/members/lcoach`]);
  const teamDoc = await assertSucceeds(getDoc(doc(as("adminA"), `teams/${LEGACY}`)));
  assert.equal(teamDoc.data().clubId, "A");
  assert.equal(teamDoc.data().hasTrainer, true);
  for (const path of teamPaths("l")) {
    await assertSucceeds(getDoc(doc(as("lcoach"), `teams/${LEGACY}/${path}`)));
    await assertFails(getDoc(doc(as("adminA"), `teams/${LEGACY}/${path}`)));
  }
  await assertSucceeds(getDoc(doc(as("lplayer"), `teams/${LEGACY}/players/p1`)));
  // Bestehendes Team ist "besetzt": kein erster Trainer durch den Admin.
  const db = as("adminA");
  const batch = writeBatch(db);
  batch.update(doc(db, `teams/${LEGACY}`), { hasTrainer: true, firstTrainerUid: "adminA" });
  batch.set(doc(db, `teams/${LEGACY}/members/adminA`), { role: "trainer", uid: "adminA", createdAt: serverTimestamp() });
  await assertFails(batch.commit());
  // Zweiter Lauf: nichts mehr zu tun.
  const again = planAssignment({ adminUid: "adminA", state: await readState(), timestamp: serverTimestamp(), clubs, teams });
  assert.deepEqual(again.writes, []);
});
