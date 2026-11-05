import type { TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import type { EventRating } from '../profile/profile';
import { BLANK_RATING, type Rating } from '../ratings/rating';
import type { WellnessEntry } from '../self-report/self-report';
import { addDays } from '../shared/dates';
import {
  ALERT_EMAIL_SUBJECT,
  ALERT_EMAIL_TEXT,
  ALERT_RULES,
  ALERT_RULE_IDS,
  type AlertPlayerData,
  type AlertSwitches,
  DEFAULT_ALERT_SWITCHES,
  alertEmail,
  alertMatchesOn,
  alertSwitchesFromDoc,
  docFromAlertSwitches,
  evaluateAlerts,
} from './alert-rules';

/** Wenn-dann-Regeln (SCRUM-195): jede Vorlage löst aus bzw. nicht aus; Protokoll; neutrale E-Mail. */
describe('alert-rules (Wenn-dann-Regeln)', () => {
  const TODAY = '2026-10-16';
  const ago = (days: number) => addDays(TODAY, -days);

  const player = (overrides: Partial<Player> = {}): Player => ({
    id: 'p1', name: 'Jonas Keller', positions: ['ST'], number: 9, birthdate: '2012-01-01', status: 'Fit', injuryUntil: '', injuredSince: '', consentStatus: 'granted', consentDate: '', ...overrides,
  });
  const event = (id: string, date: string, exertion = 5, title = 'Training'): TeamEvent =>
    ({
      id, type: 'Training', title, date, exertion, intensity: 2, location: '', trainingFocus: '', opponent: '', goalsFor: null, goalsAgainst: null,
      matchDuration: null, startTime: null, durationMinutes: 90, locationCoords: null, notes: '',
    }) as TeamEvent;
  const rated: Rating = { ...BLANK_RATING, attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2 };
  const present: Rating = { ...BLANK_RATING, attendance: 'present' };
  const wellness = (date: string, values: Partial<Pick<WellnessEntry, 'fatigue' | 'sleep' | 'soreness' | 'stress'>> = {}): WellnessEntry => ({
    eventId: `w-${date}`, date, fatigue: 5, sleep: 5, soreness: 5, stress: 5, updatedAt: null, ...values,
  });
  const data = (overrides: Partial<AlertPlayerData> = {}): AlertPlayerData => ({ player: player(), items: [], absences: [], measurements: [], wellness: [], ...overrides });
  const only = (id: (typeof ALERT_RULE_IDS)[number]): AlertSwitches =>
    Object.fromEntries(ALERT_RULE_IDS.map((rule) => [rule, rule === id])) as unknown as AlertSwitches;
  const matches = (players: AlertPlayerData[], rule: (typeof ALERT_RULE_IDS)[number], events: TeamEvent[] = [], audience: 'trainer' | 'physio' = 'trainer', day = TODAY) =>
    alertMatchesOn(players, events, only(rule), audience, day);

  describe('Schmerz wiederholt', () => {
    it('löst aus bei zweimal Muskelkater „deutlich“ oder stärker innerhalb von 14 Tagen', () => {
      const result = matches([data({ wellness: [wellness(ago(13), { soreness: 3 }), wellness(ago(2), { soreness: 1 })] })], 'pain');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ ruleId: 'pain', playerId: 'p1', subject: 'Jonas Keller' });
      expect(result[0].detail).toContain('2×');
    });

    it('löst nicht aus bei nur einer starken Meldung, bei „etwas“ oder wenn die erste älter als 14 Tage ist', () => {
      expect(matches([data({ wellness: [wellness(ago(2), { soreness: 1 })] })], 'pain')).toEqual([]);
      expect(matches([data({ wellness: [wellness(ago(3), { soreness: 4 }), wellness(ago(1), { soreness: 4 })] })], 'pain')).toEqual([]);
      expect(matches([data({ wellness: [wellness(ago(14), { soreness: 2 }), wellness(ago(1), { soreness: 2 })] })], 'pain')).toEqual([]);
      // Ohne lesbares Befinden schweigt die Regel.
      expect(matches([data({ wellness: null })], 'pain')).toEqual([]);
    });

    it('zählt Meldungen nach dem Auswertungstag nicht (Protokoll rechnet je Tag)', () => {
      const entries = [wellness(ago(5), { soreness: 2 }), wellness(ago(1), { soreness: 2 })];
      expect(matches([data({ wellness: entries })], 'pain', [], 'trainer', ago(2))).toEqual([]);
      expect(matches([data({ wellness: entries })], 'pain', [], 'trainer', ago(1))).toHaveLength(1);
    });
  });

  describe('Befinden schlechter als üblich', () => {
    /** 6 Antworten mit Summe 20 (Normalwert) und zuletzt `last`. */
    const series = (last: Partial<Pick<WellnessEntry, 'fatigue' | 'sleep' | 'soreness' | 'stress'>>) => [
      ...[20, 17, 14, 11, 8, 5].map((days) => wellness(ago(days))),
      wellness(ago(1), last),
    ];

    it('löst aus, wenn die jüngste Antwort mindestens 3 Punkte unter dem eigenen Normalwert liegt', () => {
      const result = matches([data({ wellness: series({ fatigue: 3, sleep: 4 }) })], 'wellness');
      expect(result).toHaveLength(1);
      expect(result[0].detail).toBe('Befinden 17 statt üblich 20 (von 28)');
    });

    it('löst nicht aus bei nur 2 Punkten darunter oder ohne Normalwert (weniger als 6 Antworten)', () => {
      expect(matches([data({ wellness: series({ fatigue: 4, sleep: 4 }) })], 'wellness')).toEqual([]);
      expect(matches([data({ wellness: [wellness(ago(9)), wellness(ago(1), { fatigue: 1, sleep: 1 })] })], 'wellness')).toEqual([]);
    });
  });

  describe('Belastungsspitze', () => {
    /** 12 normale Wochen (2 Trainings à 90 × 5) und dann `recent` Termine. */
    const items = (recent: { ago: number; exertion: number }[]): EventRating[] => {
      const history = Array.from({ length: 12 }, (_, week) => [7 + week * 7, 9 + week * 7]).flat().map((days) => ({ ago: days, exertion: 5 }));
      return [...history, ...recent].map((entry, index) => ({ event: event(`e${index}`, ago(entry.ago), entry.exertion), rating: present }));
    };

    it('löst aus bei der Belastungsspitze der Belastungsampel', () => {
      const spike = items([5, 3, 1, 0].map((days) => ({ ago: days, exertion: 6 })));
      const result = matches([data({ items: spike })], 'loadSpike');
      expect(result).toHaveLength(1);
      expect(result[0].detail).toBe('Müdigkeit 1,6-fach der Fitness');
    });

    it('löst nicht aus bei einer normalen Woche oder ohne lesbare Bewertungen (Medizin)', () => {
      expect(matches([data({ items: items([{ ago: 1, exertion: 5 }, { ago: 4, exertion: 5 }]) })], 'loadSpike')).toEqual([]);
      expect(matches([data({ items: null })], 'loadSpike')).toEqual([]);
    });
  });

  describe('Einwilligung widerrufen', () => {
    it('löst aus, solange die Einwilligung widerrufen ist und noch Gesundheitsdaten gespeichert sind', () => {
      const revoked = player({ consentStatus: 'revoked' });
      expect(matches([data({ player: { ...revoked, status: 'Verletzt' } })], 'consentRevoked')).toHaveLength(1);
      expect(matches([data({ player: revoked, measurements: [{ id: 'm', date: ago(3), height: 150, weight: 40 }] })], 'consentRevoked')).toHaveLength(1);
      expect(matches([data({ player: revoked, wellness: [wellness(ago(3))] })], 'consentRevoked')).toHaveLength(1);
    });

    it('löst nicht aus mit Einwilligung oder wenn nichts mehr gespeichert ist', () => {
      expect(matches([data({ player: player({ status: 'Verletzt' }) })], 'consentRevoked')).toEqual([]);
      expect(matches([data({ player: player({ consentStatus: 'revoked' }) })], 'consentRevoked')).toEqual([]);
    });
  });

  describe('Offene Bewertungen', () => {
    const training = event('t1', ago(2), 5, 'Training Mi');

    it('löst aus für einen vergangenen Termin der letzten 7 Tage mit Spielern ohne Bewertung', () => {
      const players = [
        data({ items: [{ event: training, rating: rated }] }),
        data({ player: player({ id: 'p2', name: 'Ben' }), items: [{ event: training, rating: present }] }),
        data({ player: player({ id: 'p3', name: 'Ali' }), items: [{ event: training, rating: null }] }),
      ];
      const result = matches(players, 'openRatings', [training]);
      expect(result).toEqual([
        { key: 'openRatings:t1', ruleId: 'openRatings', playerId: null, eventId: 't1', subject: `Training Mi am ${ago(2).slice(8, 10)}.${ago(2).slice(5, 7)}.`, detail: '2 von 3 Spielern noch ohne Bewertung' },
      ]);
    });

    it('löst nicht aus, wenn alles bewertet ist (auch „fehlt“ zählt), am Tag selbst, in der Zukunft oder älter als 7 Tage', () => {
      const absent: Rating = { ...BLANK_RATING, attendance: 'absent' };
      const done = [data({ items: [{ event: training, rating: rated }] }), data({ player: player({ id: 'p2' }), items: [{ event: training, rating: absent }] })];
      expect(matches(done, 'openRatings', [training])).toEqual([]);
      for (const date of [TODAY, addDays(TODAY, 2), ago(8)]) {
        const other = event('t2', date);
        expect(matches([data({ items: [{ event: other, rating: null }] })], 'openRatings', [other])).toEqual([]);
      }
    });
  });

  describe('Schalter und Rollen', () => {
    const painful = data({ wellness: [wellness(ago(3), { soreness: 2 }), wellness(ago(1), { soreness: 2 })], player: player({ consentStatus: 'revoked' }) });

    it('eine ausgeschaltete Vorlage löst nie aus', () => {
      expect(alertMatchesOn([painful], [], { ...DEFAULT_ALERT_SWITCHES, pain: false }, 'trainer', TODAY).map((match) => match.ruleId)).toEqual(['consentRevoked']);
    });

    it('Medizin bekommt nur Schmerz und Befinden, nie Belastung, Einwilligung oder Bewertungen', () => {
      expect(ALERT_RULES.filter((rule) => rule.audience.includes('physio')).map((rule) => rule.id)).toEqual(['pain', 'wellness']);
      expect(alertMatchesOn([painful], [], DEFAULT_ALERT_SWITCHES, 'physio', TODAY).map((match) => match.ruleId)).toEqual(['pain']);
    });

    it('Schalter aus meta/settings: fehlend oder ungültig = an', () => {
      expect(alertSwitchesFromDoc(null)).toEqual(DEFAULT_ALERT_SWITCHES);
      expect(alertSwitchesFromDoc({ alertRules: { pain: false, wellness: 'nein' } })).toEqual({ ...DEFAULT_ALERT_SWITCHES, pain: false });
      expect(docFromAlertSwitches({ ...DEFAULT_ALERT_SWITCHES, openRatings: false })).toEqual({
        alertRules: { pain: true, wellness: true, loadSpike: true, consentRevoked: true, openRatings: false },
      });
    });
  });

  describe('Protokoll', () => {
    it('hält fest, an welchem Tag eine Regel angeschlagen hat, und ob sie noch läuft', () => {
      // Schmerz am 10. und 9. Tag zurück: läuft von Tag 9 bis Tag 0 (14-Tage-Fenster) – noch aktiv.
      // Ein zweiter Spieler hatte Schmerz vor 25 und 24 Tagen: Regel lief von Tag 24 bis Tag 12, ist vorbei.
      const players = [
        data({ wellness: [wellness(ago(10), { soreness: 2 }), wellness(ago(9), { soreness: 2 })] }),
        data({ player: player({ id: 'p2', name: 'Ben' }), wellness: [wellness(ago(25), { soreness: 1 }), wellness(ago(24), { soreness: 1 })] }),
      ];
      const { hints, log } = evaluateAlerts(players, [], DEFAULT_ALERT_SWITCHES, 'trainer', TODAY);
      expect(hints.map((hint) => [hint.subject, hint.since, hint.sinceBefore])).toEqual([['Jonas Keller', ago(9), false]]);
      expect(log.map((entry) => [entry.subject, entry.date, entry.until, entry.active])).toEqual([
        ['Jonas Keller', ago(9), TODAY, true],
        ['Ben', ago(24), ago(12), false],
      ]);
    });

    it('ohne Treffer: keine Hinweise, leeres Protokoll', () => {
      expect(evaluateAlerts([data()], [], DEFAULT_ALERT_SWITCHES, 'trainer', TODAY)).toEqual({ hints: [], log: [] });
    });

    it('eine Regel, die schon vor dem Protokollfenster anschlug, ist als „schon länger“ markiert', () => {
      const { hints } = evaluateAlerts([data({ player: player({ consentStatus: 'revoked', status: 'Angeschlagen' }) })], [], DEFAULT_ALERT_SWITCHES, 'trainer', TODAY);
      expect(hints).toHaveLength(1);
      expect(hints[0].sinceBefore).toBe(true);
    });
  });

  describe('E-Mail (später über den Erinnerungsdienst)', () => {
    it('enthält keine Gesundheitsdetails, keine Namen und keine Regel – nur „bitte in die App schauen“', () => {
      const players = [
        data({ player: player({ name: 'Jonas Keller', consentStatus: 'revoked' }), wellness: [wellness(ago(3), { soreness: 1 }), wellness(ago(1), { soreness: 1 })] }),
      ];
      const { hints } = evaluateAlerts(players, [], DEFAULT_ALERT_SWITCHES, 'trainer', TODAY);
      expect(hints.length).toBeGreaterThan(0);
      const mail = alertEmail(hints)!;
      expect(mail).toEqual({ subject: ALERT_EMAIL_SUBJECT, text: ALERT_EMAIL_TEXT });
      expect(mail.text).toContain('Bitte schau in die App');
      const content = `${mail.subject} ${mail.text}`.toLowerCase();
      for (const word of ['jonas', 'keller', 'schmerz', 'muskelkater', 'befinden', 'einwilligung', 'belastung', 'verletz', ...ALERT_RULES.map((rule) => rule.title.toLowerCase())]) {
        expect(content).not.toContain(word);
      }
      expect(content).not.toMatch(/\d/);
    });

    it('ohne Hinweis keine E-Mail', () => {
      expect(alertEmail([])).toBeNull();
    });
  });
});
