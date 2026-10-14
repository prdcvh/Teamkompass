import { TestBed } from '@angular/core/testing';
import { LayoutService, MOBILE_MAX_WIDTH } from './layout.service';

class FakeQuery {
  listeners = new Set<(event: MediaQueryListEvent) => void>();
  constructor(public matches: boolean) {}
  addEventListener(_: string, listener: (event: MediaQueryListEvent) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_: string, listener: (event: MediaQueryListEvent) => void) {
    this.listeners.delete(listener);
  }
  change(matches: boolean) {
    this.matches = matches;
    this.listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
  }
}

describe('LayoutService', () => {
  let query: FakeQuery;
  let requested: string;

  function setup(matches: boolean) {
    query = new FakeQuery(matches);
    vi.stubGlobal('matchMedia', (media: string) => {
      requested = media;
      return query;
    });
    return TestBed.inject(LayoutService);
  }

  afterEach(() => vi.unstubAllGlobals());

  it('startet mit der zur Breite passenden Variante', () => {
    expect(setup(true).isMobile()).toBe(true);
  });

  it('nutzt denselben Umbruch wie die bisherige App', () => {
    setup(false);
    expect(requested).toBe(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    expect(MOBILE_MAX_WIDTH).toBe(720);
  });

  it('wechselt live beim Ändern der Fensterbreite', () => {
    const service = setup(false);
    expect(service.isMobile()).toBe(false);
    query.change(true);
    expect(service.isMobile()).toBe(true);
    query.change(false);
    expect(service.isMobile()).toBe(false);
  });

  it('entfernt den Listener beim Zerstören', () => {
    setup(false);
    expect(query.listeners.size).toBe(1);
    TestBed.resetTestingModule();
    expect(query.listeners.size).toBe(0);
  });
});
