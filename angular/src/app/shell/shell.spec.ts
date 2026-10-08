import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { LayoutService } from '../core/layout.service';
import { ADMIN_ITEMS } from '../core/navigation';
import { ThemeService } from '../core/theme.service';
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
      providers: [
        provideRouter(routes),
        { provide: LayoutService, useValue: { isMobile } },
        { provide: AuthService, useValue: { whenResolved: () => Promise.resolve(), status: () => 'ready' } },
      ],
    }).compileComponents();
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/export');
    await fixture.whenStable();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  beforeEach(() => isMobile.set(false));

  it('zeigt am PC die Sidebar mit allen Bereichen', async () => {
    const root = el(await render());
    expect(root.querySelector('tk-sidebar')).not.toBeNull();
    expect(root.querySelector('tk-tab-bar')).toBeNull();
    const labels = [...root.querySelectorAll('tk-sidebar ul.main a')].map((a) => a.textContent?.trim());
    expect(labels).toEqual([
      'Dashboard', 'Kader', 'Events', 'Spielerprofile', 'Teamanalyse', 'Gegneranalyse', 'Aufstellung',
    ]);
  });

  it('zeigt am PC auch Verwaltung und App-Einträge, dieselben wie am Handy', async () => {
    const root = el(await render());
    const admin = [...root.querySelectorAll('tk-sidebar ul.admin a')].map((a) => a.textContent?.trim());
    expect(admin).toEqual(ADMIN_ITEMS.map((item) => item.label));
    const app = [...root.querySelectorAll('tk-sidebar ul.app a, tk-sidebar ul.app label')].map((a) => a.textContent?.replace(/\s+/g, ' ').trim());
    expect(app).toEqual(['Einstellungen & Datenschutz', 'Darkmode', 'Abmelden']);
  });

  it('schaltet den Darkmode am PC um', async () => {
    const fixture = await render();
    const root = el(fixture);
    const theme = TestBed.inject(ThemeService);
    theme.set(false);
    const toggle = root.querySelector('tk-sidebar input[role="switch"]') as HTMLInputElement;
    toggle.click();
    expect(theme.dark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    theme.set(false);
  });

  it('lässt die Sidebar bei kleiner Fensterhöhe scrollen', async () => {
    const root = el(await render());
    const nav = root.querySelector('tk-sidebar nav') as HTMLElement;
    expect(getComputedStyle(nav).overflowY).toBe('auto');
  });

  it('erreicht die Einstellungen über die Sidebar', async () => {
    const fixture = await render();
    const root = el(fixture);
    (root.querySelector('tk-sidebar ul.app a') as HTMLAnchorElement).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(root.querySelector('app-settings')).not.toBeNull());
  });

  it('nennt bei noch nicht gebauten Bereichen das Ticket', async () => {
    const root = el(await render());
    expect(root.querySelector('app-placeholder')?.textContent).toContain('SCRUM-75');
  });

  it('markiert den aktuellen Bereich in der Sidebar', async () => {
    const root = el(await render());
    const active = root.querySelector('tk-sidebar a.active');
    expect(active?.textContent?.trim()).toBe('Daten exportieren');
    expect(active?.getAttribute('aria-current')).toBe('page');
  });

  it('zeigt am Handy die Tab-Leiste statt der Sidebar', async () => {
    isMobile.set(true);
    const root = el(await render());
    expect(root.querySelector('tk-sidebar')).toBeNull();
    const tabs = [...root.querySelectorAll('tk-tab-bar a, tk-tab-bar button')].map((a) => a.textContent?.trim());
    expect(tabs).toEqual(['Start', 'Kader', 'Events', 'Profile', 'Mehr']);
    expect(root.querySelector('tk-tab-bar a.active')).toBeNull(); // der Export liegt unter „Mehr“, kein Tab ist aktiv
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
