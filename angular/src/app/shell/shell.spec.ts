import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LayoutService } from '../core/layout.service';
import type { Role } from '../core/role';
import { SessionService } from '../core/session.service';
import { routes } from '../app.routes';
import { seasonLabel } from './sidebar/sidebar';
import { App } from '../app';

describe('Shell (in der App)', () => {
  const isMobile = signal(false);

  async function render(role: Role = 'trainer') {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), { provide: LayoutService, useValue: { isMobile } }],
    }).compileComponents();
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/kader');
    await fixture.whenStable();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  beforeEach(() => isMobile.set(false));

  it('zeigt am PC die Sidebar mit allen Bereichen', async () => {
    const root = el(await render());
    expect(root.querySelector('tk-sidebar')).not.toBeNull();
    expect(root.querySelector('tk-tab-bar')).toBeNull();
    const labels = [...root.querySelectorAll('tk-sidebar ul a')].map((a) => a.textContent?.trim());
    expect(labels).toEqual([
      'Dashboard', 'Kader', 'Events', 'Spielerprofile', 'Teamanalyse', 'Gegneranalyse', 'Aufstellung',
    ]);
  });

  it('markiert den aktuellen Bereich in der Sidebar', async () => {
    const root = el(await render());
    const active = root.querySelector('tk-sidebar ul a.active');
    expect(active?.textContent?.trim()).toBe('Kader');
    expect(active?.getAttribute('aria-current')).toBe('page');
  });

  it('zeigt am Handy die Tab-Leiste statt der Sidebar', async () => {
    isMobile.set(true);
    const root = el(await render());
    expect(root.querySelector('tk-sidebar')).toBeNull();
    const tabs = [...root.querySelectorAll('tk-tab-bar a, tk-tab-bar button')].map((a) => a.textContent?.trim());
    expect(tabs).toEqual(['Start', 'Kader', 'Events', 'Profile', 'Mehr']);
    expect(root.querySelector('tk-tab-bar a.active')?.textContent?.trim()).toBe('Kader');
  });

  it('wechselt die Variante live, ohne die Seite neu zu laden', async () => {
    const fixture = await render();
    const root = el(fixture);
    const page = root.querySelector('app-placeholder');
    expect(page).not.toBeNull();
    isMobile.set(true);
    await fixture.whenStable();
    expect(root.querySelector('tk-tab-bar')).not.toBeNull();
    expect(root.querySelector('app-placeholder')).toBe(page);
  });

  it('öffnet das Mehr-Sheet über den Tab „Mehr“', async () => {
    isMobile.set(true);
    const fixture = await render();
    const root = el(fixture);
    const dialog = root.querySelector('tk-more-sheet dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    (root.querySelector('tk-tab-bar button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('tk-more-sheet h2')?.textContent).toBe('Weitere Bereiche');
    expect([...root.querySelectorAll('tk-more-sheet h3')].map((h) => h.textContent)).toEqual([
      'Bereiche', 'Verwaltung', 'App',
    ]);
  });

  it.each<Role>(['player', 'parent', 'medical'])('zeigt %s keine Navigation', async (role) => {
    const root = el(await render(role));
    expect(root.querySelector('tk-sidebar')).toBeNull();
    expect(root.querySelector('tk-tab-bar')).toBeNull();
    expect((root.querySelector('.shell') as HTMLElement).dataset['variant']).toBe('focused');
  });
});

describe('seasonLabel', () => {
  it('beginnt die Saison im Juli', () => {
    expect(seasonLabel(new Date(2026, 9, 1))).toBe('2026 / 27');
    expect(seasonLabel(new Date(2027, 2, 15))).toBe('2026 / 27');
    expect(seasonLabel(new Date(2027, 6, 1))).toBe('2027 / 28');
  });
});
