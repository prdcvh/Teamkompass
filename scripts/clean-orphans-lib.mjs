// Reine Logik fuer scripts/clean-orphans.mjs (SCRUM-278, ohne firebase-admin, damit testbar).

const TEAM_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function parseArgs(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = [...flags].filter((flag) => flag !== "--apply");
  if (unknown.length) throw new Error(`Unbekannte Option: ${unknown.join(", ")}`);
  if (positional.length !== 1) throw new Error("Aufruf: node scripts/clean-orphans.mjs <teamId> [--apply]");
  const [teamId] = positional;
  if (!TEAM_ID.test(teamId)) throw new Error(`Ungueltige teamId: "${teamId}"`);
  return { teamId, apply: flags.has("--apply") };
}

/**
 * Verwaiste Unterdaten: Eintraege unter teams/<team>/players/<id>/..., deren Spielerdokument es nicht mehr gibt
 * (Spieler geloescht, aber z. B. selfReports/wellness blieben zurueck, SCRUM-278).
 * `players` = [{ id, exists, collections: { <name>: [<docPath>, ...] } }] -> zu loeschende Pfade je Spieler.
 * Bestehende Spieler werden nie angefasst.
 */
export function planCleanup(players) {
  const orphans = [];
  for (const player of players) {
    if (player.exists) continue;
    const paths = Object.values(player.collections).flat();
    if (!paths.length) continue;
    const counts = Object.fromEntries(Object.entries(player.collections).filter(([, list]) => list.length).map(([name, list]) => [name, list.length]));
    orphans.push({ id: player.id, counts, paths });
  }
  return orphans;
}

export function summarize(teamId, orphans, apply) {
  const lines = [];
  const verb = apply ? "Geloescht" : "[Probelauf] Wuerde loeschen";
  if (!orphans.length) {
    lines.push(`teams/${teamId}: keine verwaisten Spielerdaten gefunden.`);
    return lines;
  }
  for (const orphan of orphans) {
    const detail = Object.entries(orphan.counts).sort().map(([name, count]) => `${name}: ${count}`).join(", ");
    lines.push(`${verb}: teams/${teamId}/players/${orphan.id} (Spieler existiert nicht mehr) – ${detail}`);
  }
  const total = orphans.reduce((sum, orphan) => sum + orphan.paths.length, 0);
  lines.push(`${apply ? "Insgesamt geloescht" : "Insgesamt wuerden geloescht"}: ${total} Dokument(e) von ${orphans.length} Spieler(n).`);
  if (!apply) lines.push("Nichts veraendert. Zum Loeschen denselben Aufruf mit --apply wiederholen.");
  return lines;
}
