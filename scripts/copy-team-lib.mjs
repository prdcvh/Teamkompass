// Reine Logik fuer scripts/copy-team.mjs (ohne firebase-admin, damit testbar).

const TEAM_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function parseArgs(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = [...flags].filter((flag) => !["--dry-run", "--overwrite"].includes(flag));
  if (unknown.length) throw new Error(`Unbekannte Option: ${unknown.join(", ")}`);
  if (positional.length !== 2) throw new Error("Aufruf: node scripts/copy-team.mjs <quell-teamId> <ziel-teamId> [--dry-run] [--overwrite]");
  const [from, to] = positional;
  for (const id of [from, to]) {
    if (!TEAM_ID.test(id)) throw new Error(`Ungueltige teamId: "${id}"`);
  }
  if (from === to) throw new Error("Quelle und Ziel duerfen nicht identisch sein.");
  return { from, to, dryRun: flags.has("--dry-run"), overwrite: flags.has("--overwrite") };
}

// "teams/mein-team/events/e1/ratings/p1" -> "teams/U14/events/e1/ratings/p1".
// Wirft, wenn der Pfad nicht unter dem Quell-Team liegt (Schutz vor Fehlkopien).
export function mapPath(path, from, to) {
  const prefix = `teams/${from}`;
  if (path !== prefix && !path.startsWith(`${prefix}/`)) throw new Error(`Pfad liegt nicht unter ${prefix}: ${path}`);
  return `teams/${to}${path.slice(prefix.length)}`;
}

// Dokument-Referenzen innerhalb der Daten zeigen sonst weiter auf das Quell-Team.
// `isRef(value)` / `makeRef(path)` kommen aus dem Admin-SDK, damit die Logik ohne SDK testbar bleibt.
export function mapValue(value, from, to, { isRef, makeRef }) {
  if (isRef(value)) return makeRef(mapPath(value.path, from, to));
  if (Array.isArray(value)) return value.map((item) => mapValue(item, from, to, { isRef, makeRef }));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapValue(item, from, to, { isRef, makeRef })]));
  }
  return value; // Timestamp, GeoPoint, Bytes, Primitive bleiben unveraendert
}

// "teams/mein-team/events/e1/ratings/p1" -> "events/ratings" (Anzeige der Zaehler je Collection)
export function collectionKey(path, from) {
  const rest = path.slice(`teams/${from}`.length).split("/").filter(Boolean);
  if (!rest.length) return "(Team-Dokument)";
  return rest.filter((_, index) => index % 2 === 0).join("/");
}
