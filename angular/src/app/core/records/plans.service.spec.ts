import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import type { FakeFirebase } from '../testing/fake-firebase';
import { setupRecords } from '../testing/records-setup';
import { emptyPlanDraft } from './plan';

describe('PlansService', () => {
  let firebase: FakeFirebase;

  async function setup(role?: 'trainer' | 'player' | 'physio') {
    const context = await setupRecords(role);
    firebase = context.firebase;
    return context;
  }

  it('legt an, bearbeitet (Selbstreflexion bleibt) und löscht', async () => {
    const { plans } = await setup();
    expect(plans.savePlan({ ...emptyPlanDraft(), focus: 'Mut', goal: 'Mehr 1 gegen 1' })).toEqual({});
    await vi.waitFor(() => expect([...(firebase.records.playerRecords.get('p1/developmentPlans')?.keys() ?? [])].some((id) => id.startsWith('dp') && id !== 'dp1')).toBe(true));
    const saved = [...firebase.records.playerRecords.get('p1/developmentPlans')!.values()].find((data) => data['focus'] === 'Mut')!;
    expect(saved).toMatchObject({ playerId: 'p1', status: 'Offen' });

    firebase.records.playerRecords.get('p1/developmentPlans')!.set('dp1', { ...firebase.records.playerRecords.get('p1/developmentPlans')!.get('dp1'), selfReflection: 'Lief gut' });
    expect(plans.savePlan({ ...emptyPlanDraft(), id: 'dp1', focus: 'Orientierung neu', goal: 'Blick', status: 'Erreicht' })).toEqual({});
    expect(plans.plans().find((plan) => plan.id === 'dp1')).toMatchObject({ focus: 'Orientierung neu', status: 'Erreicht', createdAt: '2026-09-01' });

    expect(await plans.deletePlan('dp1')).toBe(true);
    expect(plans.plans().some((plan) => plan.id === 'dp1')).toBe(false);
    expect(firebase.records.playerRecords.get('p1/developmentPlans')?.has('dp1')).toBe(false);
  });

  it('schreibt bei ungültigen Eingaben nichts', async () => {
    const { plans } = await setup();
    expect(plans.savePlan(emptyPlanDraft())).toMatchObject({ focus: expect.any(String), goal: expect.any(String) });
    expect(firebase.calls.some((call) => call.startsWith('savePlayerRecord'))).toBe(false);
  });

  it('der Spieler schreibt nur seine eigene Selbstreflexion, gekürzt auf 400 Zeichen', async () => {
    const { plans } = await setup('player');
    expect(await plans.saveSelfReflection('dp1', `  ${'x'.repeat(500)}  `)).toBe(true);
    expect(plans.plans()[0].selfReflection).toHaveLength(400);
    expect(plans.plans()[0].selfReflectionAt).not.toBe('');
    expect(firebase.calls).toContain('saveSelfReflection:p1:dp1');
    expect(await plans.saveSelfReflection('gibt-es-nicht', 'x')).toBe(false);
    // Trainer-Funktionen sind für Spieler gesperrt
    expect(plans.savePlan({ ...emptyPlanDraft(), focus: 'a', goal: 'b' }).focus).toContain('Nur Trainer');
  });

  it('ein Trainer nutzt die Selbstreflexion nicht', async () => {
    const { plans } = await setup('trainer');
    expect(await plans.saveSelfReflection('dp1', 'x')).toBe(false);
  });

  it('ein Spieler schreibt nicht in das Profil eines anderen Spielers', async () => {
    const { plans } = await setup('player');
    TestBed.inject(SessionService).playerId.set('p2');
    expect(await plans.saveSelfReflection('dp1', 'x')).toBe(false);
  });
});
