import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, provideRouter, Router, RouterOutlet, type Route, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import type { Role } from './core/auth/role';
import { SessionService } from './core/auth/session.service';
import { Shell } from './shell/shell';

/**
 * Router-Regressionstests mit dem echten Routenbaum und den echten Guards (SCRUM-224). Nur die Seiten werden durch
 * Platzhalter ersetzt, damit kein Firebase nötig ist; Anmeldung und Rolle kommen aus gemockten Diensten.
 */
@Component({ selector: 'tk-stub-shell', imports: [RouterOutlet], template: '<p>SHELL</p><router-outlet />' })
class StubShell {}

@Component({ selector: 'tk-stub-page', template: '<p>PAGE</p>' })
class StubPage {}

/** Echte Routen, aber Seiten → Platzhalter (Shell bleibt erkennbar, damit „ohne Shell“ prüfbar ist). */
function withStubs(list: Routes): Routes {
  return list.map((route): Route => {
    const copy: Route = { ...route };
    if (copy.component === Shell) copy.component = StubShell;
    if (copy.loadComponent) {
      delete copy.loadComponent;
      copy.component = StubPage;
    }
    if (copy.children) copy.children = withStubs(copy.children);
    return copy;
  });
}

describe('App-Routen (SCRUM-224)', () => {
  const state = { status: 'ready', role: 'trainer' as Role | null };

  async function open(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(withStubs(routes)),
        { provide: AuthService, useValue: { whenResolved: () => Promise.resolve(), status: () => state.status } },
      ],
    });
    TestBed.inject(SessionService).role.set(state.role);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const router = TestBed.inject(Router);
    return { harness, router, text: (harness.routeNativeElement?.textContent ?? '').trim() };
  }

  function leaf(router: Router): ActivatedRouteSnapshot {
    let node: ActivatedRouteSnapshot = router.routerState.snapshot.root;
    while (node.firstChild) node = node.firstChild;
    return node;
  }

  /** Pfad der tiefsten aktiven Route, z. B. „events/:id/live“. */
  function leafPath(router: Router): string {
    return leaf(router).pathFromRoot.map((node) => node.routeConfig?.path).filter(Boolean).join('/');
  }

  beforeEach(() => {
    state.status = 'ready';
    state.role = 'trainer';
  });

  it('„/“ führt den angemeldeten Trainer zur Startseite in der Shell statt zu einer leeren Seite', async () => {
    const { router, text } = await open('/');
    expect(router.url).toBe('/start');
    expect(text).toContain('SHELL');
    expect(text).toContain('PAGE');
  });

  it('„/“ führt Spieler, Eltern, Medizin und Scouts zu ihrer Ansicht', async () => {
    state.role = 'player';
    const { router, text } = await open('/');
    expect(router.url).toBe('/ansicht');
    expect(text).toContain('PAGE');
  });

  it('„/“ ohne Anmeldung führt zur Anmeldeseite', async () => {
    state.status = 'signedOut';
    state.role = null;
    const { router, text } = await open('/');
    expect(router.url).toBe('/anmelden');
    expect(text).toContain('PAGE');
  });

  it('„/start“ bleibt direkt erreichbar', async () => {
    const { router, text } = await open('/start');
    expect(router.url).toBe('/start');
    expect(text).toContain('SHELL');
    expect(text).toContain('PAGE');
  });

  it('„/events/:id/live“ öffnet den Live-Modus ohne Shell', async () => {
    const { router, text } = await open('/events/abc/live');
    expect(router.url).toBe('/events/abc/live');
    expect(leafPath(router)).toBe('events/:id/live');
    // Die Live-Seite liest die Event-Kennung von ihrer eigenen Route.
    expect(leaf(router).paramMap.get('id')).toBe('abc');
    expect(text).toContain('PAGE');
    expect(text).not.toContain('SHELL');
  });

  it('Live-Modus bleibt nur für Trainer: andere Rollen landen in ihrer Ansicht', async () => {
    state.role = 'player';
    const { router } = await open('/events/abc/live');
    expect(router.url).toBe('/ansicht');
  });

  it('Live-Modus ohne Anmeldung führt zur Anmeldeseite', async () => {
    state.status = 'signedOut';
    state.role = null;
    const { router } = await open('/events/abc/live');
    expect(router.url).toBe('/anmelden');
  });

  it('„/events/:id“ (Bewertung) bleibt in der Shell', async () => {
    const { router, text } = await open('/events/abc');
    expect(router.url).toBe('/events/abc');
    expect(text).toContain('SHELL');
  });
});
