/**
 * Freigabe der Noten eines Spielers (SCRUM-115): `teams/{teamId}/gradeReleases/{playerId}`.
 * - `publishedUntil`: Zeitpunkt des Klicks auf „Bewertung veröffentlichen“ (Server-Zeit). Freigegeben sind nur Noten,
 *   die bis dahin vergeben wurden; neuere bleiben bis zur nächsten Veröffentlichung verborgen.
 * - `expiresAt`: Ende der Freigabe (null = unbefristet), Dauer wie bei Einladungscodes in Tagen.
 * Zurücknehmen = Dokument löschen. Durchgesetzt wird das in `firestore.rules`; die App blendet zusätzlich aus.
 */
export interface GradeRelease {
  readonly publishedUntil: Date;
  readonly expiresAt: Date | null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

/** Dokument → Freigabe; ohne gültigen Veröffentlichungszeitpunkt (z. B. Server-Zeit noch ausstehend) keine. */
export function releaseFromDoc(data: Readonly<Record<string, unknown>> | null): GradeRelease | null {
  if (!data) return null;
  const publishedUntil = toDate(data['publishedUntil']);
  if (!publishedUntil) return null;
  return { publishedUntil, expiresAt: toDate(data['expiresAt']) };
}

/** Gilt die Freigabe gerade? */
export function isReleaseActive(release: GradeRelease | null, now: Date = new Date()): release is GradeRelease {
  return release !== null && (release.expiresAt === null || release.expiresAt.getTime() > now.getTime());
}

function dateLabel(value: Date): string {
  return value.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function dateTimeLabel(value: Date): string {
  return `${dateLabel(value)}, ${value.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

/** Kurztext für Trainer und Spieler: was ist freigegeben und wie lange. */
export function releaseText(release: GradeRelease | null, now: Date = new Date()): string {
  if (!release) return 'Noten sind nicht veröffentlicht.';
  const expiresAt = release.expiresAt;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return `Freigabe abgelaufen am ${dateLabel(expiresAt)}.`;
  const until = expiresAt ? `sichtbar bis ${dateLabel(expiresAt)}` : 'unbefristet sichtbar';
  return `Noten bis ${dateTimeLabel(release.publishedUntil)} veröffentlicht, ${until}.`;
}
