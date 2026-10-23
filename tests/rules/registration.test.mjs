// Emulator-Tests: Registrierung nur mit Einladung (SCRUM-181). Ein Vereinscode (vom PO per Skript angelegt) erlaubt
// genau einmal: neuen Verein + sich selbst als Vereinsadmin + erstes Team + sich selbst als dessen Trainer - in einem
// Schreibvorgang, der den Code loescht. Ein Beitrittscode (vom Vereinsadmin) erlaubt ein neues Team im bestehenden
// Verein, ohne Adminrechte. Starten: siehe tests/rules/README.md. Nur erfundene Testdaten im Emulator.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { parseArgs, planInvite } from "../../scripts/club-invite-lib.mjs";
import { Timestamp, collection, collectionGroup, doc, getDoc, getDocs, query, setDoc, deleteDoc, updateDoc, where, writeBatch, serverTimestamp } from "firebase/firestore";

const NEW_CLUB = "Club0000000000000001"; // im Vereinscode festgelegte Zufalls-IDs
const NEW_TEAM = "Team0000000000000001";
const JOIN_TEAM = "Team0000000000000002";
const OTHER_TEAM = "Team0000000000000003";
const FAR = Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000);
const PAST = Timestamp.fromMillis(Date.now() - 60 * 1000);
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-registration",
    firestore: { rules: readFileSync(process.env.RULES_FILE || new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env.cleanup(); });

const clubInvite = (extra = {}) => ({ kind: "club", clubId: NEW_CLUB, teamId: NEW_TEAM, expiresAt: FAR, createdAt: Timestamp.now(), email: null, ...extra });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "clubs/A"), { name: "Verein A", logoUrl: null });
    await setDoc(doc(db, "clubs/A/admins/adminA"), { uid: "adminA", role: "admin" });
    await setDoc(doc(db, "clubs/B"), { name: "Verein B", logoUrl: null });
    await setDoc(doc(db, "clubs/B/admins/adminB"), { uid: "adminB", role: "admin" });
    await setDoc(doc(db, "teams/A1"), { clubId: "A", name: "Verein A U14", label: "U14", hasTrainer: true });
    await setDoc(doc(db, "teams/A1/members/acoach"), { role: "trainer", email: "acoach@example.test", uid: "acoach" });
    await setDoc(doc(db, "teams/A1/members/aplayer"), { role: "player", playerId: "p1", uid: "aplayer", expiresAt: null });
    await setDoc(doc(db, "teams/A1/players/p1"), { name: "Spieler A" });
    await setDoc(doc(db, "teams/A1/players/p1/absences/a1"), { playerId: "p1", label: "krank" });
    await setDoc(doc(db, "teams/A1/events/e1/ratings/p1"), { playerId: "p1", effort: 2 });
    await setDoc(doc(db, `teams/${OTHER_TEAM}`), { clubId: "A", name: "Verein A U9", label: "U9", hasTrainer: true });
    await setDoc(doc(db, "teams/LEGACY/members/lcoach"), { role: "trainer" });
    await setDoc(doc(db, "clubInvites/CLUBCODE2345ABCD"), clubInvite());
    await setDoc(doc(db, "clubInvites/BOUNDCODE345ABCD"), clubInvite({ email: "boss@example.test" }));
    await setDoc(doc(db, "clubInvites/EXPIREDCODE5ABCD"), clubInvite({ expiresAt: PAST }));
    // Fehlkonfigurierte Codes, die auf BESTEHENDES zeigen: duerfen nichts bewirken.
    await setDoc(doc(db, "clubInvites/EXISTINGCLUBABCD"), clubInvite({ clubId: "A" }));
    await setDoc(doc(db, "clubInvites/EXISTINGTEAMABCD"), clubInvite({ teamId: OTHER_TEAM }));
    await setDoc(doc(db, "clubInvites/JOINCODE2345ABCD"), { kind: "team", clubId: "A", teamId: JOIN_TEAM, expiresAt: FAR, createdAt: Timestamp.now(), email: null, createdBy: "adminA" });
  });
});

// Kontoarten: bestaetigte E-Mail (darf einloesen), unbestaetigt, anonym, abgemeldet.
const verified = (uid, email = `${uid}@example.test`) => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: "password" } }).firestore();
const unverified = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: false, firebase: { sign_in_provider: "password" } }).firestore();
const anonymous = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

/**
 * Schreibvorgang der App (angular/src/app/core/registration/registration.ts) fuer einen Vereinscode. `skip`/`tweak`
 * erlauben, einzelne Teile wegzulassen oder zu verfaelschen.
 */
