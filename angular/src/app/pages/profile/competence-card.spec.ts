import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import type { FakeFirebase } from '../../core/testing/fake-firebase';
import { clickByText, q, qa, renderProfile, settle, text, typeInto } from './testing/profile-fixture';

/** Entwicklungsraster im Spielerprofil (SCRUM-266): getrennt von den Eventnoten, „nicht erhoben“, Index nur mit Grundlage. */
describe('Profil: Entwicklungsraster', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-23T12:00:00') }));
  afterEach(() => vi.useRealTimers());

  const observation = (criterionId: string, value: number, date: string) => ({
    playerId: 'p1', framework: 'raster-1', criterionId, value, date, occasion: 'training', eventId: null, position: null,
    source: 'trainer', note: '', by: 'Trainer', byUid: 'uid-trainer', createdAt: `${date}T18:00:00.000Z`,
  });
  const withObservations = (entries: ReturnType<typeof observation>[]) => (firebase: FakeFirebase) => {
    firebase.competence.observations.set('p1', new Map(entries.map((entry, index) => [`o${index}`, entry])));
  };
  /** Je Bereich zwei Kriterien an zwei Tagen. */
  const covered = [
    'technique.firstTouch', 'technique.passing', 'tactics.scanning', 'tactics.decision', 'physical.speed', 'physical.coordination',
    'psychological.afterMistake', 'psychological.focus', 'social.communication', 'social.support',
  ].map((id, index) => observation(id, id.startsWith('technique.') ? 4 : 2, index % 2 ? '2026-11-10' : '2026-11-01'));
  const withConfig = (firebase: FakeFirebase) => {
    firebase.competence.configs.set('v1', {
      version: 1, framework: 'raster-1', domains: ['technique', 'tactics', 'physical', 'psychological', 'social'], weightProfile: 'foundation',
      weights: { technique: 30, tactics: 20, physical: 10, psychological: 20, social: 20 }, indexEnabled: true,
      createdAt: '2026-11-01T10:00:00.000Z', by: 'Trainer', byUid: 'uid-trainer',
    });
  };
  const domainState = (fixture: Parameters<typeof q>[0]) => Object.fromEntries(qa(fixture, '[data-testid="competence-card"] [data-domain]').map((li) => [li.getAttribute('data-domain'), text(li.querySelector('.value'))]));

  it('bisherige Eventnoten heißen „Eventnoten im Schnitt“ und bleiben unverändert; das Raster steht getrennt daneben', async () => {
    const { fixture } = await renderProfile();
    await settle(fixture);
    expect(text(q(fixture, '[data-testid="legacy-model-note"]'))).toContain('Eventnoten (bisheriges Modell)');
    const legacy = qa(fixture, '.bars')[0];
    expect([...legacy.querySelectorAll('.bar')].map((bar) => bar.getAttribute('aria-label'))).toEqual(['Einsatz gut (2,0)', 'Fehlerquote gut (2,0)', 'Spielwirkung gut (2,0)', 'Lernfähigkeit gut (2,0)']);
    // Ohne Beobachtung: jeder Bereich „nicht erhoben“, obwohl es Eventnoten gibt (keine Umrechnung, keine 0).
    expect(domainState(fixture)).toEqual({
      technique: 'nicht erhoben', tactics: 'nicht erhoben', physical: 'nicht erhoben', psychological: 'nicht erhoben', social: 'nicht erhoben',
    });
    expect(q(fixture, '[data-testid="competence-card"] .bar')).toBeNull();
    expect(q(fixture, '[data-testid="competence-index"]')).toBeNull(); // Index standardmäßig aus
  });

  it('beobachtete Bereiche mit Stufe und Abdeckung; nur ein Tag = Momentaufnahme', async () => {
    const { fixture } = await renderProfile({ setup: withObservations([observation('technique.passing', 3, '2026-11-20'), observation('tactics.decision', 2, '2026-11-20')]) });
    await settle(fixture);
    expect(domainState(fixture)).toMatchObject({ technique: 'überwiegend „zeigt es meistens“', tactics: 'überwiegend „zeigt es manchmal“', physical: 'nicht erhoben' });
    expect(text(q(fixture, '[data-domain="technique"]'))).toContain('1 von 3 Kriterien · 1 Beobachtung(en) · zuletzt 20.11.2026');
    expect(text(q(fixture, '[data-testid="competence-snapshot"]'))).toContain('nur eine Momentaufnahme');
    expect(text(q(fixture, '[data-testid="competence-basis"]'))).toContain('Aus 2 Beobachtung(en) an 1 Tag(en)');
  });

  it('Gesamtindex nur mit ausreichender Abdeckung – mit Gewichten, Version und Datengrundlage', async () => {
    const { fixture } = await renderProfile({ setup: (firebase) => { withConfig(firebase); withObservations(covered)(firebase); } });
    await settle(fixture);
    const index = text(q(fixture, '[data-testid="competence-index"]'));
    expect(index).toContain('Gesamtindex (optional): 2,6 von 4');
    expect(index).toContain('Technik 30 %, Taktik und Entscheidung 20 %, Physis 10 %');
    expect(index).toContain('Einstellung Version 1 · Hypothese Grundlagenbereich (bis U13) (Hypothese, nicht wissenschaftlich festgelegt) · Raster raster-1');
    expect(index).toContain('Grundlage: 10 Beobachtung(en) an 2 Tag(en)');
    expect(index).toContain('kein Talentwert');
  });

  it('zu wenig Daten: „Kein Gesamtindex“ mit Grund', async () => {
    const { fixture } = await renderProfile({ setup: (firebase) => { withConfig(firebase); withObservations(covered.filter((entry) => !entry.criterionId.startsWith('physical.')))(firebase); } });
    await settle(fixture);
    const index = text(q(fixture, '[data-testid="competence-index"]'));
    expect(index).toContain('Kein Gesamtindex');
    expect(index).toContain('Physis: erst 0 von 3 Kriterien beobachtet (mindestens 2).');
  });

  it('Beobachtung eintragen: ein Dokument je eingestuftem Kriterium, mit Trainer, Tag und Anlass', async () => {
    const { fixture, firebase } = await renderProfile();
    TestBed.inject(SessionService).displayName.set('Pascal Trainer');
    await settle(fixture);
    clickByText(fixture, '[data-testid="competence-card"] button', '+ Beobachtung');
    await settle(fixture);
    const dialog = q(fixture, 'tk-competence-observation-dialog')!;
    typeInto(dialog.querySelector<HTMLSelectElement>('[data-testid="observation-event"]')!, 'e2', 'change');
    typeInto(dialog.querySelector<HTMLSelectElement>('[data-testid="observation-position"]')!, 'TW', 'change');
    typeInto(dialog.querySelector<HTMLSelectElement>('[data-criterion="tactics.scanning"]')!, '3', 'change');
    typeInto(dialog.querySelector<HTMLSelectElement>('[data-criterion="social.communication"]')!, '4', 'change');
    dialog.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(firebase.competence.observations.get('p1')?.size).toBe(2);
    });
    const saved = [...firebase.competence.observations.get('p1')!.values()];
    expect(saved[0]).toMatchObject({ playerId: 'p1', framework: 'raster-1', criterionId: 'tactics.scanning', value: 3, date: '2026-09-08', occasion: 'match', eventId: 'e2', position: 'TW', source: 'trainer', by: 'Pascal Trainer', byUid: 'uid-trainer' });
    await settle(fixture);
    expect(domainState(fixture)).toMatchObject({ tactics: 'überwiegend „zeigt es meistens“', social: 'überwiegend „zeigt es sicher“', technique: 'nicht erhoben' });
  });

  it('ohne Einstufung wird nichts gespeichert', async () => {
    const { fixture, firebase } = await renderProfile();
    await settle(fixture);
    clickByText(fixture, '[data-testid="competence-card"] button', '+ Beobachtung');
    await settle(fixture);
    q(fixture, 'tk-competence-observation-dialog form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(text(q(fixture, 'tk-competence-observation-dialog'))).toContain('Bitte mindestens ein Kriterium einstufen');
    expect(firebase.competence.observations.get('p1')).toBeUndefined();
  });

  it('widerrufene Einwilligung: keine neue Beobachtung', async () => {
    const { fixture } = await renderProfile({ id: 'p2', consent: 'revoked' });
    await settle(fixture);
    expect(q(fixture, '[data-testid="competence-add"]')).toBeNull();
    expect(text(q(fixture, '[data-testid="competence-card"]'))).toContain('Einwilligung widerrufen');
  });

  it('nur für Trainer', async () => {
    const { fixture, firebase } = await renderProfile({ setup: withObservations(covered) });
    await settle(fixture);
    expect(q(fixture, '[data-testid="competence-card"]')).not.toBeNull();
    TestBed.inject(SessionService).role.set('physio');
    await settle(fixture);
    expect(q(fixture, '[data-testid="competence-card"]')).toBeNull();
    expect(firebase.calls).toContain('watchCompetenceObservations:p1');
  });
});
