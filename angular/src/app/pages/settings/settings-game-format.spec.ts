import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Settings } from './settings';

describe('Settings: Spielform', () => {
  let firebase: FakeFirebase;
  async function render(role: 'trainer' | 'player') {
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({ imports: [Settings], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  describe('Spielform des Teams (SCRUM-187)', () => {
    const select = (fixture: { nativeElement: unknown }) => root(fixture).querySelector<HTMLSelectElement>('[data-testid="game-format"]');

    it('ist nur für Trainer sichtbar, zeigt ohne Wert 11:11 und speichert die Auswahl', async () => {
      expect(select(await render('player'))).toBeNull();
      TestBed.resetTestingModule();
      const fixture = await render('trainer');
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(select(fixture)?.disabled).toBe(false);
      });
      expect(select(fixture)!.options).toHaveLength(5);
      expect(select(fixture)!.value).toBe('11:11');
      select(fixture)!.value = '5:5';
      select(fixture)!.dispatchEvent(new Event('change'));
      await vi.waitFor(() => expect(firebase.settings.settings).toEqual({ gameFormat: '5:5' }));
      fixture.detectChanges();
      expect(select(fixture)!.value).toBe('5:5');
    });
  });
});
