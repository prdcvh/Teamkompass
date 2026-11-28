import type { TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import type { EventRating } from '../profile/profile';
import { BLANK_RATING, type Rating } from '../ratings/rating';
import type { GrowthReview } from '../records/growth-review';
import type { Measurement } from '../records/measurement';
import { addDays } from '../shared/dates';
import { ALERT_RULE_IDS, type AlertPlayerData, type AlertSwitches, DEFAULT_ALERT_SWITCHES, alertEmail, alertMatchesOn, alertRule, consentRevokedMatch, evaluateAlerts } from './alert-rules';
import { growthLoadMatch, growthLoadStatus } from './growth-load-rule';

/** Wenn-dann-Regel „Wachstum und Belastung gemeinsam ansehen“ (SCRUM-257, docs/reife-kompass-wachstum-belastung-hinweis.md). */
describe('growth-load-rule (Wachstum und Belastung gemeinsam ansehen)', () => {
  const TODAY = '2026-10-16';
  const ago = (days: number) => addDays(TODAY, -days);

  const player = (overrides: Partial<Player> = {}): Player => ({
    id: 'p1', name: 'Jonas Keller', positions: ['ST'], number: 9, birthdate: '2012-01-01', status: 'Fit', injuryUntil: '', injuredSince: '', consentStatus: 'granted', consentDate: '', ...overrides,
  });
  const event = (id: string, date: string, exertion: number): TeamEvent =>
    ({
      id, type: 'Training', title: 'Training', date, exertion, intensity: 2, location: '', trainingFocus: '', opponent: '', goalsFor: null, goalsAgainst: null,
      matchDuration: null, startTime: null, durationMinutes: 90, locationCoords: null, notes: '',
    }) as TeamEvent;
  const present: Rating = { ...BLANK_RATING, attendance: 'present' };
  /** 12 normale Wochen (2 Trainings à 90 × 5) und dann `recent` Termine (Tage zurück, Anstrengung). */
  const items = (recent: [number, number][]): EventRating[] => {
    const history = Array.from({ length: 12 }, (_, week) => [7 + week * 7, 9 + week * 7]).flat().map((days): [number, number] => [days, 5]);
    return [...history, ...recent].map(([days, exertion], index) => ({ event: event(`e${index}`, ago(days), exertion), rating: present }));
  };
  /** Belastungsspitze heute (wie im Test der Regel „Belastungsspitze“). */
  const spike = items([5, 3, 1, 0].map((days): [number, number] => [days, 6]));
  const normal = items([[4, 5], [1, 5]]);
  const measure = (id: string, date: string, height: number, quality: Measurement['quality'] = 'verified'): Measurement => ({ id, date, height, weight: 45, quality });
  /** 120 Tage Abstand, +3 cm ≈ 0,76 cm/Monat (Hinweis ab 0,6). Jüngste Messung vor 10 Tagen. */
  const growing = (quality: Measurement['quality'] = 'verified') => [measure('m1', ago(130), 160, quality), measure('m2', ago(10), 163, quality)];
  const data = (overrides: Partial<AlertPlayerData> = {}): AlertPlayerData => ({
    player: player(), items: spike, absences: [], measurements: growing(), wellness: [], growthReviews: [], ...overrides,
  });
  const only: AlertSwitches = Object.fromEntries(ALERT_RULE_IDS.map((rule) => [rule, rule === 'growthLoad'])) as unknown as AlertSwitches;
  const matches = (entry: AlertPlayerData, day = TODAY, audience: 'trainer' | 'physio' = 'trainer') => alertMatchesOn([entry], [], only, audience, day);
  const review = (hintKey: string, date: string): GrowthReview => ({
    id: 'r1', planId: 'plan1', hintKey, date, by: 'Trainer Test', byUid: 'coach', action: 'Sprungumfang reduziert', createdAt: `${date}T18:00:00.000Z`,
  });

  describe('löst aus', () => {
    it('bei aktuellem Wachstumshinweis und Belastungsspitze seit der jüngsten Messung', () => {
      const result = matches(data());
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ ruleId: 'growthLoad', playerId: 'p1', subject: 'Jonas Keller' });
      expect(result[0].key).toBe(`growthLoad:p1:m1@${ago(130)}@160>m2@${ago(10)}@163`);
      expect(result[0].detail).toContain('Wachstum 0,8 cm/Monat');
      expect(result[0].detail).toContain('Belastungsspitze');
      expect(result[0].detail).toContain(`läuft ab am ${addDays(ago(10), 90).split('-').reverse().join('.')}`);
    });

    it('auch bei zwei sehr harten Einheiten innerhalb von 48 Stunden', () => {
      const hard = items([[2, 8], [1, 8]]);
      const status = growthLoadStatus(data({ items: hard }), TODAY);
      expect(status?.loadReasons).toContain('Zwei sehr harte Einheiten innerhalb von 48 Stunden');
    });

    it('ungeprüfte Messqualität ergibt zuerst „Messung prüfen“, nicht „gemeinsam ansehen“', () => {
      const result = matches(data({ measurements: growing('undocumented') }));
      expect(result).toHaveLength(1);
      expect(result[0].detail).toMatch(/^Messung prüfen: Messqualität vom .* nicht dokumentiert/);
      expect(growthLoadStatus(data({ measurements: growing('undocumented') }), TODAY)?.state).toBe('check-measurement');
      expect(growthLoadStatus(data(), TODAY)?.state).toBe('review');
    });

    it('markierte, unbestätigte Messung, die das Wachstum verändern würde: gleicher Hinweis, aber gekennzeichnet (SCRUM-306)', () => {
      const flagged: Measurement = { ...measure('mf', ago(3), 170, 'flagged'), flags: ['height-jump'] };
      const plain = growthLoadStatus(data(), TODAY)!;
      const status = growthLoadStatus(data({ measurements: [...growing(), flagged] }), TODAY)!;
      expect(status.key).toBe(plain.key);
      expect(status.state).toBe('review');
      expect(status.flaggedDates).toEqual([ago(3)]);
      expect(plain.flaggedDates).toEqual([]);
      const detail = matches(data({ measurements: [...growing(), flagged] }))[0].detail;
      expect(detail).toContain(`Einordnung unsicher – Messung prüfen (Messung vom ${ago(3).split('-').reverse().join('.')} zur Prüfung markiert).`);
      expect(matches(data())[0].detail).not.toContain('Einordnung unsicher');
    });

    it('Befinden fehlt: „keine Angaben“ bzw. „nicht lesbar“, nie „unauffällig“', () => {
      expect(matches(data({ wellness: [] }))[0].detail).toContain('Befinden: keine Angaben');
      expect(matches(data({ wellness: null }))[0].detail).toContain('Befinden nicht freigegeben oder nicht lesbar');
      expect(matches(data({ wellness: null }))[0].detail).not.toMatch(/unauffällig/i);
    });
  });

  describe('löst nicht aus', () => {
    it('ohne Belastungshinweis, unter 0,6 cm/Monat oder ohne lesbare Bewertungen', () => {
      expect(matches(data({ items: normal }))).toEqual([]);
      expect(matches(data({ measurements: [measure('m1', ago(130), 160), measure('m2', ago(10), 161)] }))).toEqual([]);
      expect(matches(data({ items: null }))).toEqual([]);
    });

    it('bei veraltetem Wachstumshinweis (jüngste Messung älter als 90 Tage) oder zu kurzem Messabstand', () => {
      expect(matches(data({ measurements: [measure('m1', ago(220), 160), measure('m2', ago(91), 163)] }))).toEqual([]);
      expect(matches(data({ measurements: [measure('m1', ago(60), 160), measure('m2', ago(10), 163)] }))).toEqual([]);
    });

    it('wenn die Belastungsspitze vor der jüngsten Messung lag', () => {
      // Spitze heute, aber Auswertung an einem Tag vor der Messung: Messungen nach dem Stichtag zählen nicht.
      expect(matches(data(), ago(11))).toEqual([]);
    });

    it('bei widerrufener Einwilligung (keine Berechnung)', () => {
      expect(matches(data({ player: player({ consentStatus: 'revoked' }) }))).toEqual([]);
    });

    it('für Medizin nie (nur Trainer), und ausgeschaltet nie', () => {
      expect(alertRule('growthLoad').audience).toEqual(['trainer']);
      expect(matches(data(), TODAY, 'physio')).toEqual([]);
      expect(alertMatchesOn([data()], [], { ...DEFAULT_ALERT_SWITCHES, growthLoad: false }, 'trainer', TODAY).map((match) => match.ruleId)).not.toContain('growthLoad');
    });
  });

  describe('Wiederholungsschutz, Ablauf, Prüfung, Korrektur', () => {
    it('gleiche Daten ergeben im Protokoll genau einen Hinweis; er bleibt auch nach Abklingen der Spitze stehen', () => {
      // Spitze nur vor 8 bis 5 Tagen, danach Pause: der Hinweis bleibt bis zur Prüfung bzw. zum Ablauf.
      const past = items([[8, 6], [7, 6], [6, 6], [5, 6]]);
      const result = evaluateAlerts([data({ items: past })], [], only, 'trainer', TODAY);
      const entries = result.log.filter((entry) => entry.ruleId === 'growthLoad');
      expect(entries).toHaveLength(1);
      expect(entries[0].active).toBe(true);
      expect(result.hints.filter((hint) => hint.ruleId === 'growthLoad')).toHaveLength(1);
      expect(evaluateAlerts([data({ items: past })], [], only, 'trainer', TODAY).hints[0].key).toBe(result.hints[0].key);
    });

    it('läuft 90 Tage nach der jüngsten Messung ab', () => {
      const newest = ago(10);
      expect(growthLoadMatch(data(), addDays(newest, 90))).not.toBeNull();
      expect(growthLoadMatch(data(), addDays(newest, 91))).toBeNull();
    });

    it('eine dokumentierte Prüfung beendet den Hinweis ab ihrem Datum, nur für genau dieses Messpaar', () => {
      const key = growthLoadMatch(data(), TODAY)!.key;
      const reviewed = data({ growthReviews: [review(key, ago(1))] });
      expect(matches(reviewed)).toEqual([]);
      expect(growthLoadStatus(reviewed, TODAY)?.review?.action).toBe('Sprungumfang reduziert');
      expect(matches(reviewed, ago(2))).toHaveLength(1);
      expect(matches(data({ growthReviews: [review('growthLoad:p1:anderes', ago(1))] }))).toHaveLength(1);
      // Im Protokoll endet der Eintrag am Tag vor der Prüfung.
      const log = evaluateAlerts([reviewed], [], only, 'trainer', TODAY).log.filter((entry) => entry.ruleId === 'growthLoad');
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ active: false, until: ago(2) });
    });

    it('Korrektur der Messung: alte Prüfung gilt nicht mehr, neuer Hinweis mit neuer Kennung oder gar keiner', () => {
      const key = growthLoadMatch(data(), TODAY)!.key;
      const corrected = [measure('m1', ago(130), 160), measure('m2', ago(10), 163.5)];
      const again = matches(data({ measurements: corrected, growthReviews: [review(key, ago(1))] }));
      expect(again).toHaveLength(1);
      expect(again[0].key).not.toBe(key);
      expect(matches(data({ measurements: [measure('m1', ago(130), 160), measure('m2', ago(10), 160.5)] }))).toEqual([]);
      // Als auffällig markiert: zählt nicht mehr, kein Hinweis.
      expect(matches(data({ measurements: [measure('m1', ago(130), 160), measure('m2', ago(10), 163, 'flagged')] }))).toEqual([]);
    });
  });

  describe('keine Einordnung, keine Änderung', () => {
    it('setzt kein „verletzt“, kein „nicht einsetzen“, keine Sperre und ändert die Spielerdaten nicht', () => {
      const entry = data();
      const before = JSON.stringify(entry.player);
      const detail = matches(entry)[0].detail;
      expect(detail).not.toMatch(/verletzt|nicht einsetzen|gesperrt|Sperre|Diagnose/i);
      expect(JSON.stringify(entry.player)).toBe(before);
      expect(entry.player.status).toBe('Fit');
    });

    it('E-Mail bleibt neutral (ohne Namen, Werte oder Regel)', () => {
      const { hints } = evaluateAlerts([data()], [], only, 'trainer', TODAY);
      const mail = alertEmail(hints)!;
      expect(`${mail.subject} ${mail.text}`).not.toMatch(/Jonas|Wachstum|Belastung|cm/);
    });

    it('Prüfungen zählen bei Widerruf als noch gespeicherte Gesundheitsdaten', () => {
      const revoked = player({ consentStatus: 'revoked' });
      expect(consentRevokedMatch(data({ player: revoked, items: [], measurements: [], wellness: [], growthReviews: [review('k', ago(3))] }))).toBe(true);
      expect(consentRevokedMatch(data({ player: revoked, items: [], measurements: [], wellness: [], growthReviews: [] }))).toBe(false);
    });

    it('Reife-Kompass-Angaben zählen bei Widerruf als noch gespeicherte Gesundheitsdaten (SCRUM-304)', () => {
      const base = { items: [], measurements: [], wellness: [], growthReviews: [] };
      const stored = { sex: 'm' as const, parentsConsent: false, motherHeight: null, fatherHeight: null };
      const revoked = player({ consentStatus: 'revoked' });
      expect(consentRevokedMatch(data({ ...base, player: revoked, maturity: stored }))).toBe(true);
      expect(consentRevokedMatch(data({ ...base, player: revoked, maturity: { ...stored, sex: null } }))).toBe(false);
      expect(consentRevokedMatch(data({ ...base, player: revoked, maturity: null }))).toBe(false);
      expect(consentRevokedMatch(data({ ...base, player: player({ consentStatus: 'granted' }), maturity: stored }))).toBe(false);
    });
  });
});
