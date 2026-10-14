import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdateService } from './app-update.service';

function setup(isEnabled = true) {
  const versionUpdates = new Subject<VersionEvent>();
  const unrecoverable = new Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>();
  const checkForUpdate = vi.fn().mockResolvedValue(false);
  TestBed.configureTestingModule({
    providers: [{ provide: SwUpdate, useValue: { isEnabled, versionUpdates, unrecoverable, checkForUpdate } }],
  });
  const service = TestBed.inject(AppUpdateService);
  const reload = vi.spyOn(service, 'reload').mockImplementation(() => undefined);
  return { service, versionUpdates, unrecoverable, checkForUpdate, reload };
}

describe('AppUpdateService', () => {
  it('meldet eine fertig geladene neue Version, lädt aber nicht von selbst neu', () => {
    const { service, versionUpdates, reload } = setup();
    expect(service.ready()).toBe(false);
    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    expect(service.ready()).toBe(false);
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    expect(service.ready()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('lädt sofort neu, wenn der Service Worker die laufende Version nicht mehr ausliefern kann', () => {
    const { unrecoverable, reload } = setup();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'Dateien fehlen' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sucht nach Updates, wenn die App wieder in den Vordergrund kommt', () => {
    const { checkForUpdate } = setup();
    TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
    expect(checkForUpdate).toHaveBeenCalled();
  });

  it('funktioniert auch ganz ohne Service-Worker-Anbindung', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(AppUpdateService).ready()).toBe(false);
  });

  it('bleibt ohne Service Worker (Entwicklung, Tests) still', () => {
    const { service, versionUpdates, checkForUpdate } = setup(false);
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
    expect(service.ready()).toBe(false);
    expect(checkForUpdate).not.toHaveBeenCalled();
  });
});
