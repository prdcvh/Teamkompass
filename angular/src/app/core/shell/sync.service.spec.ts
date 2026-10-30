import { TestBed } from '@angular/core/testing';
import { SyncService } from './sync.service';

describe('SyncService Fehlertext', () => {
  it('nennt bei einem Ladefehler das Laden, nicht das Speichern', () => {
    const sync = TestBed.inject(SyncService);
    sync.fail('Das Profil konnte nicht geladen werden.', 'load');
    expect(sync.state()).toBe('error');
    expect(sync.label()).toBe('Laden fehlgeschlagen – erneut versuchen');
    expect(sync.label()).not.toContain('Speichern');
  });

  it('behält bei einem Speicherfehler den bisherigen Text', () => {
    const sync = TestBed.inject(SyncService);
    sync.fail('Termin konnte nicht gespeichert werden.');
    expect(sync.label()).toBe('Speichern fehlgeschlagen – erneut versuchen');
  });

  it('setzt die Fehlerart mit reset zurück', () => {
    const sync = TestBed.inject(SyncService);
    sync.fail('x', 'load');
    sync.reset();
    sync.fail('y');
    expect(sync.label()).toBe('Speichern fehlgeschlagen – erneut versuchen');
  });
});
