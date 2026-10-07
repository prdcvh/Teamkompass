import { TestBed } from '@angular/core/testing';
import { TEAM_DATA_PREFIX } from '../../core/local-data';
import { ThemeService } from '../../core/theme.service';
import { WORKSPACE_KEY } from '../../core/workspace';
import { Settings } from './settings';

describe('Settings (Einstellungen & Datenschutz)', () => {
  beforeEach(() => localStorage.clear());

  async function render() {
    await TestBed.configureTestingModule({ imports: [Settings] }).compileComponents();
    const fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  it('rendert die Bereiche Darstellung, Lokale Daten und Aktivitätsverlauf', async () => {
    const fixture = await render();
    const headings = [...root(fixture).querySelectorAll('.page > tk-card h2')].map((h) => h.textContent);
    expect(headings).toEqual(['Darstellung', 'Lokale Daten', 'Aktivitätsverlauf']);
    expect(root(fixture).textContent).toContain('Noch keine lokalen Aktivitäten protokolliert.');
  });

  it('schaltet den Darkmode um', async () => {
    const fixture = await render();
    const theme = TestBed.inject(ThemeService);
    theme.set(false);
    (root(fixture).querySelector('input[role="switch"]') as HTMLInputElement).click();
    expect(theme.dark()).toBe(true);
    theme.set(false);
  });

  it('speichert die Aufbewahrungsdauer und protokolliert die Änderung', async () => {
    const fixture = await render();
    const select = root(fixture).querySelector('select') as HTMLSelectElement;
    select.value = '180';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    const stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? '{}');
    expect(stored.retentionDays).toBe(180);
    expect(root(fixture).textContent).toContain('Lokale Aufbewahrung auf 180 Tage gesetzt');
  });

  it('löscht lokale Teamdaten erst nach Bestätigung und lässt die Einstellungen stehen', async () => {
    localStorage.setItem(`${TEAM_DATA_PREFIX}players`, '[]');
    const fixture = await render();
    const button = [...root(fixture).querySelectorAll('button')].find((b) => b.textContent?.includes('Zwischenspeicher löschen')) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(localStorage.getItem(`${TEAM_DATA_PREFIX}players`)).not.toBeNull();
    const confirm = [...root(fixture).querySelectorAll('tk-dialog button')].find((b) => b.textContent?.trim() === 'Löschen') as HTMLButtonElement;
    confirm.click();
    fixture.detectChanges();
    expect(localStorage.getItem(`${TEAM_DATA_PREFIX}players`)).toBeNull();
    expect(root(fixture).textContent).toContain('Der lokale Zwischenspeicher wurde gelöscht.');
    expect(root(fixture).textContent).toContain('Lokalen Zwischenspeicher gelöscht');
  });

  it('gibt Verlaufstexte nie als HTML aus', async () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ activity: [{ id: '1', at: '2026-10-01T10:00:00.000Z', action: '<img src=x onerror=alert(1)>' }] }));
    const fixture = await render();
    expect(root(fixture).querySelector('img')).toBeNull();
    expect(root(fixture).textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
