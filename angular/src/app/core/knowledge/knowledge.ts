/**
 * Wissen (SCRUM-106): vom Trainer gesammeltes Wissen für die Mannschaft – Links (Video, Playlist, Dokument) und
 * Glossar-Begriffe. Es wird nur verlinkt, nichts hochgeladen. Die Einträge liegen als Map `knowledge.{id}` im
 * Trainer-Dokument `teams/{teamId}/meta/settings` (nur Trainer lesbar; eine neue Unter-Sammlung wäre ohne Regeländerung
 * gesperrt, siehe firestore.rules).
 */

export type KnowledgeType = 'link' | 'glossary';

export const KNOWLEDGE_TYPES: readonly { readonly value: KnowledgeType; readonly label: string }[] = [
  { value: 'link', label: 'Link (Video, Playlist, Dokument)' },
  { value: 'glossary', label: 'Glossar-Begriff' },
];

/** Kurzbezeichnung für Filter und Anzeige. */
export function knowledgeTypeLabel(type: KnowledgeType): string {
  return type === 'link' ? 'Link' : 'Glossar';
}

export const MAX_KNOWLEDGE_TITLE = 120;
export const MAX_KNOWLEDGE_DESCRIPTION = 2000;
export const MAX_KNOWLEDGE_CATEGORY = 40;
export const MAX_KNOWLEDGE_URL = 2000;

export interface KnowledgeEntry {
  readonly id: string;
  readonly type: KnowledgeType;
  readonly title: string;
  /** Normalisierte https-Adresse; beim Glossar optional, beim Link immer gesetzt. */
  readonly url: string | null;
  readonly description: string;
  readonly category: string;
}

/** Formulareingaben (alles Text, noch ungeprüft). */
export interface KnowledgeDraft {
  readonly id: string | null;
  readonly type: KnowledgeType;
  readonly title: string;
  readonly url: string;
  readonly description: string;
  readonly category: string;
}

export type KnowledgeErrors = Partial<Record<'title' | 'url' | 'description' | 'category', string>>;

export function emptyKnowledgeDraft(): KnowledgeDraft {
  return { id: null, type: 'link', title: '', url: '', description: '', category: '' };
}

export function draftFromEntry(entry: KnowledgeEntry): KnowledgeDraft {
  return { id: entry.id, type: entry.type, title: entry.title, url: entry.url ?? '', description: entry.description, category: entry.category };
}

/**
 * Reine Prüfung einer Web-Adresse: nur `https://` mit Rechnername. Gibt die normalisierte Adresse zurück, sonst null.
 * Abgelehnt werden u. a. `javascript:`, `http:`, `data:`, `file:`, `//host`, Adressen ohne Schema, mit Leerzeichen oder
 * Steuerzeichen, mit Benutzername/Passwort (`https://harmlos.de@boese.de`) und Rechnernamen ohne Punkt.
 */
export function normalizeHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text === '' || text.length > MAX_KNOWLEDGE_URL) return null;
  // Schema muss wörtlich „https://“ sein, danach weder Leerraum, Steuerzeichen noch Rückwärtsschrägstrich: so
  // „repariert“ der URL-Parser nichts stillschweigend.
  // eslint-disable-next-line no-control-regex
  if (!/^https:\/\/(?!\/)[^\s\u0000-\u001f\u007f\\]+$/i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (!url.hostname.includes('.') || url.hostname.startsWith('.') || url.hostname.endsWith('.')) return null;
  return url.href;
}

/** Prüft die Eingaben; leeres Ergebnis = gültig. Link braucht eine Adresse, Glossar braucht die Erklärung. */
export function validateKnowledgeDraft(draft: KnowledgeDraft): KnowledgeErrors {
  const errors: KnowledgeErrors = {};
  const title = draft.title.trim();
  if (title === '') errors.title = 'Bitte einen Titel angeben.';
  else if (title.length > MAX_KNOWLEDGE_TITLE) errors.title = `Der Titel darf höchstens ${MAX_KNOWLEDGE_TITLE} Zeichen lang sein.`;
  const url = draft.url.trim();
  if (url === '') {
    if (draft.type === 'link') errors.url = 'Bitte einen Link angeben.';
  } else if (normalizeHttpsUrl(url) === null) {
    errors.url = 'Bitte eine gültige Adresse angeben, die mit https:// beginnt.';
  }
  const description = draft.description.trim();
  if (draft.type === 'glossary' && description === '') errors.description = 'Bitte den Begriff kurz erklären.';
  else if (description.length > MAX_KNOWLEDGE_DESCRIPTION) errors.description = `Der Text darf höchstens ${MAX_KNOWLEDGE_DESCRIPTION} Zeichen lang sein.`;
  if (draft.category.trim().length > MAX_KNOWLEDGE_CATEGORY) errors.category = `Die Kategorie darf höchstens ${MAX_KNOWLEDGE_CATEGORY} Zeichen lang sein.`;
  return errors;
}

