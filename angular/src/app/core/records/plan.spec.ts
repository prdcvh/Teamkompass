import { emptyPlanDraft, planFromDoc, planFromDraft, validatePlan } from './plan';

describe('Förderplan', () => {
  it('verlangt Schwerpunkt und Ziel und begrenzt die Längen', () => {
    expect(Object.keys(validatePlan(emptyPlanDraft())).sort()).toEqual(['focus', 'goal']);
    const ok = { ...emptyPlanDraft(), focus: 'Orientierung', goal: 'Blick vor dem Ball' };
    expect(validatePlan(ok)).toEqual({});
    expect(validatePlan({ ...ok, focus: 'x'.repeat(51) }).focus).toContain('50');
    expect(validatePlan({ ...ok, goal: 'x'.repeat(91) }).goal).toContain('90');
    expect(validatePlan({ ...ok, coachReview: 'x'.repeat(401) }).coachReview).toContain('400');
    expect(validatePlan({ ...ok, dueDate: '2026-13-01' }).dueDate).toBeTruthy();
  });

  it('behält beim Bearbeiten Selbstreflexion und Anlegedatum', () => {
    const existing = planFromDoc('dp1', { focus: 'a', goal: 'b', selfReflection: 'Lief gut', selfReflectionAt: '2026-10-01T10:00:00Z', createdAt: '2026-09-01', status: 'In Arbeit' }, '2026-10-10');
    const next = planFromDraft({ ...emptyPlanDraft(), id: 'dp1', focus: ' Neu ', goal: 'Ziel', status: 'Erreicht' }, 'dp1', existing, '2026-10-10');
    expect(next).toMatchObject({ focus: 'Neu', selfReflection: 'Lief gut', selfReflectionAt: '2026-10-01T10:00:00Z', createdAt: '2026-09-01', status: 'Erreicht' });
    expect(planFromDraft({ ...emptyPlanDraft(), focus: 'a', goal: 'b' }, 'dp2', undefined, '2026-10-10').createdAt).toBe('2026-10-10');
  });

  it('liest unvollständige Dokumente mit Standardwerten', () => {
    expect(planFromDoc('x', { status: 'unbekannt' }, '2026-10-10')).toMatchObject({ status: 'Offen', createdAt: '2026-10-10', focus: '', selfReflection: '' });
  });
});
