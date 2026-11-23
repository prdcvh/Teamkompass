// Reine Logik fuer scripts/migrate-medical-role.mjs (SCRUM-202, ohne firebase-admin, damit testbar).
// Die alte Kennung "medical" (frueherer "Scout-Zugang", SCRUM-91) wird auf "scout" umgestellt. Gespeichert
// wird eine Rolle nur in teams/{teamId}/members/{uid}.role; Einladungen (invites) kennen nur "player"/"parent".

export const OLD_ROLE = "medical";
export const NEW_ROLE = "scout";

const MEMBER_PATH = /^teams\/([^/]+)\/members\/([^/]+)$/;
const USAGE = "Aufruf: node scripts/migrate-medical-role.mjs [--apply]   (ohne --apply: Probelauf, schreibt nichts)";

// Standard ist der Probelauf: geschrieben wird nur mit --apply.
export function parseArgs(argv) {
  let apply = false;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") apply = false;
    else throw new Error(`Unbekannte Option: ${arg}\n${USAGE}`);
  }
  return { apply };
}

// docs: [{ path: "teams/<teamId>/members/<uid>", data }] - alle Mitglieds-Dokumente aller Teams
// (im Skript: collectionGroup("members")). Ergebnis:
//   writes: [{ path, data: { role: "scout" } }]  nur fuer Dokumente mit role === "medical" (merge: nur dieses Feld)
//   byTeam: { [teamId]: [uid, ...] }
//   skipped: Pfade mit role "medical", die nicht wie teams/{id}/members/{uid} aussehen (werden nicht angefasst)
export function planMigration(docs) {
  const writes = [];
  const byTeam = {};
  const skipped = [];
  for (const { path, data } of docs) {
    if (data?.role !== OLD_ROLE) continue;
    const match = MEMBER_PATH.exec(path);
    if (!match) {
      skipped.push(path);
      continue;
    }
    writes.push({ path, data: { role: NEW_ROLE } });
    (byTeam[match[1]] ??= []).push(match[2]);
  }
  return { writes, byTeam, skipped };
}
