// SCRUM-245: Die eigenen Teams (ohne Einwilligungs-Sperre fremder Vereine) stehen zweimal im Repo - in den Regeln
// (isOwnTeam) und in der App (OWN_TEAM_IDS). Beide Listen muessen gleich sein und zu den Team-Builds passen.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const ids = (text) => [...text.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();

test("Eigene Teams sind in Regeln und App gleich", async () => {
  const rules = await read("firestore.rules");
  const app = await read("angular/src/app/core/player/consent.ts");
  const ruleList = rules.match(/function isOwnTeam\(\) \{\s*return teamId in \[([^\]]*)\];/);
  const appList = app.match(/export const OWN_TEAM_IDS: readonly string\[\] = \[([^\]]*)\];/);
  assert.ok(ruleList, "isOwnTeam() fehlt in firestore.rules");
  assert.ok(appList, "OWN_TEAM_IDS fehlt in consent.ts");
  assert.deepEqual(ids(ruleList[1]), ids(appList[1]));
});

test("Jeder Team-Build gehört zu den eigenen Teams", async () => {
  const app = await read("angular/src/app/core/player/consent.ts");
  const own = ids(app.match(/OWN_TEAM_IDS: readonly string\[\] = \[([^\]]*)\]/)[1]);
  for (const file of ["environment.ts", "environment.mein-team.ts", "environment.u15.ts", "environment.u17.ts"]) {
    const env = await read(`angular/src/environments/${file}`);
    const teamId = env.match(/teamId: '([^']+)'/)[1];
    assert.ok(own.includes(teamId), `${file}: ${teamId} fehlt in OWN_TEAM_IDS`);
  }
});

test("Spieler, Eltern und Medizin lesen bei widerrufener Einwilligung keine Gesundheitsdaten", async () => {
  const rules = await read("firestore.rules");
  for (const path of ["absences", "measurements"]) {
    const block = rules.match(new RegExp(`match /${path}/\\{[a-zA-Z]+\\} \\{([\\s\\S]*?)\\n        \\}`))[1];
    assert.match(block, /!consentRevoked\(playerId\)/, `${path}: Widerruf nicht geprüft`);
    assert.match(block, /mayStoreHealth\(playerId\)/, `${path}: Sperre fremder Vereine fehlt`);
  }
  assert.match(rules, /match \/playerCards\/\{playerId\}/);
});
