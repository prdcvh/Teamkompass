import { describe, expect, it } from 'vitest';
import { GRADE_FIELDS, GRADE_WEIGHTS, calculatedGrade, ratingFromDoc } from '../ratings/rating';
import * as catalog from './competence-catalog';
import { COMPETENCE_CRITERIA, COMPETENCE_DOMAINS, COMPETENCE_FRAMEWORK_VERSION, WEIGHT_PROFILES, criteriaOf, stepLabel } from './competence-catalog';
import * as competence from './competence';
import {
  type CompetenceConfig,
  type CompetenceObservation,
  DEFAULT_COMPETENCE_CONFIG,
  competenceIndex,
  competenceProfile,
  configAt,
  configFromDoc,
  currentConfig,
  docFromConfig,
  docFromObservation,
  nextConfig,
  observationFromDoc,
  observationsFromDraft,
  suggestedWeights,
  validateConfigDraft,
  validateObservationDraft,
} from './competence';

const TODAY = '2026-11-23';

function obs(criterionId: string, value: number, date: string, change: Partial<CompetenceObservation> = {}): CompetenceObservation {
  return {
    id: `${criterionId}-${date}-${value}`,
    playerId: 'p1',
    framework: COMPETENCE_FRAMEWORK_VERSION,
    criterionId,
    value,
    date,
    occasion: 'training',
    eventId: null,
    position: null,
    source: 'trainer',
    note: '',
    by: 'Trainer',
    byUid: 'coach',
    createdAt: `${date}T18:00:00.000Z`,
    ...change,
  };
}

function config(change: Partial<CompetenceConfig> = {}): CompetenceConfig {
  return {
    ...DEFAULT_COMPETENCE_CONFIG,
    version: 1,
    weightProfile: 'balanced',
    weights: { technique: 20, tactics: 20, physical: 20, psychological: 20, social: 20 },
    indexEnabled: true,
    createdAt: '2026-11-01T10:00:00.000Z',
    ...change,
  };
}

/** Je Bereich zwei Kriterien an zwei Tagen beobachtet. */
function covered(value = 3): CompetenceObservation[] {
  return COMPETENCE_DOMAINS.flatMap((domain) => criteriaOf(domain).slice(0, 2).map((criterion, index) => obs(criterion.id, value, index === 0 ? '2026-11-01' : '2026-11-10')));
}

