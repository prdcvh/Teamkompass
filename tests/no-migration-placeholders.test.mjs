import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// SCRUM-292: Die Angular-Migration hinterlässt Platzhalter wie
// `$safeNavigationMigration(...)` in Templates; sie existieren in keiner
// Komponente und brechen den Build (TS2339).
function templates(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...templates(path));
    else if (name.endsWith('.html')) out.push(path);
  }
  return out;
}

test('keine Angular-Migrationsplatzhalter ($...Migration) in Templates (SCRUM-292)', () => {
  const root = new URL('../angular/src/app', import.meta.url).pathname;
  const files = templates(root);
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /\$\w*Migration\b/, file);
  }
});

test('Spielerauswahl bindet den ausgewählten Spieler nullsicher (SCRUM-292)', () => {
  for (const page of ['member-view/member-view.html', 'profile/profile.html']) {
    const html = readFileSync(new URL(`../angular/src/app/pages/${page}`, import.meta.url), 'utf8');
    assert.match(html, /\[value\]="player\(\)\?\.id \?\? ''"/, page);
  }
});
