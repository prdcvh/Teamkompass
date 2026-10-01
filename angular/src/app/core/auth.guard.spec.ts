import { TestBed } from '@angular/core/testing';
import { type CanActivateChildFn, type CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard, guestGuard, trainerGuard } from './auth.guard';
import type { Role } from './role';
import { SessionService } from './session.service';

describe('Guards', () => {
  let resolve: () => void;
  const status = { value: 'loading' as string };

  beforeEach(() => {
    status.value = 'loading';
    const resolved = new Promise<void>((r) => (resolve = r));
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { whenResolved: () => resolved, status: () => status.value } }],
    });
  });

  const run = (guard: CanActivateFn) => TestBed.runInInjectionContext(() => guard({} as never, {} as never));
  const path = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

  it('authGuard wartet auf den Anmeldezustand, statt vorher etwas freizugeben', async () => {
    let settled = false;
    const pending = Promise.resolve(run(authGuard)).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    status.value = 'signedOut';
    resolve();
    expect(path(await pending)).toBe('/anmelden');
  });

  it('authGuard lässt Angemeldete durch', async () => {
    status.value = 'ready';
    resolve();
    expect(await run(authGuard)).toBe(true);
  });

  it('authGuard sperrt auch, wenn Firebase nicht erreichbar ist', async () => {
    status.value = 'unavailable';
    resolve();
    expect(path(await run(authGuard))).toBe('/anmelden');
  });

  it('guestGuard schickt Angemeldete von der Anmeldeseite weg', async () => {
    status.value = 'ready';
    resolve();
    expect(path(await run(guestGuard))).toBe('/');
    status.value = 'signedOut';
    expect(await run(guestGuard)).toBe(true);
  });

  it.each<[Role | null, boolean]>([
    ['trainer', true],
    ['player', false],
    ['parent', false],
    ['medical', false],
    [null, false],
  ])('trainerGuard für %s: %s', (role, allowed) => {
    TestBed.inject(SessionService).role.set(role);
    const result = TestBed.runInInjectionContext(() => (trainerGuard as CanActivateChildFn)({} as never, {} as never));
    if (allowed) expect(result).toBe(true);
    else expect(path(result)).toBe('/ansicht');
  });
});
