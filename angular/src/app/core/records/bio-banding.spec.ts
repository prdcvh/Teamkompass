import { type BioBandingData, bioBand, suggestBioBanding } from './bio-banding';
import { maturityAt } from './maturity';

describe('Bio-Banding: Zuordnung zu den Bändern (SCRUM-191)', () => {
  it('ordnet die Prozentwerte den vier Bändern zu, Grenzen am gerundeten Wert', () => {
    expect([70, 84.9, 84.94].map(bioBand)).toEqual([1, 1, 1]);
    expect([84.95, 85, 89.9, 89.94].map(bioBand)).toEqual([2, 2, 2, 2]);
    expect([89.95, 90, 93.4, 95, 95.04].map(bioBand)).toEqual([3, 3, 3, 3, 3]);
    expect([95.05, 95.1, 99].map(bioBand)).toEqual([4, 4, 4]);
  });
});

describe('Bio-Banding: Vorschlag für den Kader (SCRUM-191)', () => {
  const today = '2026-11-03';
  const inputs = { sex: 'm', parentsConsent: true, motherHeight: 168, fatherHeight: 182 } as const;
  const measure = (height: number, weight: number): BioBandingData => ({ inputs, measurements: [{ id: 'm', date: '2026-10-01', height, weight }] });
  // 14,5 Jahre alt: die Größe bestimmt das Band.
  const player = (id: string, name: string, birthdate = '2012-05-05') => ({ id, name, birthdate });
  const percentOf = (data: BioBandingData) => maturityAt(data.measurements[0]!, '2012-05-05', data.inputs)!.percent;

  it('legt Spieler mit Reifestand nach Prozent in Bänder, innerhalb des Bandes aufsteigend', () => {
    const small = measure(130, 28);
    const tall = measure(178, 60);
    const mid = measure(165, 51);
    expect(bioBand(percentOf(small))).toBe(1);
    expect(bioBand(percentOf(tall))).toBe(4);
    const result = suggestBioBanding(
      [player('a', 'Anna'), player('t', 'Toni'), player('s', 'Sam'), player('m', 'Max')],
      new Map([
        ['a', tall],
        ['t', tall],
        ['s', small],
        ['m', mid],
      ]),
      today,
    );
    expect(result.groups.map((group) => group.band)).toEqual([1, 2, 3, 4]);
    expect(result.groups[0]!.players.map((entry) => entry.name)).toEqual(['Sam']);
    expect(result.groups[3]!.players.map((entry) => entry.name)).toEqual(['Anna', 'Toni']);
    expect(result.groups[bioBand(percentOf(mid)) - 1]!.players.map((entry) => entry.name)).toContain('Max');
    expect(result.withoutValue).toBe(0);
  });

  it('macht nur für Spieler mit Reifestand einen Vorschlag; die anderen zählen als „ohne Wert“', () => {
    const noParents: BioBandingData = { inputs: { ...inputs, parentsConsent: false }, measurements: measure(165, 51).measurements };
    const noWeight: BioBandingData = { inputs, measurements: [{ id: 'm', date: '2026-10-01', height: 165, weight: null }] };
    const result = suggestBioBanding(
      [player('ok', 'Ok'), player('np', 'Ohne Eltern'), player('nw', 'Ohne Gewicht'), player('nd', 'Ohne Daten'), player('ld', 'Nicht geladen')],
      new Map<string, BioBandingData | null>([
        ['ok', measure(165, 51)],
        ['np', noParents],
        ['nw', noWeight],
        ['nd', { inputs, measurements: [] }],
        ['ld', null],
      ]),
      today,
    );
    expect(result.groups.flatMap((group) => group.players.map((entry) => entry.id))).toEqual(['ok']);
    expect(result.withoutValue).toBe(4);
  });

  it('lässt Spieler außerhalb von 12 bis 15 Jahren aus', () => {
    const data = measure(165, 51);
    const result = suggestBioBanding(
      [player('young', 'Jung', '2016-01-01'), player('old', 'Alt', '2008-01-01')],
      new Map([
        ['young', data],
        ['old', data],
      ]),
      today,
    );
    expect(result.groups.flatMap((group) => group.players)).toEqual([]);
    expect(result.withoutValue).toBe(2);
  });

  it('nutzt die jüngste Messung', () => {
    const data: BioBandingData = {
      inputs,
      measurements: [
        { id: 'a', date: '2026-04-01', height: 150, weight: 40 },
        { id: 'b', date: '2026-10-01', height: 178, weight: 60 },
      ],
    };
    const result = suggestBioBanding([player('p', 'Pia')], new Map([['p', data]]), today);
    expect(result.groups[3]!.players.map((entry) => entry.id)).toEqual(['p']);
  });

  it('macht für Spieler mit widerrufener Einwilligung keinen Vorschlag, auch wenn Daten übergeben werden (SCRUM-252)', () => {
    const tall = measure(178, 60);
    const result = suggestBioBanding(
      [{ ...player('r', 'Rita'), consentStatus: 'revoked' as const }, { ...player('g', 'Gina'), consentStatus: 'granted' as const }],
      new Map([
        ['r', tall],
        ['g', tall],
      ]),
      today,
    );
    expect(result.groups.flatMap((group) => group.players.map((entry) => entry.id))).toEqual(['g']);
    expect(result.withoutValue).toBe(1);
  });

  it('ohne Häkchen der Eltern (oder nach dem Löschen der Angaben) gibt es keinen Vorschlag mehr', () => {
    const withoutConsent: BioBandingData = { ...measure(165, 51), inputs: { ...inputs, parentsConsent: false } };
    const result = suggestBioBanding([player('p', 'Pia')], new Map([['p', withoutConsent]]), today);
    expect(result.withoutValue).toBe(1);
  });
});
