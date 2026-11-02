import { type Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { eventFromDoc } from '../../core/events/event';
import { playerFromDoc } from '../../core/player/player';
import { AbsenceSyncService } from '../../core/records/absence-sync.service';
import { addDays, todayIso } from '../../core/shared/dates';
import { LayoutService } from '../../core/shell/layout.service';
import { CurrentTeam } from '../../core/team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { MemberView } from './member-view';
import { RsvpPanel } from './rsvp-panel';

const FOREIGN = 'Xy7Fremd0000Verein01';
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** Spieler p1 mit widerrufener Einwilligung: Spielerdokument gesperrt, bereinigte Karte vorhanden (SCRUM-245). */
function seed(firebase: FakeFirebase, consentStatus: string) {
  firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Verletzt', injuryUntil: '2026-12-01', consentStatus });
  firebase.events.events.set('e1', { type: 'Training', title: 'Training morgen', date: addDays(todayIso(), 1) });
  firebase.records.playerRecords.set('p1/absences', new Map([['ab1', { kind: 'injury', label: 'Zerrung', from: '2026-09-01', to: '2026-12-01', playerId: 'p1' }]]));
  firebase.records.playerRecords.set('p1/developmentPlans', new Map([['dp1', { focus: 'Orientierung', goal: 'Blick heben', status: 'In Arbeit', createdAt: '2026-09-01', playerId: 'p1' }]]));
  if (consentStatus === 'revoked') {
    firebase.players.readablePlayerDocs = new Set();
    firebase.players.cards.set('p1', { playerId: 'p1', name: 'Jonas Keller', number: 1, positions: ['TW'], birthdate: '2012-05-05', consentStatus: 'revoked' });
  }
}

async function render<T>(component: Type<T>, role: Role, consentStatus: string, team = 'U14') {
  const firebase = new FakeFirebase();
  seed(firebase, consentStatus);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile: signal(false) } }],
  });
  TestBed.inject(CurrentTeam).id.set(team);
  const session = TestBed.inject(SessionService);
  session.role.set(role);
  session.playerId.set('p1');
  const fixture = TestBed.createComponent(component);
  const root = fixture.nativeElement as HTMLElement;
  await fixture.whenStable();
  return { fixture, root, firebase };
}

describe('Einwilligung widerrufen: Ansicht für Spieler und Eltern (SCRUM-245)', () => {
  it.each(['player', 'parent'] as const)('%s: Profil aus der bereinigten Karte, keine Gesundheitsdaten abonniert', async (role) => {
    const { fixture, root, firebase } = await render(MemberView, role, 'revoked');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelector('.health-hidden')).not.toBeNull();
      expect(root.querySelector('.block')).not.toBeNull();
    });
    expect(text(root.querySelector('.who'))).toContain('Jonas Keller');
    expect(text(root.querySelector('.who'))).toContain('Gesundheitsangaben ausgeblendet');
    expect(text(root)).not.toContain('Verletzt');
    expect(text(root)).not.toContain('Zerrung');
    expect(text(root)).toContain('Orientierung');
    expect(firebase.calls.some((call) => call.startsWith('watchPlayerRecords:p1:absences'))).toBe(false);
    expect(firebase.calls.some((call) => call.startsWith('watchPlayerRecords:p1:measurements'))).toBe(false);
    expect(root.querySelector('tk-load-report-action button')).toBeNull();
  });

  it('offen: alles wie bisher', async () => {
    const { fixture, root } = await render(MemberView, 'player', 'pending');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(root)).toContain('Zerrung');
    });
    expect(root.querySelector('.health-hidden')).toBeNull();
  });
});

describe('Absagegrund und Einwilligung (SCRUM-245)', () => {
  async function reasonField(consentStatus: string, team = 'U14') {
    const { fixture, root } = await render(RsvpPanel, 'player', consentStatus, team);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelectorAll('.rsvp-item')).toHaveLength(1);
    });
    // Der Kader (eigenes Profil bzw. Karte) muss geladen sein, damit die Einwilligung bekannt ist.
    const { SquadService } = await import('../../core/player/squad.service');
    const squad = TestBed.inject(SquadService);
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    fixture.detectChanges();
    return root.querySelector('input[name="reason"]');
  }

  it('eigenes Team, offen: Grund möglich', async () => {
    expect(await reasonField('pending')).not.toBeNull();
  });

  it('widerrufen: kein Feld für den Grund', async () => {
    expect(await reasonField('revoked')).toBeNull();
  });

  it('fremder Verein: Grund nur mit dokumentierter Einwilligung', async () => {
    expect(await reasonField('pending', FOREIGN)).toBeNull();
    TestBed.resetTestingModule();
    expect(await reasonField('granted', FOREIGN)).not.toBeNull();
  });
});

describe('Automatisches „Fehlt“ ohne Einwilligung (SCRUM-245)', () => {
  function setup(team: string) {
    const firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(CurrentTeam).id.set(team);
    TestBed.inject(SessionService).role.set('trainer');
    const date = addDays(todayIso(), 1);
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date });
    return { firebase, sync: TestBed.inject(AbsenceSyncService), event: eventFromDoc('e1', { type: 'Training', title: 'Training', date }) };
  }
  // Ältere Daten: Status „Verletzt“ im Spielerdokument, Einwilligung offen.
  const injured = playerFromDoc('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Verletzt', injuryUntil: addDays(todayIso(), 10), consentStatus: 'pending' });

  it('fremder Verein: überspringt ohne Fehlermeldung und merkt einen Hinweis für den Trainer', async () => {
    const { firebase, sync, event } = setup(FOREIGN);
    expect(await sync.reconcileEvent(event, [injured])).toBe(0);
    expect(firebase.calls.some((call) => call.startsWith('saveRating'))).toBe(false);
    expect(sync.lockedSkips()).toEqual([{ id: 'p1', name: 'Jonas Keller' }]);
  });

  it('eigenes Team: trägt „Fehlt“ wie bisher ein', async () => {
    const { sync, event } = setup('U14');
    expect(await sync.reconcileEvent(event, [injured])).toBe(1);
    expect(sync.lockedSkips()).toEqual([]);
  });
});
