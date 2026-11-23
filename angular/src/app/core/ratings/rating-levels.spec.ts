/**
 * SCRUM-188 – Kernzahl Noten: Mit Schulnoten bleibt jede Zahl exakt wie bisher, ein Wechsel der Skala schreibt keine
 * gespeicherte Bewertung um, und Kompetenzstufen rechnen über ihren Schulnoten-Gegenwert mit.
 */
import { eventTeamGrade } from '../analysis/analysis';
import { eventFromDoc } from '../events/event';
import { playerFromDoc } from '../player/player';
import { type EventRating, averageGrade, displayScaleFor, gradedEvents, profileFigures, skillAverages, trendChart } from '../profile/profile';
import { dashboardFigures, leaders } from '../team/team';
import { ratingFromStatsEntry, statsEntry } from '../team/player-stats';
import { BLANK_RATING, GRADE_FIELDS, type Rating, applyChange, calculatedGrade, docFromRating, ratingFromDoc, ratingScaleOf } from './rating';

const TODAY = '2026-10-31';
const events = [
  eventFromDoc('e1', { type: 'Spiel', title: 'Spiel 1', date: '2026-09-01', matchDuration: 70 }),
  eventFromDoc('e2', { type: 'Training', title: 'Training 1', date: '2026-09-03' }),
  eventFromDoc('e3', { type: 'Spiel', title: 'Spiel 2', date: '2026-09-05', matchDuration: 70 }),
  eventFromDoc('e4', { type: 'Training', title: 'Training 2', date: '2026-09-07' }),
];
const grades = (effort: number, technique: number, tactics: number, comprehension: number) => ({ attendance: 'present', effort, technique, tactics, comprehension });

/** Schulnoten-Dokumente wie sie heute in der Datenbank stehen (ohne Feld `scale`). */
const schoolDocs: Record<string, Record<string, Record<string, unknown>>> = {
  p1: { e1: grades(1, 2, 3, 4), e2: grades(2, 2, 2, 2), e3: grades(3, 3, 2, 1), e4: { attendance: 'absent' } },
  p2: { e1: grades(4, 4, 5, 6), e2: grades(1, 1, 1, 2), e3: { ...grades(2, 3, 3, 2), attendance: 'limited' }, e4: { grade: 3 } },
};

function itemsOf(docs: Record<string, Record<string, unknown>>): EventRating[] {
  return events.map((event) => ({ event, rating: docs[event.id] ? ratingFromDoc(docs[event.id]) : null }));
}

