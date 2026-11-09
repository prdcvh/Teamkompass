import { TestBed } from '@angular/core/testing';
import { SPLASH_MIN_MS, SplashService } from './splash.service';

describe('SplashService', () => {
  let hide: ReturnType<typeof vi.fn>;
  let service: SplashService;

  beforeEach(() => {
    vi.useFakeTimers();
    hide = vi.fn();
    (window as unknown as { tkSplash?: unknown }).tkSplash = { hide };
    service = TestBed.inject(SplashService);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { tkSplash?: unknown }).tkSplash;
  });

  it('blendet sofort aus, wenn die Mindestdauer schon vorbei ist', () => {
    service.markReady(SPLASH_MIN_MS + 500);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('wartet nur die Restzeit bis zur Mindestdauer', () => {
    service.markReady(SPLASH_MIN_MS - 400);
    expect(hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(399);
    expect(hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('blendet nur einmal aus', () => {
    service.markReady(SPLASH_MIN_MS);
    service.markReady(SPLASH_MIN_MS);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('tut nichts, wenn es keinen Begrüßungsbildschirm gibt', () => {
    delete (window as unknown as { tkSplash?: unknown }).tkSplash;
    expect(() => service.markReady(SPLASH_MIN_MS)).not.toThrow();
  });
});