function clubBatch(db, uid, code, { email = `${uid}@example.test`, clubId = NEW_CLUB, teamId = NEW_TEAM, skip = [], tweak = {} } = {}) {
  const batch = writeBatch(db);
  if (!skip.includes("invite")) batch.delete(doc(db, `clubInvites/${code}`));
  if (!skip.includes("club")) batch.set(doc(db, `clubs/${clubId}`), { name: "Neuer Verein", logoUrl: null, createdAt: serverTimestamp(), ...tweak.club });
  if (!skip.includes("admin")) batch.set(doc(db, `clubs/${clubId}/admins/${uid}`), { uid, role: "admin", createdAt: serverTimestamp(), inviteCode: code, ...tweak.admin });
  if (!skip.includes("team")) batch.set(doc(db, `teams/${teamId}`), { clubId, name: "Neuer Verein U11", label: "U11", hasTrainer: true, firstTrainerUid: uid, createdAt: serverTimestamp(), ...tweak.team });
  if (!skip.includes("member")) batch.set(doc(db, `teams/${teamId}/members/${uid}`), { role: "trainer", email, uid, createdAt: serverTimestamp(), claimedInviteCode: code, ...tweak.member });
  return batch.commit();
}

function joinBatch(db, uid, code, { email = `${uid}@example.test`, clubId = "A", teamId = JOIN_TEAM, skip = [], tweak = {} } = {}) {
  const batch = writeBatch(db);
  if (!skip.includes("invite")) batch.delete(doc(db, `clubInvites/${code}`));
  if (!skip.includes("team")) batch.set(doc(db, `teams/${teamId}`), { clubId, name: "Verein A U11", label: "U11", hasTrainer: true, firstTrainerUid: uid, createdAt: serverTimestamp(), ...tweak.team });
  if (!skip.includes("member")) batch.set(doc(db, `teams/${teamId}/members/${uid}`), { role: "trainer", email, uid, createdAt: serverTimestamp(), claimedInviteCode: code, ...tweak.member });
  return batch.commit();
}

async function inviteExists(code) {
  let found = false;
  await env.withSecurityRulesDisabled(async (ctx) => {
    found = (await getDoc(doc(ctx.firestore(), `clubInvites/${code}`))).exists();
  });
  return found;
}

test("R1. Vereinscode: neuer Trainer legt Verein, Adminrolle, erstes Team und Trainer-Zugang in einem Schritt an", async () => {
  const db = verified("newcoach");
  await assertSucceeds(clubBatch(db, "newcoach", "CLUBCODE2345ABCD"));
  if (await inviteExists("CLUBCODE2345ABCD")) throw new Error("Code wurde nicht verbraucht");
  // Danach: Teamsuche findet das neue Team, Team-Dokument lesbar, Trainerrechte im eigenen Team, Admin des eigenen Vereins.
  const found = await assertSucceeds(getDocs(query(collectionGroup(db, "members"), where("uid", "==", "newcoach"))));
  if (found.docs.map((entry) => entry.ref.parent.parent.id).join() !== NEW_TEAM) throw new Error("Teamsuche falsch");
  await assertSucceeds(getDoc(doc(db, `teams/${NEW_TEAM}`)));
  await assertSucceeds(setDoc(doc(db, `teams/${NEW_TEAM}/players/p1`), { name: "Erster Spieler" }));
  await assertSucceeds(setDoc(doc(db, `teams/${NEW_TEAM}/events/e1`), { title: "Erstes Training" }));
  await assertSucceeds(updateDoc(doc(db, `clubs/${NEW_CLUB}`), { name: "Umbenannt" }));
  await assertSucceeds(getDocs(query(collection(db, "teams"), where("clubId", "==", NEW_CLUB))));
  // Erster Trainer laesst sich nicht noch einmal einsetzen (hasTrainer bleibt true).
  await assertFails(updateDoc(doc(db, `teams/${NEW_TEAM}`), { hasTrainer: false }));
});

test("R2. Derselbe Code ein zweites Mal (anderes oder gleiches Konto): verweigert", async () => {
  await assertSucceeds(clubBatch(verified("first"), "first", "CLUBCODE2345ABCD"));
  await assertFails(clubBatch(verified("second"), "second", "CLUBCODE2345ABCD"));
  await assertFails(clubBatch(verified("first"), "first", "CLUBCODE2345ABCD", { clubId: "Club0000000000000009", teamId: "Team0000000000000009" }));
  // Auch nicht als Beitritt in den gerade entstandenen Verein.
  await assertFails(joinBatch(verified("second"), "second", "CLUBCODE2345ABCD", { clubId: NEW_CLUB, teamId: NEW_TEAM }));
});

