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

  describe('Teamziel Check-ins (SCRUM-194)', () => {
    const input = (fixture: { nativeElement: unknown }) => root(fixture).querySelector<HTMLInputElement>('[data-testid="check-in-goal"]');

    it('ist nur für Trainer sichtbar, speichert eine ganze Zahl und lehnt Ungültiges ab', async () => {
      expect(input(await render('player'))).toBeNull();
      TestBed.resetTestingModule();
      const fixture = await render('trainer');
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(input(fixture)?.disabled).toBe(false);
      });
      const enter = (value: string) => {
        input(fixture)!.value = value;
        input(fixture)!.dispatchEvent(new Event('change'));
      };
      enter('120');
      await vi.waitFor(() => expect(firebase.settings.settings).toEqual({ checkInGoal: 120 }));
      enter('0');
      fixture.detectChanges();
      expect(input(fixture)!.value).toBe('120'); // ungültig: springt auf den gespeicherten Stand zurück
      expect(firebase.settings.settings).toEqual({ checkInGoal: 120 });
    });
  });
});
