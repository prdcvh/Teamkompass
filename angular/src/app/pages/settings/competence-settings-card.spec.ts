import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Settings } from './settings';

/** Einstellungen → Entwicklungsraster (SCRUM-266): Bereiche, Gewichte als Hypothese, jede Änderung eine neue Version. */
describe('Settings: Entwicklungsraster', () => {
  let firebase: FakeFirebase;
  async function render(role: 'trainer' | 'player') {
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({ imports: [Settings], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    TestBed.inject(SessionService).role.set(role);
    TestBed.inject(SessionService).uid.set('uid-trainer');
    TestBed.inject(SessionService).displayName.set('Pascal Trainer');
    const fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const el = <T extends HTMLElement>(fixture: { nativeElement: unknown }, id: string) => root(fixture).querySelector<T>(`[data-testid="${id}"]`);
  const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const change = (element: HTMLInputElement | HTMLSelectElement, value: string | boolean, event = 'change') => {
    if (typeof value === 'boolean') (element as HTMLInputElement).checked = value;
    else element.value = value;
    element.dispatchEvent(new Event(event));
  };
  async function ready(fixture: Awaited<ReturnType<typeof render>>) {
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el(fixture, 'competence-profile')).not.toBeNull();
    });
  }

  it('nur für Trainer; Standard Version 0 ohne Index', async () => {
    expect(el(await render('player'), 'competence-settings')).toBeNull();
    TestBed.resetTestingModule();
    const fixture = await render('trainer');
    await ready(fixture);
    expect(text(el(fixture, 'competence-settings'))).toContain('Gültig ist Version 0 (Standard, noch nichts gespeichert)');
    expect(el<HTMLSelectElement>(fixture, 'competence-profile')!.value).toBe('');
    expect(el<HTMLButtonElement>(fixture, 'competence-save')!.disabled).toBe(true);
  });

  it('Profil wählen, Gewicht innerhalb der Grenzen anpassen, Index einschalten → Version 1; jede weitere Änderung → Version 2', async () => {
    const fixture = await render('trainer');
    await ready(fixture);
    change(el<HTMLSelectElement>(fixture, 'competence-profile')!, 'foundation');
    fixture.detectChanges();
    expect(el<HTMLInputElement>(fixture, 'competence-weight-technique')!.value).toBe('30');
    change(el<HTMLInputElement>(fixture, 'competence-weight-technique')!, '40', 'input');
    change(el<HTMLInputElement>(fixture, 'competence-weight-physical')!, '0', 'input');
    change(el<HTMLInputElement>(fixture, 'competence-index-enabled')!, true);
    fixture.detectChanges();
    expect(text(el(fixture, 'competence-weight-sum'))).toBe('Summe: 100 %');
    el<HTMLButtonElement>(fixture, 'competence-save')!.click();
    await vi.waitFor(() => expect(firebase.competence.configs.has('v1')).toBe(true));
    expect(firebase.competence.configs.get('v1')).toMatchObject({
      version: 1, framework: 'raster-1', weightProfile: 'foundation', indexEnabled: true, by: 'Pascal Trainer', byUid: 'uid-trainer',
      weights: { technique: 40, tactics: 20, physical: 0, psychological: 20, social: 20 },
    });

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(el(fixture, 'competence-settings'))).toContain('Gültig ist Version 1');
    });
    change(el<HTMLInputElement>(fixture, 'competence-domain-social')!, false);
    fixture.detectChanges();
    expect(el(fixture, 'competence-weight-social')).toBeNull();
    // Gewichte der übrigen Bereiche werden anteilig vorgeschlagen (Summe 100).
    expect(text(el(fixture, 'competence-weight-sum'))).toBe('Summe: 100 %');
    el<HTMLButtonElement>(fixture, 'competence-save')!.click();
    await vi.waitFor(() => expect(firebase.competence.configs.has('v2')).toBe(true));
    expect(firebase.competence.configs.get('v2')!['domains']).toEqual(['technique', 'tactics', 'physical', 'psychological']);
    // Version 1 bleibt unverändert erhalten.
    expect(firebase.competence.configs.get('v1')!['weights']).toEqual({ technique: 40, tactics: 20, physical: 0, psychological: 20, social: 20 });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelectorAll('[data-testid="competence-history"] li')).toHaveLength(2);
    });
  });

  it('Gewicht außerhalb der Grenzen oder falsche Summe: Fehler, nichts gespeichert', async () => {
    const fixture = await render('trainer');
    await ready(fixture);
    change(el<HTMLSelectElement>(fixture, 'competence-profile')!, 'balanced');
    fixture.detectChanges();
    change(el<HTMLInputElement>(fixture, 'competence-weight-technique')!, '45', 'input');
    fixture.detectChanges();
    el<HTMLButtonElement>(fixture, 'competence-save')!.click();
    fixture.detectChanges();
    const errors = text(el(fixture, 'competence-settings'));
    expect(errors).toContain('Technik: 45 % liegt außerhalb des erlaubten Bereichs 10–30 %.');
    expect(errors).toContain('Die Gewichte ergeben zusammen 125 % statt 100 %.');
    expect(firebase.competence.configs.size).toBe(0);
  });
});
