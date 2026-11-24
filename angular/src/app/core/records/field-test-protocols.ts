/**
 * Feldtests (SCRUM-263): Katalog der standardisierten Testprotokolle als Code. Reine Daten ohne Angular.
 *
 * Ein Protokoll legt fest, WIE gemessen wird (Aufbau, Ablauf, gültige Versuche), in welcher Einheit, welche Richtung
 * besser ist („kleiner ist besser“ bei Zeiten, „größer ist besser“ bei Höhe, Distanz, Treffern), wie viele Versuche
 * es gibt und nach welcher Regel aus den Versuchen das Ergebnis gebildet wird. Jede Messung speichert Kennung UND
 * Version des Protokolls; ändert sich der Aufbau, kommt eine neue Version dazu (die alte bleibt im Katalog, damit alte
 * Ergebnisse lesbar bleiben). Ergebnisse verschiedener Versionen oder Messmethoden werden nur mit Warnung verglichen.
 *
 * Bewusst keine Gesamtnote und keine Normwerte: Feldtests beschreiben einzelne Fähigkeiten. z-Werte/Perzentile im Team
 * (SCRUM-264) rechnet field-test-reference.ts, nur innerhalb gleicher Protokollversion und Methode.
 *
 * Wertebereiche sind harte Eingabegrenzen (darunter/darüber ist es fast sicher ein Tipp- oder Einheitenfehler) und
 * EIGENE VORSCHLAGSWERTE für U13–U21, keine Leistungsnormen.
 */

export type FieldTestDirection = 'lower' | 'higher';
/** `best`: bester gültiger Versuch; `mean`: Mittelwert der gültigen Versuche (mindestens `minValid`). */
export type FieldTestAggregation = 'best' | 'mean';
export type FieldTestUnit = 's' | 'cm' | 'm' | 'Treffer';
export type FieldTestMethod = 'light-gate' | 'stopwatch' | 'video' | 'contact-mat' | 'force-plate' | 'jump-app' | 'audio' | 'observer';
export type FieldTestSurface = 'artificial' | 'grass' | 'indoor' | 'track' | 'other';

export interface FieldTestProtocol {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly category: 'Physis' | 'Technik';
  readonly unit: FieldTestUnit;
  readonly direction: FieldTestDirection;
  readonly aggregation: FieldTestAggregation;
  /** Anzahl Versuche je Spieler (Eingabefelder). */
  readonly attempts: number;
  /** So viele gültige Versuche braucht ein Ergebnis (bei `mean` mindestens 2). */
  readonly minValid: number;
  /** Harte Eingabegrenzen in der Einheit des Protokolls. */
  readonly min: number;
  readonly max: number;
  /** Höchstens so viele Nachkommastellen. */
  readonly decimals: number;
  /** Werte müssen ein Vielfaches davon sein (Yo-Yo: 40 m). */
  readonly step?: number;
  /** Erlaubte Messmethoden; die erste ist die empfohlene. */
  readonly methods: readonly FieldTestMethod[];
  /** Aufbau und Ablauf in Stichpunkten (wird bei der Erfassung angezeigt). */
  readonly setup: readonly string[];
}

export const METHOD_LABELS: Readonly<Record<FieldTestMethod, string>> = {
  'light-gate': 'Lichtschranke',
  stopwatch: 'Handstoppung (Stoppuhr)',
  video: 'Video (Auswertung Bild für Bild)',
  'contact-mat': 'Kontaktmatte',
  'force-plate': 'Kraftmessplatte',
  'jump-app': 'Sprung-App (Video)',
  audio: 'Original-Audiodatei',
  observer: 'Zählen durch Beobachter',
};

export const SURFACE_LABELS: Readonly<Record<FieldTestSurface, string>> = {
  artificial: 'Kunstrasen',
  grass: 'Naturrasen',
  indoor: 'Halle',
  track: 'Tartanbahn',
  other: 'Sonstiger Untergrund',
};

export const DIRECTION_LABELS: Readonly<Record<FieldTestDirection, string>> = {
  lower: 'kleiner ist besser',
  higher: 'größer ist besser',
};