describe('Katalog raster-1', () => {
  it('hat fünf Bereiche mit je drei Kriterien und eindeutigen Kennungen', () => {
    expect(COMPETENCE_DOMAINS).toEqual(['technique', 'tactics', 'physical', 'psychological', 'social']);
    for (const domain of COMPETENCE_DOMAINS) expect(criteriaOf(domain)).toHaveLength(3);
    expect(new Set(COMPETENCE_CRITERIA.map((c) => c.id)).size).toBe(15);
    for (const criterion of COMPETENCE_CRITERIA) {
      expect(criterion.id.startsWith(`${criterion.domain}.`)).toBe(true);
      expect(criterion.anchor.length).toBeGreaterThan(20);
    }
  });

  it('Gewichtsprofile ergeben je 100 %', () => {
    for (const profile of WEIGHT_PROFILES) expect(Object.values(profile.weights).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('Stufenwort zum gerundeten Mittel', () => {
    expect(stepLabel(1)).toBe('zeigt es noch selten');
    expect(stepLabel(2.6)).toBe('zeigt es meistens');
    expect(stepLabel(4)).toBe('zeigt es sicher');
  });

  it('erzeugt keine Persönlichkeitslabels und keine Rangfunktion', () => {
    const exported = [...Object.keys(catalog), ...Object.keys(competence)].join(' ').toLowerCase();
    expect(exported).not.toMatch(/rank|sort(?!edconfigs)|compare|talent|personality|label(?:s)?for/);
    const texts = JSON.stringify(catalog).toLowerCase();
    for (const word of ['mental stark', 'führungsspieler', 'schwierig', 'talent']) expect(texts).not.toContain(word);
  });
});

describe('Bisheriges Modell (Eventnoten) bleibt unverändert', () => {
  it('vier Felder, Gewichte 30/30/25/15, gleiche Gesamtnote', () => {
    expect(GRADE_FIELDS).toEqual(['effort', 'technique', 'tactics', 'comprehension']);
    expect(GRADE_WEIGHTS).toEqual({ effort: 0.3, technique: 0.3, tactics: 0.25, comprehension: 0.15 });
    expect(calculatedGrade(ratingFromDoc({ attendance: 'present', effort: 2, technique: 3, tactics: 2, comprehension: 1 }))).toBe(2.2);
  });

  it('das Raster liest keine Eventnoten: ohne Beobachtung ist jeder Bereich „nicht erhoben“', () => {
    const profile = competenceProfile([], DEFAULT_COMPETENCE_CONFIG, TODAY);
    expect(profile.domains.map((d) => [d.state, d.value])).toEqual(COMPETENCE_DOMAINS.map(() => ['none', null]));
    expect(profile.observations).toBe(0);
    expect(profile.snapshotOnly).toBe(false);
  });
});

describe('Beobachtungen', () => {
  it('Dokument hin und zurück', () => {
    const entry = obs('tactics.scanning', 3, '2026-11-02', { eventId: 'e1', position: 'ZM', note: 'zweimal Schulterblick' });
    expect(observationFromDoc(entry.id, docFromObservation(entry))).toEqual(entry);
  });

  it('verwirft unlesbare Dokumente, behält unbekannte Kriterien', () => {
    expect(observationFromDoc('x', { criterionId: 'tactics.scanning', value: 0, date: '2026-11-02' })).toBeNull();
    expect(observationFromDoc('x', { criterionId: 'tactics.scanning', value: 2.5, date: '2026-11-02' })).toBeNull();
    expect(observationFromDoc('x', { criterionId: 'tactics.scanning', value: 2, date: 'gestern' })).toBeNull();
    expect(observationFromDoc('x', { criterionId: 'kuenftig.neu', value: 2, date: '2026-11-02', framework: 'raster-2' })?.criterionId).toBe('kuenftig.neu');
  });

  it('Entwurf prüft Datum, Stufen und Notiz', () => {
    const base = { date: TODAY, occasion: 'match' as const, eventId: '', position: '', note: '', values: { 'social.support': 3 } };
    expect(validateObservationDraft(base, TODAY)).toEqual({});
    expect(validateObservationDraft({ ...base, date: '2026-11-24' }, TODAY).date).toBeTruthy();
    expect(validateObservationDraft({ ...base, values: {} }, TODAY).values).toBeTruthy();
    expect(validateObservationDraft({ ...base, values: { 'social.support': 5 } }, TODAY).values).toBeTruthy();
    expect(validateObservationDraft({ ...base, values: { 'erfunden.x': 2 } }, TODAY).values).toBeTruthy();
    expect(validateObservationDraft({ ...base, note: 'x'.repeat(301) }, TODAY).note).toBeTruthy();
  });

  it('ein Dokument je eingestuftem Kriterium, mit Version, Quelle, Anlass und Person', () => {
    let n = 0;
    const list = observationsFromDraft(
      { date: '2026-11-20', occasion: 'match', eventId: 'e7', position: ' IV ', note: ' gut ', values: { 'tactics.offBall': 2, 'social.communication': 4 } },
      { playerId: 'p1', by: 'Trainerin', byUid: 'coach', createdAt: '2026-11-20T20:00:00.000Z', newId: () => `o${++n}` },
    );
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'o1', framework: 'raster-1', criterionId: 'tactics.offBall', value: 2, occasion: 'match', eventId: 'e7', position: 'IV', note: 'gut', source: 'trainer', byUid: 'coach' });
  });
});

describe('Profil', () => {
  it('ungemessene Bereiche bleiben „nicht erhoben“ und ziehen keine Werte auf 0', () => {
    const profile = competenceProfile([obs('technique.passing', 4, '2026-11-01'), obs('technique.passing', 2, '2026-11-08')], DEFAULT_COMPETENCE_CONFIG, TODAY);
    const technique = profile.domains.find((d) => d.domain === 'technique')!;
    expect(technique).toMatchObject({ state: 'observed', value: 3, observedCriteria: 1, totalCriteria: 3, observations: 2, lastDate: '2026-11-08' });
    expect(technique.criteria.find((c) => c.criterion.id === 'technique.firstTouch')?.value).toBeNull();
    for (const d of profile.domains.filter((d) => d.domain !== 'technique')) expect([d.state, d.value]).toEqual(['none', null]);
  });

  it('abgeschaltete Bereiche heißen „in diesem Team nicht erhoben“ und zählen nicht', () => {
    const profile = competenceProfile([obs('social.support', 4, '2026-11-01')], config({ domains: ['technique', 'tactics'] }), TODAY);
    expect(profile.domains.find((d) => d.domain === 'social')).toMatchObject({ state: 'off', value: null, observations: 0 });
    expect(profile.observations).toBe(0);
  });

  it('nur die letzten drei Beobachtungen der letzten 365 Tage je Kriterium', () => {
    const list = [
      obs('physical.speed', 1, '2025-11-01'), // älter als 365 Tage
      obs('physical.speed', 1, '2026-09-01'),
      obs('physical.speed', 3, '2026-10-01'),
      obs('physical.speed', 3, '2026-10-15'),
      obs('physical.speed', 4, '2026-11-01'),
      obs('physical.speed', 4, '2026-12-01'), // Zukunft
    ];
    const criterion = competenceProfile(list, DEFAULT_COMPETENCE_CONFIG, TODAY).domains[2].criteria[0];
    expect(criterion).toMatchObject({ value: 3.3, count: 3, lastDate: '2026-11-01' });
  });

  it('alles von einem Tag ist eine Momentaufnahme', () => {
    const profile = competenceProfile([obs('technique.passing', 3, '2026-11-01'), obs('tactics.decision', 2, '2026-11-01')], DEFAULT_COMPETENCE_CONFIG, TODAY);
    expect(profile).toMatchObject({ snapshotOnly: true, days: 1, observations: 2 });
  });

  it('andere Rasterversionen werden gezählt, aber nicht eingerechnet', () => {
    const profile = competenceProfile([obs('technique.passing', 1, '2026-11-01', { framework: 'raster-0' }), obs('neu.x', 2, '2026-11-01')], DEFAULT_COMPETENCE_CONFIG, TODAY);
    expect(profile.otherVersion).toBe(2);
    expect(profile.domains[0].state).toBe('none');
  });
});

describe('Gesamtindex', () => {
  it('standardmäßig aus', () => {
    expect(competenceIndex(competenceProfile(covered(), DEFAULT_COMPETENCE_CONFIG, TODAY), DEFAULT_COMPETENCE_CONFIG).kind).toBe('off');
  });

  it('mit ausreichender Abdeckung: Wert, Gewichte, Version und Datengrundlage', () => {
    const cfg = config({ version: 3, weightProfile: 'foundation', weights: { technique: 30, tactics: 20, physical: 10, psychological: 20, social: 20 } });
    const list = covered(2).map((entry) => (entry.criterionId.startsWith('technique.') ? { ...entry, value: 4 } : entry));
    const index = competenceIndex(competenceProfile(list, cfg, TODAY), cfg);
    expect(index).toMatchObject({ kind: 'index', value: 2.6, configVersion: 3, weightProfile: 'foundation', framework: 'raster-1', observations: 10, days: 2 });
    if (index.kind === 'index') expect(index.weights).toEqual(cfg.weights);
  });

  it('kein Index bei zu geringer Abdeckung oder nur einem Tag – mit Grund', () => {
    const cfg = config();
    const missingPhysis = covered().filter((entry) => !entry.criterionId.startsWith('physical.'));
    const result = competenceIndex(competenceProfile(missingPhysis, cfg, TODAY), cfg);
    expect(result.kind).toBe('insufficient');
    if (result.kind === 'insufficient') expect(result.reasons).toEqual(['Physis: erst 0 von 3 Kriterien beobachtet (mindestens 2).']);
    const oneDay = covered().map((entry) => ({ ...entry, date: '2026-11-01' }));
    const single = competenceIndex(competenceProfile(oneDay, cfg, TODAY), cfg);
    expect(single.kind === 'insufficient' && single.reasons).toEqual(['Beobachtungen von erst 1 Tag(en) (mindestens 2).']);
  });

  it('Bereich mit Gewicht 0 braucht keine Abdeckung', () => {
    const cfg = config({ weightProfile: 'foundation', weights: { technique: 40, tactics: 30, physical: 0, psychological: 15, social: 15 } });
    const list = covered().filter((entry) => !entry.criterionId.startsWith('physical.'));
    expect(competenceIndex(competenceProfile(list, cfg, TODAY), cfg).kind).toBe('index');
  });
});

describe('Konfiguration und versionierte Gewichte', () => {
  it('Standard ohne gespeicherte Version: alle Bereiche, kein Profil, kein Index', () => {
    expect(currentConfig([])).toEqual(DEFAULT_COMPETENCE_CONFIG);
    expect(DEFAULT_COMPETENCE_CONFIG).toMatchObject({ version: 0, weightProfile: null, indexEnabled: false, domains: COMPETENCE_DOMAINS });
  });

  it('jede Änderung ist eine neue Version; frühere bleiben rekonstruierbar', () => {
    const meta = { by: 'Trainer', byUid: 'coach' };
    const v1 = nextConfig([], { domains: ['technique', 'tactics'], weightProfile: 'balanced', weights: { technique: 50, tactics: 50 }, indexEnabled: true }, { ...meta, createdAt: '2026-10-01T10:00:00.000Z' });
    const v2 = nextConfig([v1], { domains: COMPETENCE_DOMAINS, weightProfile: null, weights: { technique: 50 }, indexEnabled: true }, { ...meta, createdAt: '2026-11-05T10:00:00.000Z' });
    expect(v1.version).toBe(1);
    expect(v2).toMatchObject({ version: 2, weights: {}, indexEnabled: false });
    expect(currentConfig([v1, v2])).toEqual(v2);
    expect(configAt([v1, v2], '2026-10-20')).toEqual(v1);
    expect(configAt([v1, v2], '2026-09-01')).toEqual(DEFAULT_COMPETENCE_CONFIG);
    expect(configFromDoc(docFromConfig(v1))).toEqual(v1);
  });

  it('Gewichte nur innerhalb des Profils (±10), Summe 100, nur erhobene Bereiche', () => {
    const ok = { domains: COMPETENCE_DOMAINS, weightProfile: 'foundation', weights: { technique: 40, tactics: 20, physical: 0, psychological: 20, social: 20 }, indexEnabled: true };
    expect(validateConfigDraft(ok)).toEqual([]);
    expect(validateConfigDraft({ ...ok, weights: { ...ok.weights, technique: 41, physical: -1 } }).length).toBeGreaterThan(0);
    expect(validateConfigDraft({ ...ok, weights: { ...ok.weights, social: 10 } })).toContain('Die Gewichte ergeben zusammen 90 % statt 100 %.');
    expect(validateConfigDraft({ ...ok, domains: [] })).toContain('Mindestens ein Bereich muss erhoben werden.');
    expect(validateConfigDraft({ ...ok, weightProfile: null })).toContain('Für einen Gesamtindex bitte ein Gewichtsprofil wählen.');
    expect(validateConfigDraft({ ...ok, domains: ['technique', 'tactics', 'physical', 'psychological'] })).toContain('Gewichte nur für erhobene Bereiche.');
  });

  it('Vorschlag rechnet die Profilgewichte auf die erhobenen Bereiche hoch', () => {
    expect(suggestedWeights('balanced', COMPETENCE_DOMAINS)).toEqual({ technique: 20, tactics: 20, physical: 20, psychological: 20, social: 20 });
    const four = suggestedWeights('balanced', ['technique', 'tactics', 'physical', 'psychological']);
    expect(four).toEqual({ technique: 25, tactics: 25, physical: 25, psychological: 25 });
    expect(validateConfigDraft({ domains: ['technique', 'tactics', 'physical', 'psychological'], weightProfile: 'balanced', weights: four, indexEnabled: true })).toEqual([]);
  });
});
