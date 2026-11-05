import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Settings } from './settings';

describe('Settings: Automatische Hinweise (SCRUM-195)', () => {
  let firebase: FakeFirebase;
  async function render(role: 'trainer' | 'player' | 'physio') {
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({ imports: [Settings], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const toggle = (fixture: { nativeElement: unknown }, id: string) => root(fixture).querySelector<HTMLInputElement>(`[data-testid="alert-rule-${id}"]`);

  it('nur Trainer sehen die Schalter; ausschalten speichert in den Teameinstellungen', async () => {
    expect(toggle(await render('physio'), 'pain')).toBeNull();
    TestBed.resetTestingModule();
    expect(toggle(await render('player'), 'pain')).toBeNull();
    TestBed.resetTestingModule();
    const fixture = await render('trainer');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(toggle(fixture, 'pain')?.disabled).toBe(false);
    });
    const ids = ['pain', 'wellness', 'loadSpike', 'consentRevoked', 'openRatings'];
    expect(ids.map((id) => toggle(fixture, id)?.checked)).toEqual([true, true, true, true, true]);
    expect(root(fixture).querySelector('[data-testid="alert-rules"]')?.textContent).toContain('Bitte schau in die App.');
    const input = toggle(fixture, 'openRatings')!;
    input.checked = false;
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(firebase.settings.settings).toEqual({ alertRules: { pain: true, wellness: true, loadSpike: true, consentRevoked: true, openRatings: false } }),
    );
  });
});
