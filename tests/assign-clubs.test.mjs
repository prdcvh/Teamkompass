// SCRUM-180: Logik des Einmal-Skripts scripts/assign-clubs.mjs (Teams einem Verein zuordnen).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CLUBS, TEAMS, parseArgs, planAssignment, summarize } from "../scripts/assign-clubs-lib.mjs";

const TS = "(Serverzeit)";
const legacyTeam = (members) => ({ data: null, hasContent: true, members });
const emptyState = () => ({
  clubs: {},
  admins: {},
  teams: {
    "mein-team": legacyTeam([{ id: "coach1", data: { role: "trainer", email: "c@example.test" } }, { id: "pl1", data: { role: "player", playerId: "p1" } }]),
    U15: legacyTeam([{ id: "coach2", data: { role: "trainer" } }]),
    U17: legacyTeam([{ id: "coach3", data: { role: "trainer" } }]),
    U14: legacyTeam([{ id: "coach1", data: { role: "trainer" } }])
  }
});

test("assign-clubs: Probelauf ist Standard, geschrieben wird nur mit --apply", () => {
  assert.deepEqual(parseArgs(["--admin-uid", "abc123"]), { adminUid: "abc123", apply: false });
  assert.deepEqual(parseArgs(["--admin-uid=abc123", "--apply"]), { adminUid: "abc123", apply: true });
  assert.deepEqual(parseArgs(["--apply", "--dry-run", "--admin-uid", "abc123"]), { adminUid: "abc123", apply: false });
  assert.throws(() => parseArgs([]), /admin-uid fehlt/);
  assert.throws(() => parseArgs(["--admin-uid"]), /admin-uid fehlt/);
  assert.throws(() => parseArgs(["--admin-uid", "a/b"]), /Ungueltige UID/);
  assert.throws(() => parseArgs(["--admin-uid", "abc", "--force"]), /Unbekannte Option/);
});

test("assign-clubs: Zuordnung laut PO-Entscheidung (fc-koenigstein, U14 im Test-Verein)", () => {
  assert.deepEqual(Object.keys(CLUBS).sort(), ["fc-koenigstein", "test-verein"]);
  assert.equal(TEAMS["mein-team"].clubId, "fc-koenigstein");
  assert.equal(TEAMS.U15.clubId, "fc-koenigstein");
  assert.equal(TEAMS.U17.clubId, "fc-koenigstein");
  assert.equal(TEAMS.U14.clubId, "test-verein");
});

test("assign-clubs: legt Vereine, Admin, Team-Felder und uid-Felder an - nur Ergaenzungen", () => {
  const { writes, errors } = planAssignment({ adminUid: "po", state: emptyState(), timestamp: TS });
  assert.deepEqual(errors, []);
  const byPath = Object.fromEntries(writes.map((entry) => [entry.path, entry.data]));
  assert.deepEqual(byPath["clubs/fc-koenigstein"], { name: "1. FC Königstein", logoUrl: null, createdAt: TS });
  assert.deepEqual(byPath["clubs/fc-koenigstein/admins/po"], { uid: "po", role: "admin", createdAt: TS });
  assert.deepEqual(byPath["clubs/test-verein/admins/po"], { uid: "po", role: "admin", createdAt: TS });
  assert.deepEqual(byPath["teams/mein-team"], { clubId: "fc-koenigstein", name: "1. FC Königstein U14", label: "U14", hasTrainer: true, createdAt: TS });
  assert.equal(byPath["teams/U14"].clubId, "test-verein");
  // Mitglieder bekommen nur das Feld uid (= Dokument-ID); Rolle, E-Mail usw. werden nicht angefasst.
  assert.deepEqual(byPath["teams/mein-team/members/coach1"], { uid: "coach1" });
  assert.deepEqual(byPath["teams/U14/members/coach1"], { uid: "coach1" });
  assert.deepEqual(summarize(writes), { clubs: 2, "clubs/admins": 2, teams: 4, "teams/members": 5 });
  // Kein Schreibvorgang ausserhalb von clubs/ und teams/, keine Unter-Collections ausser members.
  for (const { path } of writes) assert.match(path, /^(clubs\/[^/]+(\/admins\/[^/]+)?|teams\/[^/]+(\/members\/[^/]+)?)$/);
});

test("assign-clubs: zweiter Lauf schreibt nichts mehr, bestehende Angaben bleiben", () => {
  const state = emptyState();
  state.clubs = { "fc-koenigstein": { name: "Umbenannt" }, "test-verein": { name: "Test" } };
  state.admins = { "fc-koenigstein/po": true, "test-verein/po": true };
  for (const [teamId, target] of Object.entries(TEAMS)) {
    state.teams[teamId].data = { clubId: target.clubId, name: "eigener Name", label: "x", hasTrainer: true };
    state.teams[teamId].members = state.teams[teamId].members.map((member) => ({ ...member, data: { ...member.data, uid: member.id } }));
  }
  const { writes, errors } = planAssignment({ adminUid: "po", state, timestamp: TS });
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
});

test("assign-clubs: ein Team mit anderem Verein wird nie umgebogen (Abbruch), fehlende Teams werden uebersprungen", () => {
  const state = emptyState();
  state.teams.U15.data = { clubId: "fremder-verein" };
  delete state.teams.U17;
  const { writes, errors, notes } = planAssignment({ adminUid: "po", state, timestamp: TS });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /teams\/U15/);
  assert.ok(!writes.some((entry) => entry.path.startsWith("teams/U15")));
  assert.ok(notes.some((note) => /teams\/U17: nicht gefunden/.test(note)));
});

test("assign-clubs: falsches uid-Feld wird auf die Dokument-ID korrigiert", () => {
  const state = emptyState();
  state.teams.U15.members = [{ id: "coach2", data: { role: "trainer", uid: "jemandAnderes" } }];
  const { writes } = planAssignment({ adminUid: "po", state, timestamp: TS });
  assert.deepEqual(writes.find((entry) => entry.path === "teams/U15/members/coach2").data, { uid: "coach2" });
});

test("assign-clubs: Skript schreibt nur mit --apply und nur als merge", async () => {
  const script = await readFile(new URL("../scripts/assign-clubs.mjs", import.meta.url), "utf8");
  assert.match(script, /if \(!apply\) \{[\s\S]*?process\.exit\(0\);/);
  assert.match(script, /writer\.set\(db\.doc\(path\), data, \{ merge: true \}\)/);
  assert.doesNotMatch(script, /\.delete\(|recursiveDelete/);
});

test("copy-team: das Team-Dokument (Vereinszuordnung) wird nie mitkopiert", async () => {
  const { isTeamDocument } = await import("../scripts/copy-team-lib.mjs");
  assert.equal(isTeamDocument("teams/mein-team", "mein-team"), true);
  assert.equal(isTeamDocument("teams/mein-team/players/p1", "mein-team"), false);
  assert.equal(isTeamDocument("teams/mein-team2", "mein-team"), false);
  const script = await readFile(new URL("../scripts/copy-team.mjs", import.meta.url), "utf8");
  assert.match(script, /if \(snapshot\.exists && !isTeamDocument\(sourceRef\.path, from\)\)/);
});
