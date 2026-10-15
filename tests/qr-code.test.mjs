import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// Der QR-Generator ist ein klassisches Browser-Skript (window.TeamKompassQr); hier in einem leeren Kontext laden.
async function loadQr() {
  const context = { TextEncoder };
  vm.createContext(context);
  vm.runInContext(await readFile(new URL("../outputs/team-manager/qr-code.js", import.meta.url), "utf8"), context);
  return context.TeamKompassQr;
}

const digest = (matrix) => createHash("sha256").update(matrix.map((row) => row.map(Number).join("")).join("\n")).digest("hex");

test("QR-Code stimmt bitgenau mit einem Referenz-Encoder ueberein (SCRUM-30)", async () => {
  const qr = await loadQr();
  // Referenzwerte stammen aus der Python-Bibliothek "qrcode" (Stufe M, Byte-Modus, feste Maske) und wurden zusaetzlich mit OpenCV dekodiert.
  const link = `https://example.org/app/?invite=${"0123456789abcdef".repeat(3)}`;
  const linkMatrix = qr.encode(link, 2);
  assert.equal(linkMatrix.length, 37);
  assert.equal(digest(linkMatrix), "f07a8c6730d9c79deb040533c8270425a0f6f9205fd98fab3289c7730487586d");
  const shortMatrix = qr.encode("TeamKompass", 0);
  assert.equal(shortMatrix.length, 21);
  assert.equal(digest(shortMatrix), "ad5559c6cd6e787ccda030d15d89066c3dd5979fd70e469f16dc8e1a49cafe3c");
});

test("QR-Code: Groesse waechst mit dem Text, zu langer Text wird abgelehnt", async () => {
  const qr = await loadQr();
  assert.equal(qr.encode("a").length, 21);
  assert.ok(qr.encode("x".repeat(100)).length > qr.encode("x".repeat(10)).length);
  assert.throws(() => qr.encode("x".repeat(400)), { name: "RangeError" });
});

test("QR-Code: SVG ist ein einziger Pfad ohne Skripte oder externe Quellen", async () => {
  const qr = await loadQr();
  const svg = qr.toSvg("https://example.org/?invite=abc", 'Beschriftung "<b>"');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
  assert.equal((svg.match(/<path /g) || []).length, 1);
  assert.doesNotMatch(svg, /<script|href=|<b>/);
});

test("Einladungen: Dialog statt prompt/alert, Link, offene Einladungen, Trainer-Konten in allen Kopien (SCRUM-30)", async () => {
  for (const team of ["team-manager", "u15", "u17"]) {
    const app = await readFile(new URL(`../outputs/${team}/app.js`, import.meta.url), "utf8");
    const html = await readFile(new URL(`../outputs/${team}/index.html`, import.meta.url), "utf8");
    const create = app.slice(app.indexOf("async function createInviteCodeForPlayer"), app.indexOf("function cloudErrorSuffix"));
    assert.doesNotMatch(create, /prompt\(/, `${team}: createInviteCodeForPlayer nutzt noch prompt()`);
    assert.doesNotMatch(create, /alert\(`Einmaliger/, `${team}: Code steht noch im alert()`);
    assert.match(create, /showInviteShare\(/);
    assert.match(app, /\?invite=\$\{encodeURIComponent\(code\)\}/);
    assert.match(app, /prefillInviteFromUrl\(\);/);
    assert.match(app, /getDocs\(teamCollection\("invites"\)\)/);
    assert.match(app, /deleteDoc\(teamDoc\("invites", code\)\)/);
    assert.match(app, /docSnap\.data\(\)\.role === "trainer"/, `${team}: Trainer-Konten fehlen in der Liste`);
    assert.match(app, /uid === \(currentUser\?\.uid/, `${team}: eigenes Konto ist sperrbar`);
    for (const id of ["inviteShareDialog", "inviteCreateDialog", "inviteManagerList", "trainerManagerList", "inviteShareQr"]) assert.ok(html.includes(`id="${id}"`), `${team}: #${id} fehlt`);
    assert.ok(html.indexOf('src="./qr-code.js"') > 0 && html.indexOf('src="./qr-code.js"') < html.indexOf('src="./app.js"'), `${team}: qr-code.js muss vor app.js geladen werden`);
    const worker = await readFile(new URL(`../outputs/${team}/service-worker.js`, import.meta.url), "utf8");
    assert.ok(worker.includes("./qr-code.js"), `${team}: qr-code.js fehlt im Service-Worker-Cache`);
  }
});
