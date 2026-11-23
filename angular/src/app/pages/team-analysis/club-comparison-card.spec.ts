import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { CLUB_COMPARISON_VERSION } from '../../core/club/club-comparison';
import { CurrentTeam } from '../../core/team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { ClubComparisonCard } from './club-comparison-card';

describe('ClubComparisonCard (Vereinsvergleich in der Teamanalyse, SCRUM-197)', () => {
  let firebase: FakeFirebase;

  async function render(enabled: boolean, clubId: string | null = 'club-a') {
    firebase = new FakeFirebase();
    if (enabled) firebase.comparison.enabled.add('club-a');
    firebase.comparison.docs.set(
      'club-a',
      new Map([
        [
          'u15',
          {
            version: CLUB_COMPARISON_VERSION,
            teamName: 'U15',
            team: { playerCount: 18, attendanceRate: 84, avgExertion: 6.2, avgGrade: 2.6, trainings: 30, games: 9, focus: { 'Eigener Ballbesitz': 10, 'Gegnerischer Ballbesitz': 15, Umschalten: 5 } },
            players: [
              { id: 'a', name: '<b>Anna</b>', birthYear: 2011, average: 1.9, rated: 8, attendanceRate: 95 },
              { id: 'b', name: 'Ben', birthYear: 2011, average: 2.4, rated: 8, attendanceRate: 90 },
              { id: 'c', name: 'Cem', birthYear: 2011, average: null, rated: 0, attendanceRate: 60 },
            ],
            updatedAt: { toDate: () => new Date('2026-11-01T10:00:00Z') },
          },
        ],
      ]),
    );
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set('trainer');
    session.uid.set('coach-1');
    TestBed.inject(CurrentTeam).applyMeta({ name: 'U13', label: 'U13', clubId, clubName: 'Verein A', logoUrl: null });
    const fixture = TestBed.createComponent(ClubComparisonCard);
    await fixture.whenStable();
    return fixture;
  }

  const text = (fixture: { nativeElement: unknown }) => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';

  it('zeigt die anderen Teams des Vereins mit Kennzahlen und Schlüsselspielern (Namen nur als Text)', async () => {
    const fixture = await render(true);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('U15');
    });
    const content = text(fixture);
    expect(content).toContain('18');
    expect(content).toContain('84 %');
    expect(content).toContain('6,2');
    expect(content).toContain('2,6');
    expect(content).toContain('Gegnerischer Ballbesitz (50 %)');
    expect(content).toContain('<b>Anna</b>');
    expect(content).toContain('Ben');
    expect(content).not.toContain('Cem');
    expect((fixture.nativeElement as HTMLElement).querySelector('b')).toBeNull();
  });

  it('ausgeschaltet: Hinweis auf den Vereinsadmin, keine Werte', async () => {
    const fixture = await render(false);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('ausgeschaltet');
    });
    expect(text(fixture)).not.toContain('U15');
  });

  it('ohne Verein: Hinweis', async () => {
    const fixture = await render(true, null);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('zu keinem Verein');
    });
  });
});
