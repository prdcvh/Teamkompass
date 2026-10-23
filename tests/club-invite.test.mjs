// SCRUM-181: Logik des Skripts scripts/create-club-invite.mjs (Einladungscodes fuer die Registrierung).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CODE_ALPHABET, CODE_PATTERN, DEFAULT_DAYS, formatCode, generateCode, generateId, parseArgs, planInvite } from "../scripts/club-invite-lib.mjs";

const none = { clubExists: () => false, teamExists: () => false, codeExists: () => false };

test("club-invite: Probelauf ist Standard, Optionen werden geprueft", () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.apply, false);
  assert.equal(defaults.days, DEFAULT_DAYS);
  assert.equal(defaults.email, null);
  assert.equal(defaults.clubId, null);
  assert.equal(parseArgs(["--apply"]).apply, true);
  assert.equal(parseArgs(["--apply", "--dry-run"]).apply, false);
  assert.equal(parseArgs(["--email", " Trainer@Verein.DE "]).email, "trainer@verein.de");
  assert.equal(parseArgs(["--days=30"]).days, 30);
  assert.equal(parseArgs(["--club", "fc-koenigstein"]).clubId, "fc-koenigstein");
  assert.throws(() => parseArgs(["--email", "keine-mail"]), /Ungueltige E-Mail/);
  assert.throws(() => parseArgs(["--days", "0"]), /--days/);
  assert.throws(() => parseArgs(["--days", "61"]), /--days/);
  assert.throws(() => parseArgs(["--days", "1.5"]), /--days/);
  assert.throws(() => parseArgs(["--club", "a/b"]), /Vereins-ID/);
  assert.throws(() => parseArgs(["--base-url", "http://x.example"]), /https/);
  assert.throws(() => parseArgs(["--force"]), /Unbekannte Option/);
});

test("club-invite: Codes sind zufaellig, 16 Zeichen ohne 0/O/1/I und passen zur Regel", async () => {
  const codes = new Set(Array.from({ length: 200 }, () => generateCode()));
  assert.equal(codes.size, 200);
  for (const code of codes) assert.match(code, CODE_PATTERN);
  assert.ok(!/[01IO]/.test(CODE_ALPHABET));
  assert.equal(CODE_ALPHABET.length, 32);
  assert.match(generateId(), /^[A-Za-z0-9]{20}$/);
  assert.equal(formatCode("ABCDEFGHJKLMNPQR"), "ABCD-EFGH-JKLM-NPQR");
  // Gleiche Regel wie in firestore.rules (Beitrittscodes aus der App) und in der App (registration.ts).
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.ok(rules.includes("code.matches('^[A-HJ-NP-Z2-9]{16}$')"));
  const app = await readFile(new URL("../angular/src/app/core/registration/registration.ts", import.meta.url), "utf8");
  assert.ok(app.includes("/^[A-HJ-NP-Z2-9]{16}$/"));
});

test("club-invite: Vereinscode legt neue Zufalls-IDs fest, Ablauf und E-Mail-Bindung", () => {
  const now = new Date("2026-10-23T10:00:00Z");
  const { write, code, link, errors } = planInvite({ options: parseArgs(["--email", "a@b.de", "--days", "7"]), state: none, now, createdAt: "TS" });
  assert.deepEqual(errors, []);
  assert.equal(write.path, `clubInvites/${code}`);
  assert.equal(write.data.kind, "club");
  assert.match(write.data.clubId, /^[A-Za-z0-9]{20}$/);
  assert.match(write.data.teamId, /^[A-Za-z0-9]{20}$/);
  assert.equal(write.data.email, "a@b.de");
  assert.equal(write.data.createdAt, "TS");
  assert.equal(write.data.expiresAt.toISOString(), "2026-10-30T10:00:00.000Z");
  assert.equal(link, `https://teamkompass-u14.web.app/registrieren?code=${code}`);
});

test("club-invite: vorhandene IDs/Codes werden nie wiederverwendet", () => {
  let calls = 0;
  // Erste Wuerfe kollidieren - danach muessen neue IDs/Codes kommen.
  const taken = { club: null, team: null, code: null };
  const state = {
    clubExists: (id) => { taken.club ??= id; return id === taken.club; },
    teamExists: (id) => { taken.team ??= id; return id === taken.team; },
    codeExists: (code) => { calls += 1; taken.code ??= code; return code === taken.code; }
  };
  const { write, code } = planInvite({ options: parseArgs([]), state, createdAt: "TS" });
  assert.notEqual(write.data.clubId, taken.club);
  assert.notEqual(write.data.teamId, taken.team);
  assert.notEqual(code, taken.code);
  assert.ok(calls >= 2);
});

test("club-invite: Beitrittscode nur fuer einen bestehenden Verein, mit neuer Team-ID", () => {
  const missing = planInvite({ options: parseArgs(["--club", "gibtsnicht"]), state: none, createdAt: "TS" });
  assert.equal(missing.write, null);
  assert.match(missing.errors[0], /gibt es nicht/);
  const state = { ...none, clubExists: (id) => id === "fc-koenigstein" };
  const { write, errors } = planInvite({ options: parseArgs(["--club", "fc-koenigstein"]), state, createdAt: "TS" });
  assert.deepEqual(errors, []);
  assert.equal(write.data.kind, "team");
  assert.equal(write.data.clubId, "fc-koenigstein");
  assert.match(write.data.teamId, /^[A-Za-z0-9]{20}$/);
});
