import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { eventFromDoc } from '../../core/events/event';
import { playerFromDoc } from '../../core/player/player';
import { ratingFromDoc } from '../../core/ratings/rating';
import { buildScoutProfiles } from '../../core/scout/scout-profile';
import { LayoutService } from '../../core/shell/layout.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { MemberView } from './member-view';

/** Aufgeräumte Spieleransicht (SCRUM-403): Spielerkarte zuerst, dann Bereiche; Selteneres eingeklappt. */
async function render(role: Role) {
  const firebase = new FakeFirebase();
  firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'granted' });
  firebase.events.events.set('e1', { type: 'Spiel', title: 'Heimspiel', date: '2026-09-08', goalsFor: 3, goalsAgainst: 1 });
  firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, playerId: 'p1' }]]));
  firebase.records.playerRecords.set('p1/developmentPlans', new Map([['dp1', { focus: 'Orientierung', goal: 'Blick heben', status: 'In Arbeit', createdAt: '2026-09-01', selfReflection: '', coachReview: '' }]]));
  firebase.records.playerRecords.set('p1/absences', new Map([['ab1', { kind: 'absence', label: 'Schule', from: '2026-09-01', to: '2026-09-02', playerId: 'p1' }]]));
  if (role === 'player' || role === 'parent') firebase.players.readablePlayerDocs = new Set(['p1']);
  if (role === 'scout') {
    const players = [...firebase.players.players].map(([id, data]) => playerFromDoc(id, data));
    const events = [...firebase.events.events].map(([id, data]) => eventFromDoc(id, data));
    const ratings = new Map([...firebase.ratings.ratings].map(([eventId, byPlayer]) => [eventId, new Map([...byPlayer].map(([playerId, data]) => [playerId, ratingFromDoc(data)]))]));
    for (const [id, doc] of buildScoutProfiles(players, events, ratings)) firebase.scout.profiles.set(id, JSON.parse(JSON.stringify(doc)) as Record<string, unknown>);
  }
  TestBed.configureTestingModule({
    providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile: signal(true) } }],
  });
  const session = TestBed.inject(SessionService);
  session.role.set(role);
  session.playerId.set(role === 'player' || role === 'parent' ? 'p1' : null);
  const fixture = TestBed.createComponent(MemberView);
  const root = fixture.nativeElement as HTMLElement;
  await fixture.whenStable();
  const settled = (check: () => void) =>
    vi.waitFor(() => {
      TestBed.tick();
      fixture.detectChanges();
      check();
    });
  await settled(() => expect(root.querySelector('.header')).not.toBeNull());
  return { root, settled };
}

