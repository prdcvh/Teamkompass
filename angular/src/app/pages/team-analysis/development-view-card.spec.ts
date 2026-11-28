import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { MATURITY_BAND_NOTE } from '../../core/records/maturity-note';
import { SquadService } from '../../core/player/squad.service';
import { addDays, todayIso } from '../../core/shared/dates';
import { TeamService } from '../../core/team/team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { DevelopmentViewCard } from './development-view-card';

describe('DevelopmentViewCard (Entwicklungsansicht, SCRUM-258)', () => {
  const today = todayIso();
  // 14,5 Jahre alt: 178 cm / 60 kg → früh entwickelt, 165 / 51 → im Schnitt (Elterngrößen 168/182).
  const birth = (offsetDays = 0) => addDays(today, -Math.round(14.5 * 365.25) + offsetDays);
  const parents = (id: string) => ({ playerId: id, sex: 'm', parentsConsent: true, motherHeight: 168, fatherHeight: 182, updatedAt: new Date().toISOString() });

  async function render(role: 'trainer' | 'physio' | 'player' | 'scout') {
    const firebase = new FakeFirebase();
    const player = (name: string, consentStatus: string, offset: number) => ({ name, positions: ['ST'], number: 9, birthdate: birth(offset), status: 'Fit', consentStatus });
    firebase.players.players.set('p1', player('Früh Eins', 'granted', 0));
    firebase.players.players.set('p2', player('Schnitt Zwei', 'granted', 1));
    firebase.players.players.set('p3', player('Widerruf Drei', 'revoked', 2));
    firebase.players.players.set('p4', player('Ohne Angaben', 'granted', 3));
    firebase.events.events.set('g1', { type: 'Spiel', title: 'Spiel', date: addDays(today, -5), goalsFor: 1, goalsAgainst: 0, intensity: 3 });
    firebase.ratings.ratings.set('g1', new Map([['p1', { playerId: 'p1', attendance: 'present', minutes: 70 }], ['p2', { playerId: 'p2', attendance: 'present', minutes: 20 }], ['p3', { playerId: 'p3', attendance: 'present', minutes: 40 }]]));
    for (const id of ['p1', 'p2', 'p3']) firebase.maturity.docs.set(id, parents(id));
    const measurement = (height: string, weight: string) => new Map([['me1', { date: addDays(today, -10), height, weight }]]);
    firebase.records.playerRecords.set('p1/measurements', measurement('178', '60'));
    firebase.records.playerRecords.set('p2/measurements', measurement('165', '51'));
    firebase.records.playerRecords.set('p3/measurements', measurement('178', '60'));
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    TestBed.inject(SquadService).start();
    if (role === 'trainer') TestBed.inject(TeamService).start();
    const fixture = TestBed.createComponent(DevelopmentViewCard);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, firebase };
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const text = (fixture: { nativeElement: unknown }) => root(fixture).textContent?.replace(/\s+/g, ' ') ?? '';
  const open = async (fixture: { detectChanges: () => void; nativeElement: unknown }) => {
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector<HTMLButtonElement>('[data-testid="development-open"]')).not.toBeNull();
    });
    root(fixture).querySelector<HTMLButtonElement>('[data-testid="development-open"]')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('[data-testid="development-table"]')).not.toBeNull();
    });
  };
  const cell = (fixture: { nativeElement: unknown }, group: string) => [...(root(fixture).querySelector(`tfoot td[data-group="${group}"]`)?.children ?? [])].map((el) => el.textContent?.trim()).join(' ');

  it('lädt nichts, solange die Ansicht nicht geöffnet ist (kein Zugriff auf Reifedaten)', async () => {
    const { fixture, firebase } = await render('trainer');
    expect(text(fixture)).toContain('Entwicklungsansicht öffnen');
    expect(root(fixture).querySelector('[data-testid="development-band-note"]')?.textContent?.trim()).toBe(MATURITY_BAND_NOTE); // SCRUM-385
    expect(firebase.maturity.calls.filter((call) => call.startsWith('readMaturity'))).toEqual([]);
  });

  it('zeigt Spieler und Minuten je Gruppe, Datenabdeckung und Erläuterung; widerrufene Spieler werden nicht berechnet', async () => {
    const { fixture, firebase } = await render('trainer');
    await open(fixture);
    expect(cell(fixture, 'early')).toContain('1 Spieler 70 Min.');
    expect(cell(fixture, 'average')).toContain('1 Spieler 20 Min.');
    // p3 (widerrufen, 40 Min.) und p4 (ohne Angaben) sind „nicht eingeordnet“ – die Reife des widerrufenen Spielers wird nie gelesen.
    expect(cell(fixture, 'unclassified')).toContain('2 Spieler 40 Min.');
    expect(firebase.maturity.calls).not.toContain('readMaturity:p3');
    expect(firebase.records.calls).not.toContain('readPlayerRecords:p3:measurements');
    const coverage = text(fixture);
    expect(coverage).toMatch(/Mit Reifegruppe\s*2 von 4/);
    expect(coverage).toMatch(/Mit Minuten-Eintrag\s*3 von 4/);
    const reasons = [...root(fixture).querySelectorAll('[data-reason]')].map((el) => el.getAttribute('data-reason')).sort();
    expect(reasons).toEqual(['no-inputs', 'revoked']);
    expect(coverage).toContain('kleine Gruppe');
    expect(coverage).toContain('beweist keine Benachteiligung');
    expect(coverage).toContain('Diese Spieler stehen bewusst in keiner Reifegruppe');
  });

  it('weist in der Vergangenheit ausdrücklich „keine historische Einordnung“ aus, statt die heutige Reife zu unterstellen', async () => {
    const { fixture } = await render('trainer');
    await open(fixture);
    const to = root(fixture).querySelector<HTMLInputElement>('[data-testid="development-to"]')!;
    const from = root(fixture).querySelector<HTMLInputElement>('[data-testid="development-from"]')!;
    from.value = addDays(today, -60);
    from.dispatchEvent(new Event('change'));
    to.value = addDays(today, -30);
    to.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root(fixture).querySelector('[data-testid="development-historic"]')).not.toBeNull();
    expect(cell(fixture, 'early')).toContain('0 Spieler');
    expect(cell(fixture, 'unclassified')).toContain('4 Spieler');
    expect(text(fixture)).toContain('keine historische Einordnung vorhanden');
  });

  it('Filterwechsel ändert nur die Auswertung: nichts wird geschrieben, Kader und Bewertungen bleiben gleich', async () => {
    const { fixture, firebase } = await render('trainer');
    await open(fixture);
    const before = JSON.stringify([...firebase.players.players]) + JSON.stringify([...firebase.ratings.ratings].map(([id, map]) => [id, [...map]]));
    const cohort = root(fixture).querySelector<HTMLSelectElement>('[data-testid="development-cohort"]')!;
    cohort.value = '1999';
    cohort.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(text(fixture)).toContain('Keine Spieler in dieser Auswahl');
    const writes = [...firebase.calls, ...firebase.maturity.calls].filter((call) => /^(save|delete|set|update|write|create)/i.test(call));
    expect(writes).toEqual([]);
    expect(JSON.stringify([...firebase.players.players]) + JSON.stringify([...firebase.ratings.ratings].map(([id, map]) => [id, [...map]]))).toBe(before);
  });

  it.each(['physio', 'player', 'scout'] as const)('Rolle %s sieht die Ansicht nicht und liest keine Reifedaten', async (role) => {
    const { fixture, firebase } = await render(role);
    fixture.detectChanges();
    expect(root(fixture).querySelector('[data-testid="development-view"]')).toBeNull();
    expect(text(fixture)).not.toContain('Entwicklungsansicht');
    expect(firebase.maturity.calls.filter((call) => call.startsWith('readMaturity'))).toEqual([]);
  });
});
