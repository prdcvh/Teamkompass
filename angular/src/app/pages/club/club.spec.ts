import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { CLUB_OVERVIEW_VERSION } from '../../core/club/club-overview';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Club } from './club';

describe('Club (Vereinsübersicht, SCRUM-183)', () => {
  let firebase: FakeFirebase;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function render(teamId: string | null = null) {
    firebase = new FakeFirebase();
    firebase.registration.adminClubs = [{ clubId: 'A', name: 'Verein A', logoUrl: null }];
    firebase.club.teams.set('A', [{ teamId: 'T1', name: 'Verein A U9', label: 'U9' }]);
    firebase.club.members.set('T1', [{ id: 'c1', data: { role: 'trainer', email: 'coach@verein.de' } }]);
    firebase.club.overviews.set('T1', {
      version: CLUB_OVERVIEW_VERSION,
      playerCount: 2,
      consentPending: 1,
      consentRevoked: 0,
      players: [
        { id: 'p1', name: 'Ali Adler', number: 9, positions: ['ST'] },
        { id: 'p2', name: 'Bea Berg', number: 1, positions: ['TW'] },
      ],
    });
    firebase.club.events.set('T1', [{ id: 'e1', data: { title: 'Training Dienstag', date: '2026-11-03', type: 'Training' } }]);
    params = new BehaviorSubject(convertToParamMap(teamId ? { teamId } : {}));
    await TestBed.configureTestingModule({
      imports: [Club],
      providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: ActivatedRoute, useValue: { paramMap: params } }],
    }).compileComponents();
    TestBed.inject(SessionService).uid.set('adminA');
    const fixture = TestBed.createComponent(Club);
    return fixture;
  }

  const text = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';

  it('zeigt die Teams mit Trainer, Spielerzahl und offenen Einwilligungen', async () => {
    const fixture = await render();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('Verein A U9');
    });
    expect(text(fixture)).toContain('coach@verein.de');
    expect(text(fixture)).toContain('Einwilligung offen');
    expect(text(fixture)).toContain('Training Dienstag');
  });

  it('Trainer entfernen fragt erst nach', async () => {
    const fixture = await render();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('coach@verein.de');
    });
    const button = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((entry) => entry.textContent?.includes('Entfernen'))!;
    button().click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Wirklich entfernen?');
    expect(firebase.club.calls).not.toContain('remove:T1:c1');
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((entry) => entry.textContent?.includes('Ja, entfernen'))!.click();
    await vi.waitFor(() => expect(firebase.club.calls).toContain('remove:T1:c1'));
  });

  it('Team ansehen: Kader und Termine, Hinweis „nur lesen“, keine Bearbeiten-Knöpfe', async () => {
    const fixture = await render('T1');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('Ali Adler');
    });
    expect(text(fixture)).toContain('nur lesen');
    expect(text(fixture)).toContain('Training Dienstag');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('button')).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('input')).toHaveLength(0);
  });
});