test("R3. Ohne bestaetigte E-Mail, anonym, abgemeldet oder ganz ohne Code: verweigert", async () => {
  await assertFails(clubBatch(unverified("u1"), "u1", "CLUBCODE2345ABCD"));
  await assertFails(clubBatch(anonymous("anon"), "anon", "CLUBCODE2345ABCD", { email: null }));
  await assertFails(clubBatch(as(null), "nobody", "CLUBCODE2345ABCD"));
  await assertFails(clubBatch(verified("u2"), "u2", "GIBTESNICHT2ABCD"));
  // Unbekanntes Konto ohne Code: Verein/Admin/Team direkt anlegen geht nicht.
  const db = verified("u3");
  await assertFails(setDoc(doc(db, "clubs/Club0000000000000005"), { name: "x", logoUrl: null, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, "clubs/Club0000000000000005/admins/u3"), { uid: "u3", role: "admin", createdAt: serverTimestamp() }));
  await assertFails(clubBatch(db, "u3", "CLUBCODE2345ABCD", { skip: ["invite"] }));
  if (!(await inviteExists("CLUBCODE2345ABCD"))) throw new Error("Code darf nicht verbraucht sein");
});

test("R4. Abgelaufener Code: verweigert; an eine E-Mail gebundener Code nur fuer genau diese Adresse", async () => {
  await assertFails(clubBatch(verified("u1"), "u1", "EXPIREDCODE5ABCD"));
  await assertFails(clubBatch(verified("u2", "fremd@example.test"), "u2", "BOUNDCODE345ABCD", { email: "fremd@example.test" }));
  await assertSucceeds(clubBatch(verified("boss", "Boss@Example.test"), "boss", "BOUNDCODE345ABCD", { email: "Boss@Example.test" }));
});

test("R5. Unvollstaendige oder verfaelschte Schreibvorgaenge: verweigert", async () => {
  const db = verified("u1");
  for (const skip of [["club"], ["admin"], ["team"], ["member"], ["club", "admin"], ["team", "member"], ["club", "admin", "team", "member"]]) {
    await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { skip }));
  }
  // Andere IDs als im Code festgelegt.
  await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { clubId: "Club0000000000000007" }));
  await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { teamId: "Team0000000000000007" }));
  // Fremdes Konto als Admin/Trainer, falsche Rolle, Zusatzfelder, falsche E-Mail, Logo-URL.
  await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { tweak: { team: { firstTrainerUid: "someoneelse" } } }));
  await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { tweak: { member: { role: "player" } } }));
  await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { tweak: { member: { uid: "x" } } }));
  await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { tweak: { member: { email: "boss@example.test" } } }));
  await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { tweak: { member: { playerId: "p1" } } }));
  await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { tweak: { admin: { role: "owner" } } }));
  await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { tweak: { club: { logoUrl: "https://example.test/x.png" } } }));
  await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { tweak: { team: { hasTrainer: false } } }));
  await assertFails(clubBatch(db, "u1", "CLUBCODE2345ABCD", { tweak: { team: { clubId: "A" } } }));
  // Nur den Code loeschen (Sabotage) geht nicht.
  await assertFails(deleteDoc(doc(db, "clubInvites/CLUBCODE2345ABCD")));
  if (!(await inviteExists("CLUBCODE2345ABCD"))) throw new Error("Code darf nicht verbraucht sein");
});

test("R6. Mit einem Code macht sich niemand zum Admin eines BESTEHENDEN Vereins oder Trainer eines bestehenden Teams", async () => {
  const db = verified("evil");
  // Code zeigt (fehlkonfiguriert) auf bestehenden Verein A bzw. bestehendes Team.
  await assertFails(clubBatch(db, "evil", "EXISTINGCLUBABCD", { clubId: "A" }));
  await assertFails(clubBatch(db, "evil", "EXISTINGCLUBABCD", { clubId: "A", skip: ["club"] }));
  await assertFails(clubBatch(db, "evil", "EXISTINGTEAMABCD", { teamId: OTHER_TEAM }));
  // Gueltiger Code, aber Admin-Eintrag im bestehenden Verein A bzw. in Verein B.
  for (const clubId of ["A", "B"]) {
    const batch = writeBatch(db);
    batch.delete(doc(db, "clubInvites/CLUBCODE2345ABCD"));
    batch.set(doc(db, `clubs/${clubId}/admins/evil`), { uid: "evil", role: "admin", createdAt: serverTimestamp(), inviteCode: "CLUBCODE2345ABCD" });
    await assertFails(batch.commit());
  }
  // Beitrittscode: niemand wird damit Vereinsadmin, und er legt keinen neuen Verein an.
  const join = writeBatch(db);
  join.delete(doc(db, "clubInvites/JOINCODE2345ABCD"));
  join.set(doc(db, "clubs/A/admins/evil"), { uid: "evil", role: "admin", createdAt: serverTimestamp(), inviteCode: "JOINCODE2345ABCD" });
  await assertFails(join.commit());
  await assertFails(clubBatch(db, "evil", "JOINCODE2345ABCD", { clubId: "Club0000000000000008", teamId: JOIN_TEAM }));
  // Altteams (ohne Team-Dokument) und bestehende Teams lassen sich so nicht uebernehmen.
  await assertFails(joinBatch(db, "evil", "JOINCODE2345ABCD", { teamId: "LEGACY" }));
  await assertFails(joinBatch(db, "evil", "JOINCODE2345ABCD", { teamId: "A1" }));
  await assertFails(joinBatch(db, "evil", "JOINCODE2345ABCD", { teamId: OTHER_TEAM }));
});

