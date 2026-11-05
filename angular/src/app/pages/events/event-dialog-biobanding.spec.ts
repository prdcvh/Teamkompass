import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import type { TeamEvent } from '../../core/events/event';
import { EventsService } from '../../core/events/events.service';
import { SquadService } from '../../core/player/squad.service';
import { BIO_BANDING_HINT } from '../../core/records/bio-banding';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { EventDialog } from './event-dialog';

/** Bio-Banding in der Leseansicht eines Trainings (SCRUM-191). Heute = 03.11.2026; Jonas (14,5) mit Reifestand, Elias (14,4) ohne Angaben. */
describe('EventDialog: Bio-Banding-Vorschlag (SCRUM-191)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-03T12:00:00') }));
  afterEach(() => vi.useRealTimers());

  const parents = { playerId: 'p1', sex: 'm', parentsConsent: true, motherHeight: 168, fatherHeight: 182, updatedAt: '2026-11-01T10:00:00.000Z' };

  async function render(role: 'trainer' | 'physio' | 'player' | 'scout', type: 'Training' | 'Spiel' = 'Training') {
    const firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'granted' });
    firebase.players.players.set('p2', { name: 'Elias Wagner', positions: ['RV'], number: 2, birthdate: '2012-06-06', status: 'Fit', consentStatus: 'granted' });
    firebase.players.players.set('p3', { name: 'Widerruf Test', positions: ['ST'], number: 3, birthdate: '2012-06-06', status: 'Fit', consentStatus: 'revoked' });
    firebase.events.events.set('e1', { type, title: 'Training Montag', date: '2026-11-02', intensity: 2 });
    firebase.maturity.docs.set('p1', parents);
    firebase.maturity.docs.set('p3', { ...parents, playerId: 'p3' });
    for (const id of ['p1', 'p3']) firebase.records.playerRecords.set(`${id}/measurements`, new Map([['me1', { date: '2026-10-01', height: '178', weight: '60' }]]));
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    const events = TestBed.inject(EventsService);
    events.start();
    TestBed.inject(SquadService).start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    if (role === 'trainer' || role === 'physio') await vi.waitFor(() => expect(TestBed.inject(SquadService).load()).toBe('ready'));
    const fixture = TestBed.createComponent(EventDialog);
    fixture.componentRef.setInput('event', events.events().find((entry) => entry.id === 'e1') as TeamEvent);
    fixture.componentRef.setInput('canEdit', role === 'trainer');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, firebase };
  }

  const section = (fixture: { nativeElement: unknown }) => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-test="bio-banding"]');
  const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('zeigt dem Trainer bei einem Training den Vorschlag mit Hinweistext; nur Spieler mit Reifestand stehen in einer Gruppe', async () => {
    const { fixture } = await render('trainer');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(section(fixture)?.querySelector('.bio-group')).not.toBeNull();
    });
    const content = text(section(fixture));
    expect(content).toContain(BIO_BANDING_HINT);
    const names = [...section(fixture)!.querySelectorAll('.bio-group li')].map((li) => text(li));
    expect(names).toHaveLength(1);
    expect(names[0]).toContain('Jonas Keller');
    expect(section(fixture)!.querySelector('.bio-group[data-band="4"]')?.textContent).toContain('Jonas Keller');
    // Elias hat keine Angaben, Widerruf Test wird nicht geladen.
    expect(content).not.toContain('Elias');
    expect(content).not.toContain('Widerruf');
    expect(text(section(fixture)!.querySelector('[data-test="bio-without"]'))).toContain('Für 2 Spieler');
  });

  it('der Medizin-Rolle wird er ebenfalls gezeigt, Spielern und Scouts nicht (und es wird nichts geladen)', async () => {
    const physio = await render('physio');
    await vi.waitFor(() => {
      physio.fixture.detectChanges();
      expect(section(physio.fixture)?.querySelector('.bio-group')).not.toBeNull();
    });
    TestBed.resetTestingModule();
    for (const role of ['player', 'scout'] as const) {
      const { fixture, firebase } = await render(role);
      expect(section(fixture)).toBeNull();
      expect(firebase.maturity.calls.filter((call) => call.startsWith('readMaturity'))).toEqual([]);
      TestBed.resetTestingModule();
    }
  });

  it('bei einem Spiel gibt es keinen Vorschlag', async () => {
    const { fixture } = await render('trainer', 'Spiel');
    expect(section(fixture)).toBeNull();
  });
});
