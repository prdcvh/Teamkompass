// SCRUM-218: Baut die Vorschau-Kopie der Alt-App mit dem Testteam (siehe legacy-preview-lib.mjs).
// Aufruf (im Verify-Job des PR-Workflows): node scripts/legacy-preview.mjs outputs/team-manager
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { legacyPreviewConfig, legacyPreviewDir } from "./legacy-preview-lib.mjs";

const [sourceDir, ...rest] = process.argv.slice(2);
if (!sourceDir || rest.length) {
  console.error("Aufruf: node scripts/legacy-preview.mjs outputs/<team-ordner>");
  process.exit(1);
}
const targetDir = legacyPreviewDir(sourceDir);
const config = legacyPreviewConfig(await readFile(`${sourceDir}/firebase-config.js`, "utf8"));
await rm(targetDir, { recursive: true, force: true });
await cp(sourceDir, targetDir, { recursive: true });
await writeFile(`${targetDir}/firebase-config.js`, config);
console.log(`Vorschau-Kopie ${targetDir} gebaut (Testteam, Quelle ${sourceDir}).`);
