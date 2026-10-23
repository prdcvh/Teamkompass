// Reine Logik fuer scripts/assign-clubs.mjs (SCRUM-180, ohne firebase-admin, damit testbar).
// Ordnet die bestehenden Teams ihren Vereinen zu, ohne Daten umzuziehen: legt clubs/{clubId} samt Admin an,
// setzt im Team-Dokument clubId/name/label/hasTrainer und schreibt in jedes members-Dokument das Feld uid
// (= Dokument-ID) fuer die Teamsuche. Nichts Bestehendes wird ueberschrieben oder geloescht.

// Entscheidungen des PO (23.10.2026, Architektur-Notiz docs/architektur-verein-teams.md, Abschnitt 9).
export const CLUBS = {
  "fc-koenigstein": { name: "1. FC Königstein" },
  // Eigener Test-Verein fuer die Angular-Testkopie U14 (Frage 4).
  "test-verein": { name: "Test-Verein (Angular-Test)" }
};

export const TEAMS = {
  "mein-team": { clubId: "fc-koenigstein", name: "1. FC Königstein U14", label: "U14" },
  U15: { clubId: "fc-koenigstein", name: "1. FC Königstein U15", label: "U15" },
  U17: { clubId: "fc-koenigstein", name: "1. FC Königstein U17", label: "U17" },
  U14: { clubId: "test-verein", name: "Test-Team U14 (Angular)", label: "U14 Test" }
};

const UID = /^[A-Za-z0-9]{1,128}$/;
const USAGE = "Aufruf: node scripts/assign-clubs.mjs --admin-uid <UID des PO> [--apply]";

// Standard ist der Probelauf: geschrieben wird nur mit --apply.
export function parseArgs(argv) {
  let adminUid = null;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") apply = false;
    else if (arg === "--admin-uid") adminUid = argv[++index] ?? null;
    else if (arg.startsWith("--admin-uid=")) adminUid = arg.slice("--admin-uid=".length);
    else throw new Error(`Unbekannte Option: ${arg}\n${USAGE}`);
  }
  if (!adminUid) throw new Error(`--admin-uid fehlt.\n${USAGE}`);
  if (!UID.test(adminUid)) throw new Error(`Ungueltige UID: "${adminUid}"`);
  return { adminUid, apply };
}

// state: {
//   clubs:  { [clubId]: data | null },
//   admins: { [`${clubId}/${uid}`]: boolean },
//   teams:  { [teamId]: { data: object | null, hasContent: boolean, members: [{ id, data }] } }
// }
// timestamp: Wert fuer createdAt (im Skript FieldValue.serverTimestamp()).
// Ergebnis: { writes: [{ path, data }] (immer als merge zu schreiben), notes: [...], errors: [...] }
export function planAssignment({ adminUid, state, timestamp, clubs = CLUBS, teams = TEAMS }) {
  const writes = [];
  const notes = [];
  const errors = [];

  for (const [clubId, club] of Object.entries(clubs)) {
    if (state.clubs?.[clubId]) notes.push(`clubs/${clubId}: existiert schon, bleibt unveraendert`);
    else writes.push({ path: `clubs/${clubId}`, data: { name: club.name, logoUrl: null, createdAt: timestamp } });
    if (state.admins?.[`${clubId}/${adminUid}`]) notes.push(`clubs/${clubId}/admins/${adminUid}: existiert schon`);
    else writes.push({ path: `clubs/${clubId}/admins/${adminUid}`, data: { uid: adminUid, role: "admin", createdAt: timestamp } });
  }

  for (const [teamId, target] of Object.entries(teams)) {
    const team = state.teams?.[teamId];
    if (!team || (!team.data && !team.hasContent)) {
      notes.push(`teams/${teamId}: nicht gefunden, uebersprungen`);
      continue;
    }
    const current = team.data || {};
    if (current.clubId != null && current.clubId !== target.clubId) {
      errors.push(`teams/${teamId}: gehoert schon zu "${current.clubId}", erwartet "${target.clubId}" - wird nicht umgebogen`);
      continue;
    }
    const patch = {};
    if (current.clubId == null) patch.clubId = target.clubId;
    if (current.name == null) patch.name = target.name;
    if (current.label == null) patch.label = target.label;
    // Bestehende Teams gelten als besetzt: der Vereinsadmin kann dort keinen "ersten Trainer" einsetzen.
    if (current.hasTrainer == null) patch.hasTrainer = true;
    if (!team.data) patch.createdAt = timestamp;
    if (Object.keys(patch).length) writes.push({ path: `teams/${teamId}`, data: patch });
    else notes.push(`teams/${teamId}: schon zugeordnet`);
    if (!(team.members || []).some((member) => member.data?.role === "trainer")) {
      notes.push(`teams/${teamId}: kein Trainer-Zugang gefunden (hasTrainer bleibt trotzdem true)`);
    }
    for (const member of team.members || []) {
      const uid = member.data?.uid;
      if (uid === member.id) continue;
      if (uid != null) notes.push(`teams/${teamId}/members/${member.id}: uid "${uid}" passt nicht zur Dokument-ID, wird korrigiert`);
      writes.push({ path: `teams/${teamId}/members/${member.id}`, data: { uid: member.id } });
    }
  }

  return { writes, notes, errors };
}

// Zaehler fuer die Ausgabe: "clubs", "clubs/admins", "teams", "teams/members".
export function summarize(writes) {
  const counts = {};
  for (const { path } of writes) {
    const key = path.split("/").filter((_, index) => index % 2 === 0).join("/");
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