/** Gültigen Entwurf in einen Eintrag umwandeln (nur nach leerem {@link validateKnowledgeDraft} aufrufen). */
export function entryFromDraft(draft: KnowledgeDraft, id: string): KnowledgeEntry {
  return {
    id,
    type: draft.type,
    title: draft.title.trim(),
    url: draft.url.trim() === '' ? null : normalizeHttpsUrl(draft.url),
    description: draft.description.trim(),
    category: draft.category.trim(),
  };
}

/** Felder eines Eintrags im Firestore-Dokument (ohne die ID, sie ist der Schlüssel in der Map). */
export function docFromEntry(entry: KnowledgeEntry): Record<string, unknown> {
  return { type: entry.type, title: entry.title, url: entry.url, description: entry.description, category: entry.category };
}

/**
 * Ein Eintrag aus dem Dokument; null, wenn er unbrauchbar ist (wird übersprungen, nie geraten). Die Adresse wird beim
 * Lesen noch einmal geprüft: ein Link ohne gültige https-Adresse wird nicht angezeigt, beim Glossar entfällt sie.
 */
export function entryFromDoc(id: string, data: unknown): KnowledgeEntry | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Record<string, unknown>;
  const type = raw['type'];
  if (type !== 'link' && type !== 'glossary') return null;
  const title = typeof raw['title'] === 'string' ? raw['title'].trim().slice(0, MAX_KNOWLEDGE_TITLE) : '';
  if (title === '') return null;
  const url = raw['url'] === null || raw['url'] === undefined ? null : normalizeHttpsUrl(raw['url']);
  if (type === 'link' && url === null) return null;
  return {
    id,
    type,
    title,
    url,
    description: typeof raw['description'] === 'string' ? raw['description'].trim().slice(0, MAX_KNOWLEDGE_DESCRIPTION) : '',
    category: typeof raw['category'] === 'string' ? raw['category'].trim().slice(0, MAX_KNOWLEDGE_CATEGORY) : '',
  };
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/** Alle brauchbaren Einträge aus dem Dokument, alphabetisch nach Titel. */
export function entriesFromDoc(doc: Readonly<Record<string, unknown>> | null): KnowledgeEntry[] {
  const map = doc?.['knowledge'];
  if (typeof map !== 'object' || map === null || Array.isArray(map)) return [];
  return Object.entries(map)
    .map(([id, data]) => entryFromDoc(id, data))
    .filter((entry): entry is KnowledgeEntry => entry !== null)
    .sort((a, b) => collator.compare(a.title, b.title) || a.id.localeCompare(b.id));
}

/** Die vorhandenen Kategorien, alphabetisch und ohne Doppelte (Groß-/Kleinschreibung egal). */
export function categoriesOf(entries: readonly Pick<KnowledgeEntry, 'category'>[]): string[] {
  const seen = new Map<string, string>();
  for (const { category } of entries) {
    const key = category.toLocaleLowerCase('de');
    if (category !== '' && !seen.has(key)) seen.set(key, category);
  }
  return [...seen.values()].sort((a, b) => collator.compare(a, b));
}

export interface KnowledgeFilter {
  /** 'all' oder ein Typ. */
  readonly type: KnowledgeType | 'all';
  /** Leer = alle Kategorien. */
  readonly category: string;
  readonly query: string;
}

export const NO_FILTER: KnowledgeFilter = { type: 'all', category: '', query: '' };

/** Filtert nach Typ, Kategorie und Suchtext (Titel, Beschreibung, Kategorie; Groß-/Kleinschreibung egal). */
export function filterEntries(entries: readonly KnowledgeEntry[], filter: KnowledgeFilter): KnowledgeEntry[] {
  const query = filter.query.trim().toLocaleLowerCase('de');
  const category = filter.category.toLocaleLowerCase('de');
  return entries.filter((entry) => {
    if (filter.type !== 'all' && entry.type !== filter.type) return false;
    if (category !== '' && entry.category.toLocaleLowerCase('de') !== category) return false;
    if (query === '') return true;
    return [entry.title, entry.description, entry.category].some((text) => text.toLocaleLowerCase('de').includes(query));
  });
}

/** Rechnername für die Anzeige unter dem Titel, z. B. „youtube.com“. */
export function urlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
