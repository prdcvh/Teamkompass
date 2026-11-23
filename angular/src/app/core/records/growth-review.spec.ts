import { docFromGrowthReview, growthReviewFromDoc, reviewFor, validateGrowthReview } from './growth-review';

/** Trainerprüfung „Wachstum und Belastung“ als Notiz am Förderplan (SCRUM-257). */
describe('growth-review', () => {
  const TODAY = '2026-10-20';

  it('verlangt Förderplan, gültiges Datum (nicht in der Zukunft) und eine Maßnahme', () => {
    expect(validateGrowthReview({ planId: 'dp1', date: TODAY, action: 'Umfang reduziert' }, ['dp1'], TODAY)).toEqual({});
    const errors = validateGrowthReview({ planId: 'weg', date: '2026-10-21', action: '  ' }, ['dp1'], TODAY);
    expect(Object.keys(errors).sort()).toEqual(['action', 'date', 'planId']);
    expect(validateGrowthReview({ planId: 'dp1', date: '20.10.2026', action: 'x' }, ['dp1'], TODAY).date).toBeDefined();
    expect(validateGrowthReview({ planId: 'dp1', date: TODAY, action: 'x'.repeat(401) }, ['dp1'], TODAY).action).toContain('400');
  });

  it('Dokument hin und zurück; unvollständige Dokumente werden verworfen', () => {
    const review = { id: 'gr1', planId: 'dp1', hintKey: 'growthLoad:p1:a>b', date: TODAY, by: 'Trainer', byUid: 'u1', action: 'Umfang reduziert', createdAt: '2026-10-20T18:00:00.000Z' };
    expect(docFromGrowthReview(review)).not.toHaveProperty('id');
    expect(growthReviewFromDoc('gr1', docFromGrowthReview(review))).toEqual(review);
    expect(growthReviewFromDoc('gr2', { planId: 'dp1', date: TODAY })).toBeNull();
  });

  it('gilt erst ab dem Datum der Prüfung und nur für dieselbe Kennung', () => {
    const review = { id: 'gr1', planId: 'dp1', hintKey: 'k1', date: '2026-10-10', by: '', byUid: '', action: 'a', createdAt: '' };
    expect(reviewFor([review], 'k1', '2026-10-09')).toBeNull();
    expect(reviewFor([review], 'k1', '2026-10-10')).toBe(review);
    expect(reviewFor([review], 'k2', TODAY)).toBeNull();
    expect(reviewFor(null, 'k1', TODAY)).toBeNull();
  });
});