test("R7. Beitrittscode: neues Team im bestehenden Verein, erster Trainer dort - aber kein Vereinsadmin, keine fremden Teamdaten", async () => {
  const db = verified("joiner");
  await assertFails(joinBatch(db, "joiner", "JOINCODE2345ABCD", { clubId: "B" }));
  await assertSucceeds(joinBatch(db, "joiner", "JOINCODE2345ABCD"));
  if (await inviteExists("JOINCODE2345ABCD")) throw new Error("Code wurde nicht verbraucht");
  await assertSucceeds(getDoc(doc(db, `teams/${JOIN_TEAM}`)));
  await assertSucceeds(setDoc(doc(db, `teams/${JOIN_TEAM}/players/p1`), { name: "Erster Spieler" }));
  // Kein Admin: Verein nicht aendern, Teams des Vereins nicht auflisten, keine Admins/Codes anlegen.
  await assertFails(updateDoc(doc(db, "clubs/A"), { name: "gekapert" }));
  await assertFails(getDocs(query(collection(db, "teams"), where("clubId", "==", "A"))));
  await assertFails(setDoc(doc(db, "clubs/A/admins/joiner"), { uid: "joiner", role: "admin", createdAt: serverTimestamp() }));
  // Kein Zugriff auf das Nachbarteam A1 des gleichen Vereins.
  for (const path of ["teams/A1", "teams/A1/players/p1", "teams/A1/players/p1/absences/a1", "teams/A1/events/e1/ratings/p1", "teams/A1/members/acoach"]) {
    await assertFails(getDoc(doc(db, path)));
  }
});

test("R8. Neuer Vereinsadmin sieht keine Daten anderer Vereine; Vereinsadmin A sieht keine Spielerdaten des neuen Teams", async () => {
  const db = verified("newcoach");
  await assertSucceeds(clubBatch(db, "newcoach", "CLUBCODE2345ABCD"));
  for (const path of ["teams/A1", "teams/A1/players/p1", "teams/A1/players/p1/absences/a1", "teams/A1/events/e1/ratings/p1", "clubs/A/admins/adminA"]) {
    await assertFails(getDoc(doc(db, path)));
  }
  await assertFails(getDocs(query(collection(db, "teams"), where("clubId", "==", "A"))));
  await assertFails(getDocs(query(collection(db, "clubInvites"), where("clubId", "==", "A"))));
  const adminA = as("adminA");
  await assertFails(getDoc(doc(adminA, `teams/${NEW_TEAM}`)));
  await assertFails(getDoc(doc(adminA, `teams/${NEW_TEAM}/players/p1`)));
  await assertFails(updateDoc(doc(adminA, `clubs/${NEW_CLUB}`), { name: "gekapert" }));
});