describe('Bewertungsskala – Kernzahl Noten (SCRUM-188)', () => {
  describe('Schulnoten: jede Zahl bleibt exakt gleich', () => {
    // Die erwarteten Zahlen stammen aus dem Stand vor SCRUM-188 (gleiche Rechenfunktionen, gleiche Rundung inkl. 2,45 → 2,4).
    it('Gesamtnoten je Event', () => {
      expect(itemsOf(schoolDocs['p1']).map(({ rating }) => (rating ? calculatedGrade(rating) : null))).toEqual([2.3, 2, 2.4, null]);
      expect(itemsOf(schoolDocs['p2']).map(({ rating }) => (rating ? calculatedGrade(rating) : null))).toEqual([4.6, 1.2, 2.6, 3]);
    });

    it('Notenschnitt, Spiel-/Trainingsschnitt, Trend, Entwicklung und bestes Event', () => {
      const p1 = profileFigures(itemsOf(schoolDocs['p1']), TODAY);
      expect([p1.average, p1.gameAverage, p1.trainingAverage, p1.trend, p1.development, p1.best?.grade]).toEqual([2.2, 2.3, 2, -0.4, -0.1, 2]);
      const p2 = profileFigures(itemsOf(schoolDocs['p2']), TODAY);
      expect([p2.average, p2.gameAverage, p2.trainingAverage, p2.trend, p2.development, p2.best?.grade]).toEqual([2.9, 3.6, 2.1, -0.4, 1.6, 1.2]);
    });

    it('Kompetenzprofil (Schnitt je Teilnote)', () => {
      expect(skillAverages(gradedEvents(itemsOf(schoolDocs['p1']))).map((skill) => skill.value)).toEqual([2, 2.3, 2.3, 2.3]);
      expect(skillAverages(gradedEvents(itemsOf(schoolDocs['p2']))).map((skill) => skill.value)).toEqual([2.5, 2.8, 3, 3.3]);
    });

    it('Formkurve, Bestenliste, Teamnote und Event-Durchschnitt', () => {
      const data = ['p1', 'p2'].map((id) => ({
        player: playerFromDoc(id, { name: id, number: id === 'p1' ? 1 : 2 }),
        items: itemsOf(schoolDocs[id]),
        absences: [],
        measurements: [],
      }));
      expect(leaders(data, 5).map((entry) => [entry.player.id, entry.grade, entry.recent, entry.trend])).toEqual([
        ['p1', 2.2, [2.3, 2, 2.4], 'schlechter'],
        ['p2', 2.9, [4.6, 1.2, 2.6, 3], 'gleich'],
      ]);
      expect(dashboardFigures(data, events, TODAY).teamGrade).toBe(2.6);
      const byEvent = new Map(['p1', 'p2'].map((id) => [id, ratingFromDoc(schoolDocs[id]['e1'])]));
      expect(eventTeamGrade(byEvent)).toBe(3.5);
      expect(trendChart(gradedEvents(itemsOf(schoolDocs['p1']))).points.map((point) => point.valueLabel)).toEqual(['2,3', '2,0', '2,4']);
    });

    it('Dokument hin und zurück: kein neues Feld, keine geänderte Zahl', () => {
      for (const docs of Object.values(schoolDocs)) {
        for (const doc of Object.values(docs)) {
          const written = docFromRating(ratingFromDoc(doc));
          expect(written).not.toHaveProperty('scale');
          for (const field of GRADE_FIELDS) if (typeof doc[field] === 'number') expect(written[field]).toBe(doc[field]);
        }
      }
    });

    it('Eingaben ändern sich mit Schulnoten nicht – auch nicht nach einem Wechsel des Teams auf Stufen', () => {
      const existing = ratingFromDoc(grades(2, 3, 4, 5));
      for (const field of GRADE_FIELDS) {
        for (const value of ['', '1', '2', '3', '6', '0', '7', '2.5', '4.5', '1.5', 'x']) {
          expect(applyChange(existing, field, value, 70, 'grades')).toEqual(applyChange(existing, field, value, 70));
          // Bewertung hat schon Schulnoten: sie bleibt in ihrer Skala, auch wenn das Team inzwischen Stufen nutzt.
          expect(applyChange(existing, field, value, 70, 'levels')).toEqual(applyChange(existing, field, value, 70));
        }
      }
      expect(applyChange(existing, 'effort', '4.5', 70).rating.effort).toBeNull();
    });

    it('liest weiterhin nur ganze Schulnoten 1–6 (kein halber Wert außer den Stufenwerten)', () => {
      const parsed = ratingFromDoc({ effort: 2.5, technique: 0, tactics: 7, comprehension: '4' });
      expect([parsed.effort, parsed.technique, parsed.tactics, parsed.comprehension]).toEqual([null, null, null, 4]);
    });
  });

  describe('Kompetenzstufen', () => {
    const levelRating = (values: readonly string[]): Rating => {
      let rating: Rating = { ...BLANK_RATING, attendance: 'present' };
      GRADE_FIELDS.forEach((field, index) => (rating = applyChange(rating, field, values[index], 70, 'levels').rating));
      return rating;
    };

    it('speichert den Schulnoten-Gegenwert und markiert die Bewertung', () => {
      const rating = levelRating(['4.5', '3', '1.5', '3']);
      expect([rating.effort, rating.technique, rating.tactics, rating.comprehension, rating.scale]).toEqual([4.5, 3, 1.5, 3, 'levels']);
      expect(docFromRating(rating)).toMatchObject({ effort: 4.5, technique: 3, tactics: 1.5, comprehension: 3, scale: 'levels', grade: 3.1 });
      // Nur Stufenwerte sind gültig.
      expect(applyChange(rating, 'effort', '2', 70, 'levels').rating.effort).toBeNull();
    });

    it('Gesamtnote und Schnitt rechnen mit 4,5 / 3 / 1,5', () => {
      expect(calculatedGrade(levelRating(['1.5', '1.5', '1.5', '1.5']))).toBe(1.5);
      expect(calculatedGrade(levelRating(['4.5', '4.5', '4.5', '4.5']))).toBe(4.5);
      // 4,5*0,3 + 3*0,3 + 1,5*0,25 + 3*0,15 = 3,075 → 3,1
      expect(calculatedGrade(levelRating(['4.5', '3', '1.5', '3']))).toBe(3.1);
      const items: EventRating[] = [
        { event: events[0], rating: levelRating(['3', '3', '3', '3']) },
        { event: events[1], rating: levelRating(['1.5', '1.5', '1.5', '1.5']) },
      ];
      expect(averageGrade(gradedEvents(items))).toBe(2.3);
      expect(displayScaleFor(items, 'grades')).toBe('levels');
      expect(trendChart(gradedEvents(items), 'levels').points.map((point) => point.valueLabel)).toEqual(['kann es', 'kann es sicher']);
      expect(trendChart(gradedEvents(items), 'levels').grid.map((line) => line.label)).toEqual(['lernt', 'kann', 'sicher']);
    });

    it('bleibt nach dem Speichern und über die Zusammenfassung je Spieler lesbar', () => {
      const rating = levelRating(['4.5', '3', '1.5', '3']);
      const reread = ratingFromDoc(docFromRating(rating));
      expect(reread).toEqual(rating);
      expect(ratingScaleOf(reread, 'grades')).toBe('levels');
      // Die Zusammenfassung trägt keine Skala, aber dieselben Zahlen (Übersichten rechnen identisch).
      const fromStats = ratingFromStatsEntry(statsEntry(rating));
      expect(calculatedGrade(fromStats)).toBe(calculatedGrade(rating));
    });

    it('ein Wechsel zurück auf Schulnoten verändert bestehende Stufen nicht; eine leere Bewertung nimmt die neue Skala', () => {
      const rating = levelRating(['4.5', '3', '1.5', '3']);
      const edited = applyChange(rating, 'effort', '1.5', 70, 'grades').rating;
      expect([edited.effort, edited.scale]).toEqual([1.5, 'levels']);
      const cleared = applyChange(rating, 'attendance', 'absent', 70, 'grades').rating;
      const regraded = applyChange({ ...cleared, attendance: 'present' }, 'effort', '2', 70, 'grades').rating;
      expect([regraded.effort, regraded.scale]).toEqual([2, 'grades']);
      expect(docFromRating(regraded)['scale']).toBe('grades');
    });
  });
});
