import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

// SCRUM-203: Die Event-Notiz steht im Event-Dokument, das Spieler, Eltern und Medizin-Zugang lesen duerfen.
// Der Trainer muss beim Schreiben sehen, dass dort keine Gesundheitsangaben hingehoeren.
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const copies = async () => {
  const teams = (await readdir(new URL("../outputs/", import.meta.url), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `outputs/${entry.name}/index.html`);
  return ["index.html", ...teams];
};

test("Event-Notiz warnt in jeder App-Kopie: fuer alle Teammitglieder sichtbar, keine Gesundheitsangaben (SCRUM-203)", async () => {
  for (const file of await copies()) {
    const html = await read(file);
    const textarea = html.match(/<textarea id="eventNotes"[^>]*>/)?.[0];
    assert.ok(textarea, `${file}: Notizfeld fehlt`);
    assert.match(textarea, /aria-describedby="eventNotesHint"/, `${file}: Hinweis ist nicht mit dem Feld verknuepft`);
    const hint = html.match(/id="eventNotesHint">([^<]*)</)?.[1] || "";
    assert.match(hint, /Für alle Teammitglieder sichtbar/, `${file}: Hinweis auf Sichtbarkeit fehlt`);
    assert.match(hint, /keine Gesundheitsangaben/, `${file}: Hinweis auf Gesundheitsangaben fehlt`);
  }
});