const groupIds = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('section.group')].map((group) => group.dataset['group']);
const group = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`section.group[data-group="${name}"]`);
const textOf = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
/** `a` steht im Dokument vor `b`. */
const before = (a: Element | null, b: Element | null) => !!a && !!b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('Spieleransicht aufgeräumt (SCRUM-403)', () => {
  it.each(['player', 'parent'] as const)('%s: Spielerkarte zuerst, dann Diese Woche, Entwicklung, Mitmachen, Rückblick', async (role) => {
    const { root, settled } = await render(role);
    await settled(() => expect(textOf(root)).toContain('Orientierung'));
    expect(groupIds(root)).toEqual(['woche', 'entwicklung', 'mitmachen', 'rueckblick']);
    // Die Spielerkarte steht vor allen Bereichen.
    expect(before(root.querySelector('.header'), group(root, 'woche'))).toBe(true);
    expect(textOf(group(root, 'woche')?.querySelector('.group-title'))).toBe('Diese Woche');
    expect(textOf(group(root, 'entwicklung')?.querySelector('.group-title'))).toBe(role === 'parent' ? 'Entwicklung' : 'Meine Entwicklung');

    // Diese Woche: Zu-/Absage, Selbstauskunft, Serien.
    const week = group(root, 'woche')!;
    for (const selector of ['tk-rsvp-panel', 'tk-self-report-panel', 'tk-streak-panel']) expect(week.querySelector(selector)).not.toBeNull();
    // Entwicklung: Kennzahlen vor Notenverlauf/Kompetenzprofil, dazu Verfügbarkeit und Förderpläne.
    const development = group(root, 'entwicklung')!;
    expect(before(development.querySelector('.cards'), development.querySelector('.columns'))).toBe(true);
    expect(textOf(development)).toContain('Verfügbarkeit');
    expect(textOf(development)).toContain('Förderpläne');
    expect(textOf(development)).toContain('Orientierung');
    expect(textOf(development)).not.toContain('Abwesenheiten und Verletzungen');
    // Mitmachen: Lernpfad, Rätsel, Rangliste.
    const join = group(root, 'mitmachen')!;
    for (const selector of ['tk-learning-panel', 'tk-puzzle-panel', 'app-home-ranking']) expect(join.querySelector(selector)).not.toBeNull();
    expect(week.querySelector('app-home-ranking')).toBeNull();

    // Rückblick: vergangene Termine (SCRUM-402), eigene Angaben und Abwesenheiten/Messwerte – alles eingeklappt.
    const past = group(root, 'rueckblick')!;
    expect(past.querySelector('[data-testid="history-toggle"]')?.getAttribute('aria-expanded')).toBe('false');
    const reports = past.querySelector<HTMLDetailsElement>('details[data-testid="fold-self-reports"]')!;
    const health = past.querySelector<HTMLDetailsElement>('details[data-testid="fold-health"]')!;
    expect(reports.open).toBe(false);
    expect(health.open).toBe(false);
    expect(reports.querySelector('tk-self-report-history')).not.toBeNull();
    expect(textOf(health.querySelector('summary'))).toBe('Abwesenheiten und Messwerte');
    // Nichts geht verloren: Abwesenheit und Messwerte stehen im eingeklappten Teil (nur einmal auf der Seite).
    await settled(() => expect(textOf(health)).toContain('Schule'));
    expect(textOf(health)).toContain('Messwerte');
    expect(textOf(health)).not.toContain('Förderpläne');
    expect(root.querySelectorAll('#absences-title')).toHaveLength(1);
    expect(root.querySelectorAll('#plans-title')).toHaveLength(1);
  });

  it('Sprungleiste: ein Knopf je Bereich, springt zum Bereich, ohne die Seite zu verlassen', async () => {
    const { root } = await render('player');
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-testid="jump-nav"] button')];
    expect(buttons.map((button) => textOf(button))).toEqual(['Diese Woche', 'Entwicklung', 'Mitmachen', 'Rückblick']);
    // Keine #-Links (die würden wegen der Basis-URL die Ansicht verlassen).
    expect(root.querySelector('[data-testid="jump-nav"] a')).toBeNull();
    const target = group(root, 'mitmachen')!;
    const scroll = vi.fn();
    target.scrollIntoView = scroll;
    buttons[2].click();
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.activeElement).toBe(target.querySelector('.group-title'));
  });

  it('Medizin: keine Bereiche und nichts eingeklappt – Abwesenheiten direkt sichtbar', async () => {
    const { root, settled } = await render('physio');
    await settled(() => expect(textOf(root)).toContain('Schule'));
    expect(groupIds(root)).toEqual([]);
    expect(root.querySelector('[data-testid="jump-nav"]')).toBeNull();
    expect(root.querySelector('details[data-testid^="fold-"]')).toBeNull();
    expect(root.querySelector('tk-self-report-history')).not.toBeNull();
    expect(textOf(root)).not.toContain('Förderpläne');
  });

  it('Scout: nur die Entwicklung mit Kennzahlen und Events, ohne Wochen-, Mitmach- und Rückblick-Bereich', async () => {
    const { root, settled } = await render('scout');
    await settled(() => expect(textOf(root)).toContain('Kompetenzprofil'));
    expect(groupIds(root)).toEqual(['entwicklung']);
    const development = group(root, 'entwicklung')!;
    expect(development.querySelector('.group-title')).toBeNull();
    expect(textOf(development)).toContain('Heimspiel');
    expect(before(development.querySelector('.cards'), development.querySelector('.columns'))).toBe(true);
    expect(root.querySelector('[data-testid="jump-nav"]')).toBeNull();
    expect(root.querySelector('tk-profile-extras')).toBeNull();
  });
});