const SPRINT_SETUP = (distance: number): string[] => [
  `Strecke ${distance} m, Zeitmessung bei 0 m und ${distance} m (Lichtschranken auf Hüfthöhe).`,
  'Hochstart, vordere Fußspitze 0,5 m hinter der Startlinie; der Spieler startet selbst (kein Startsignal).',
  '3 Versuche, dazwischen mindestens 2 Minuten Pause; Fußballschuhe; Untergrund notieren.',
  'Ungültig: Fehlstart, Ausrutschen, Lichtschranke nicht sauber ausgelöst.',
  'Handstoppung ist deutlich ungenauer als die Lichtschranke – Ergebnisse nur mit derselben Methode vergleichen.',
];

const COD_SETUP = (side: string): string[] => [
  '10 m Anlauf bis zur Lichtschranke, weitere 5 m bis zur Wendelinie, 180°-Wende, 5 m zurück durch die Lichtschranke.',
  'Gemessen wird nur die Zeit für 5 m hin und 5 m zurück (ab der Lichtschranke).',
  `Gewendet wird mit dem ${side} Fuß auf der Linie. Andere Seite = eigener Test.`,
  '3 Versuche, dazwischen mindestens 2 Minuten Pause.',
  'Ungültig: Linie nicht mit dem Fuß erreicht oder mit dem falschen Fuß gewendet.',
];

/**
 * Alle Protokolle in allen Versionen. Neue Version = neuer Eintrag mit gleicher `id` und höherer `version`; alte
 * Einträge bleiben stehen, damit bestehende Ergebnisse ihre Regel und Einheit behalten.
 */
export const FIELD_TEST_PROTOCOLS: readonly FieldTestProtocol[] = [
  {
    id: 'sprint-10',
    version: '1.0',
    name: '10-m-Sprint',
    category: 'Physis',
    unit: 's',
    direction: 'lower',
    aggregation: 'best',
    attempts: 3,
    minValid: 1,
    min: 1,
    max: 4,
    decimals: 2,
    methods: ['light-gate', 'video', 'stopwatch'],
    setup: SPRINT_SETUP(10),
  },
  {
    id: 'sprint-20',
    version: '1.0',
    name: '20-m-Sprint',
    category: 'Physis',
    unit: 's',
    direction: 'lower',
    aggregation: 'best',
    attempts: 3,
    minValid: 1,
    min: 2,
    max: 6,
    decimals: 2,
    methods: ['light-gate', 'video', 'stopwatch'],
    setup: SPRINT_SETUP(20),
  },
  {
    id: 'cod-505-left',
    version: '1.0',
    name: '505-Richtungswechsel (Wende links)',
    category: 'Physis',
    unit: 's',
    direction: 'lower',
    aggregation: 'best',
    attempts: 3,
    minValid: 1,
    min: 1.5,
    max: 5,
    decimals: 2,
    methods: ['light-gate', 'video', 'stopwatch'],
    setup: COD_SETUP('linken'),
  },
  {
    id: 'cod-505-right',
    version: '1.0',
    name: '505-Richtungswechsel (Wende rechts)',
    category: 'Physis',
    unit: 's',
    direction: 'lower',
    aggregation: 'best',
    attempts: 3,
    minValid: 1,
    min: 1.5,
    max: 5,
    decimals: 2,
    methods: ['light-gate', 'video', 'stopwatch'],
    setup: COD_SETUP('rechten'),
  },
  {
    id: 'cmj',
    version: '1.0',
    name: 'Counter-Movement-Jump (CMJ)',
    category: 'Physis',
    unit: 'cm',
    direction: 'higher',
    aggregation: 'mean',
    attempts: 3,
    minValid: 2,
    min: 5,
    max: 80,
    decimals: 1,
    methods: ['contact-mat', 'force-plate', 'jump-app'],
    setup: [
      'Hände bleiben während des ganzen Sprungs in der Hüfte (kein Armschwung).',
      'Aus dem aufrechten Stand schnell in die Hocke und sofort maximal nach oben springen; Landung auf beiden Füßen mit gestreckten Beinen.',
      '3 Sprünge, dazwischen 30–60 Sekunden Pause.',
      'Ungültig: Armschwung, angezogene Beine in der Luft, Landung außerhalb der Matte.',
      'Ergebnis = Mittelwert der gültigen Sprünge (mindestens 2), weil einzelne Sprünge stark schwanken.',
    ],
  },
  {
    id: 'yoyo-ir1',
    version: '1.0',
    name: 'Yo-Yo Intermittent Recovery Test Level 1',
    category: 'Physis',
    unit: 'm',
    direction: 'higher',
    aggregation: 'best',
    attempts: 1,
    minValid: 1,
    min: 40,
    max: 5000,
    decimals: 0,
    step: 40,
    methods: ['audio'],
    setup: [
      'Pendelstrecke 2 × 20 m, dahinter 5 m Zone für die 10 Sekunden aktive Pause.',
      'Tempo kommt ausschließlich aus der Original-Audiodatei Level 1.',
      'Abbruch nach dem zweiten verpassten Signal; gewertet wird die zuletzt vollständig gelaufene Strecke.',
      'Ergebnis = Gesamtstrecke in Metern (immer ein Vielfaches von 40).',
    ],
  },
  {
    id: 'passing',
    version: '1.0',
    name: 'Pass- und Ballannahmetest (Vereinsprotokoll)',
    category: 'Technik',
    unit: 'Treffer',
    direction: 'higher',
    aggregation: 'best',
    attempts: 2,
    minValid: 1,
    min: 0,
    max: 10,
    decimals: 0,
    methods: ['observer', 'video'],
    setup: [
      'Vereinsprotokoll, kein allgemeiner Standard: Aufbau (Abstand, Zielgröße) vor dem ersten Termin festlegen und danach nicht ändern – sonst neue Version.',
      '10 Pässe in festem Ablauf (5 rechts, 5 links) auf ein Ziel; jeder Rückpass wird in der markierten Annahmezone angenommen.',
      'Treffer = Pass im Ziel UND Ball in der Annahmezone kontrolliert.',
      '2 Durchgänge; gewertet wird der bessere.',
    ],
  },
  {
    id: 'dribbling',
    version: '1.0',
    name: 'Dribbling-Slalom (Vereinsprotokoll)',
    category: 'Technik',
    unit: 's',
    direction: 'lower',
    aggregation: 'best',
    attempts: 2,
    minValid: 1,
    min: 3,
    max: 60,
    decimals: 2,
    methods: ['light-gate', 'video', 'stopwatch'],
    setup: [
      'Vereinsprotokoll, kein allgemeiner Standard: Stangenzahl und Abstände vor dem ersten Termin festlegen und danach nicht ändern – sonst neue Version.',
      'Start hinter der Startlinie, Ball am Fuß; jede Stange wird umspielt, Ziel mit Ball am Fuß.',
      '2 Durchgänge mit mindestens 2 Minuten Pause; gewertet wird der schnellere gültige.',
      'Ungültig: Stange ausgelassen oder umgeworfen, Ball verloren.',
    ],
  },
];

