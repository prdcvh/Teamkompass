import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { CLUB_COMPARISON_VERSION } from '../../core/club/club-comparison';
import type { Player } from '../../core/player/player';
import { CurrentTeam } from '../../core/team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { CohortCard } from './cohort-card';

describe('CohortCard (Spieler im Jahrgang des Vereins, SCRUM-197)', () => {
  const doc = (teamName: string, players: unknown[]) => ({
    version: CLUB_COMPARISON_VERSION,
    teamName,
    team: { playerCount: players.length, attendanceRate: null, avgExertion: null, avgGrade: null, trainings: 0, games: 0, focus: {} },
    players,
  });

  async function render(role: 'trainer' | 'player' | 'parent' | 'physio') {
    const firebase = new FakeFirebase();
    firebase.comparison.enabled.add('club-a');
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const current = TestBed.inject(CurrentTeam);
    current.applyMeta({ name: 'U13', label: 'U13', clubId: 'club-a', clubName: 'Verein A', logoUrl: null });
    firebase.comparison.docs.set(
      'club-a',
      new Map([
        [current.id(), doc('U13', [{ id: 'p1', name: 'Ali', birthYear: 2013, average: 2, rated: 4, attendanceRate: 90 }])],
        [
          'other',
          doc('U14', [
            { id: 'x', name: 'Xaver', birthYear: 2013, average: 3, rated: 4, attendanceRate: 70 },
            { id: 'y', name: 'Yasmin', birthYear: 2013, average: 2.5, rated: 4, attendanceRate: 80 },
            { id: 'z', name: 'Zoe', birthYear: 2012, average: 1, rated: 4, attendanceRate: 100 },
          ]),
        ],
      ]),
    );
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.uid.set('u1');
    const fixture = TestBed.createComponent(CohortCard);
    fixture.componentRef.setInput('player', { id: 'p1', name: 'Ali', birthdate: '2013-03-03' } as Player);
    await fixture.whenStable();
    return fixture;
  }

  const text = (fixture: { nativeElement: unknown }) => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';

  it('Trainer: Lage im Jahrgang als Drittel und Prozent – ohne Namen anderer Spieler', async () => {
    const fixture = await render('trainer');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).toContain('Im Jahrgang 2013 im Verein');
    });
    const content = text(fixture);
    expect(content).toContain('2 anderen Spielern');
    expect(content).toContain('oberes Drittel');
    expect(content).toContain('besser als 100 %');
    for (const name of ['Xaver', 'Yasmin', 'Zoe']) expect(content).not.toContain(name);
  });

  for (const role of ['player', 'parent', 'physio'] as const) {
    it(`${role}: sieht nichts`, async () => {
      const fixture = await render(role);
      await new Promise((resolve) => setTimeout(resolve, 20));
      fixture.detectChanges();
      expect(text(fixture).trim()).toBe('');
    });
  }
});