test("R9. Beitrittscodes: nur der Vereinsadmin legt sie fuer den eigenen Verein an, sieht und zieht sie zurueck", async () => {
  const adminA = as("adminA");
  const code = (data) => ({ kind: "team", clubId: "A", teamId: "Team0000000000000004", expiresAt: FAR, createdAt: serverTimestamp(), email: null, createdBy: "adminA", ...data });
  await assertSucceeds(setDoc(doc(adminA, "clubInvites/JNEWCDE2345ABCDE"), code()));
  await assertSucceeds(setDoc(doc(adminA, "clubInvites/JNEWCDE2345ABCDF"), code({ teamId: "Team0000000000000005", email: "neu@example.test" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/JNEWCDE2345ABCDG"), code({ clubId: "B" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/JNEWCDE2345ABCDG"), code({ kind: "club" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/JNEWCDE2345ABCDG"), code({ teamId: "A1" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/JNEWCDE2345ABCDG"), code({ teamId: OTHER_TEAM })));
  await assertFails(setDoc(doc(adminA, "clubInvites/JNEWCDE2345ABCDG"), code({ expiresAt: Timestamp.fromMillis(Date.now() + 40 * 24 * 3600 * 1000) })));
  await assertFails(setDoc(doc(adminA, "clubInvites/JNEWCDE2345ABCDG"), code({ expiresAt: PAST })));
  await assertFails(setDoc(doc(adminA, "clubInvites/JNEWCDE2345ABCDG"), code({ createdBy: "someoneelse" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/JNEWCDE2345ABCDG"), code({ email: "Gross@Example.test" })));
  await assertFails(setDoc(doc(adminA, "clubInvites/kurz"), code()));
  await assertFails(setDoc(doc(adminA, "clubInvites/JOINCODE2345ABCD"), code())); // besteht schon: kein Ueberschreiben
  for (const uid of ["acoach", "aplayer", "adminB"]) await assertFails(setDoc(doc(as(uid), "clubInvites/JNEWCDE2345ABCDH"), code({ createdBy: uid })));
  // Lesen: Liste nur eigener Verein; fremde Admins/Trainer/Spieler nicht.
  await assertSucceeds(getDocs(query(collection(adminA, "clubInvites"), where("clubId", "==", "A"))));
  await assertFails(getDocs(collection(adminA, "clubInvites")));
  await assertFails(getDocs(query(collection(as("adminB"), "clubInvites"), where("clubId", "==", "A"))));
  await assertFails(getDocs(query(collection(as("acoach"), "clubInvites"), where("clubId", "==", "A"))));
  await assertFails(getDocs(query(collection(verified("x"), "clubInvites"), where("clubId", "==", "A"))));
  // Einzelabruf eines bekannten Codes: mit bestaetigter E-Mail ja (Anzeige in der Registrierung), sonst nicht.
  await assertSucceeds(getDoc(doc(verified("x"), "clubInvites/JOINCODE2345ABCD")));
  await assertSucceeds(getDoc(doc(adminA, "clubInvites/JOINCODE2345ABCD")));
  for (const db of [unverified("y"), anonymous("z"), as(null), as("adminB")]) await assertFails(getDoc(doc(db, "clubInvites/JOINCODE2345ABCD")));
  // Zurueckziehen: nur der eigene Admin, und nur Beitrittscodes (keine Vereinscodes des PO).
  await assertFails(deleteDoc(doc(as("adminB"), "clubInvites/JOINCODE2345ABCD")));
  await assertFails(deleteDoc(doc(as("acoach"), "clubInvites/JOINCODE2345ABCD")));
  await assertFails(deleteDoc(doc(adminA, "clubInvites/CLUBCODE2345ABCD")));
  await assertSucceeds(deleteDoc(doc(adminA, "clubInvites/JOINCODE2345ABCD")));
  // Aendern nie.
  await assertFails(updateDoc(doc(adminA, "clubInvites/JNEWCDE2345ABCDE"), { expiresAt: FAR }));
});

test("R10. Abgemeldet: weder Codes noch Vereine noch Teams lesbar oder anlegbar", async () => {
  const db = as(null);
  await assertFails(getDoc(doc(db, "clubInvites/CLUBCODE2345ABCD")));
  await assertFails(getDoc(doc(db, "clubs/A")));
  await assertFails(getDoc(doc(db, `teams/${OTHER_TEAM}`)));
  await assertFails(setDoc(doc(db, "clubInvites/JNEWCDE2345ABCDJ"), { kind: "team", clubId: "A", teamId: "Team0000000000000006", expiresAt: FAR, createdAt: serverTimestamp(), email: null, createdBy: "x" }));
});

test("R11. Ein Code aus dem Skript (scripts/club-invite-lib.mjs) laesst sich genau so einloesen", async () => {
  const none = { clubExists: () => false, teamExists: () => false, codeExists: () => false };
  const { write, code } = planInvite({ options: parseArgs(["--email", "skript@example.test"]), state: none, createdAt: Timestamp.now() });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), write.path), { ...write.data, expiresAt: Timestamp.fromDate(write.data.expiresAt) });
  });
  const opts = { clubId: write.data.clubId, teamId: write.data.teamId };
  await assertFails(clubBatch(verified("other"), "other", code, opts));
  await assertSucceeds(clubBatch(verified("skript", "skript@example.test"), "skript", code, { ...opts, email: "skript@example.test" }));
});