function versionNumber(version: string): number[] {
  return version.split('.').map((part) => Number(part) || 0);
}

function newerVersion(a: string, b: string): boolean {
  const [left, right] = [versionNumber(a), versionNumber(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** Die aktuelle (höchste) Version je Protokoll – das, was bei neuen Messungen angeboten wird. */
export function currentProtocols(): FieldTestProtocol[] {
  const byId = new Map<string, FieldTestProtocol>();
  for (const protocol of FIELD_TEST_PROTOCOLS) {
    const known = byId.get(protocol.id);
    if (!known || newerVersion(protocol.version, known.version)) byId.set(protocol.id, protocol);
  }
  return [...byId.values()];
}

/** Genau diese Version eines Protokolls; unbekannt → null (das Ergebnis bleibt lesbar, nur ohne Regel). */
export function findProtocol(id: string, version: string): FieldTestProtocol | null {
  return FIELD_TEST_PROTOCOLS.find((protocol) => protocol.id === id && protocol.version === version) ?? null;
}

/** Aktuelle Version eines Protokolls (für Name und Richtung bei unbekannter Version). */
export function currentProtocol(id: string): FieldTestProtocol | null {
  return currentProtocols().find((protocol) => protocol.id === id) ?? null;
}

/** Transparente Regel als Text, z. B. „bester gültiger Versuch (kleinster Wert)“. */
export function aggregationText(protocol: Pick<FieldTestProtocol, 'aggregation' | 'direction' | 'minValid'>): string {
  if (protocol.aggregation === 'mean') return `Mittelwert der gültigen Versuche (mindestens ${protocol.minValid})`;
  return `bester gültiger Versuch (${protocol.direction === 'lower' ? 'kleinster' : 'größter'} Wert)`;
}
