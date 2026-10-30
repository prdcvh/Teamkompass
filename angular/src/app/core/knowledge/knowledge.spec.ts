import {
  categoriesOf,
  docFromEntry,
  draftFromEntry,
  emptyKnowledgeDraft,
  entriesFromDoc,
  entryFromDoc,
  entryFromDraft,
  filterEntries,
  MAX_KNOWLEDGE_TITLE,
  normalizeHttpsUrl,
  urlHost,
  validateKnowledgeDraft,
  type KnowledgeEntry,
} from './knowledge';

describe('normalizeHttpsUrl', () => {
  it('nimmt gültige https-Adressen an und normalisiert sie', () => {
    expect(normalizeHttpsUrl('https://www.youtube.com/watch?v=abc')).toBe('https://www.youtube.com/watch?v=abc');
    expect(normalizeHttpsUrl('  HTTPS://Example.com  ')).toBe('https://example.com/');
    expect(normalizeHttpsUrl('https://drive.google.com/file/d/1/view?usp=sharing#x')).toBe('https://drive.google.com/file/d/1/view?usp=sharing#x');
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'http://example.com',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com',
    'vbscript:x',
    'blob:https://example.com/abc',
    '//example.com',
    'example.com',
    'www.example.com',
    'https:example.com',
    'https:/example.com',
    'https://',
    'https:///example.com',
    'https://localhost',
    'https://exa mple.com',
    'https://example.com/a b',
    'https://example.com\\evil.com',
    'https://harmlos.de@boese.de',
    'https://user:pw@example.com',
    'https://.example.com',
    'https://example.com./x',
    ' javascript:alert(1)//https://example.com',
    'https://example.com\n/x',
    'https://example.com\u0000',
    '',
    '   ',
  ])('lehnt %j ab', (input) => {
    expect(normalizeHttpsUrl(input)).toBeNull();
  });

  it('lehnt Nicht-Texte und zu lange Adressen ab', () => {
    expect(normalizeHttpsUrl(null)).toBeNull();
    expect(normalizeHttpsUrl(undefined)).toBeNull();
    expect(normalizeHttpsUrl(42)).toBeNull();
    expect(normalizeHttpsUrl(`https://example.com/${'a'.repeat(2000)}`)).toBeNull();
  });
});

describe('validateKnowledgeDraft', () => {
  const link = { ...emptyKnowledgeDraft(), title: 'Pressing', url: 'https://example.com/v' };

  it('akzeptiert einen Link mit Titel und Adresse', () => {
    expect(validateKnowledgeDraft(link)).toEqual({});
  });

  it('verlangt Titel und, beim Link, eine https-Adresse', () => {
    expect(validateKnowledgeDraft({ ...link, title: '  ' }).title).toBeDefined();
    expect(validateKnowledgeDraft({ ...link, title: 'x'.repeat(MAX_KNOWLEDGE_TITLE + 1) }).title).toBeDefined();
    expect(validateKnowledgeDraft({ ...link, url: '' }).url).toContain('Link');
    expect(validateKnowledgeDraft({ ...link, url: 'http://example.com' }).url).toContain('https://');
    expect(validateKnowledgeDraft({ ...link, url: 'javascript:alert(1)' }).url).toBeDefined();
  });

  it('Glossar: Erklärung Pflicht, Adresse optional, aber wenn vorhanden gültig', () => {
    const term = { ...emptyKnowledgeDraft(), type: 'glossary' as const, title: 'Abseits' };
    expect(validateKnowledgeDraft(term).description).toBeDefined();
    expect(validateKnowledgeDraft({ ...term, description: 'Regel 11' })).toEqual({});
    expect(validateKnowledgeDraft({ ...term, description: 'Regel 11', url: 'data:text/plain,x' }).url).toBeDefined();
    expect(validateKnowledgeDraft({ ...term, description: 'Regel 11', url: 'https://example.com/regel' })).toEqual({});
  });

  it('begrenzt Beschreibung und Kategorie', () => {
    expect(validateKnowledgeDraft({ ...link, description: 'x'.repeat(2001) }).description).toBeDefined();
    expect(validateKnowledgeDraft({ ...link, category: 'x'.repeat(41) }).category).toBeDefined();
  });
});

describe('Eintrag <-> Dokument', () => {
  it('wandelt Entwurf, Dokument und zurück', () => {
    const entry = entryFromDraft({ ...emptyKnowledgeDraft(), title: ' Pressing ', url: ' https://Example.com/v ', description: ' kurz ', category: ' Taktik ' }, 'k1');
    expect(entry).toEqual({ id: 'k1', type: 'link', title: 'Pressing', url: 'https://example.com/v', description: 'kurz', category: 'Taktik' });
    expect(entryFromDoc('k1', docFromEntry(entry))).toEqual(entry);
    expect(draftFromEntry(entry)).toMatchObject({ id: 'k1', url: 'https://example.com/v', category: 'Taktik' });
  });

  it('Glossar ohne Adresse', () => {
    const entry = entryFromDraft({ ...emptyKnowledgeDraft(), type: 'glossary', title: 'Abseits', description: 'Regel' }, 'g');
    expect(entry.url).toBeNull();
    expect(entryFromDoc('g', docFromEntry(entry))).toEqual(entry);
  });

  it('überspringt unbrauchbare und unsichere Einträge beim Lesen', () => {
    expect(entryFromDoc('a', null)).toBeNull();
    expect(entryFromDoc('a', 'x')).toBeNull();
    expect(entryFromDoc('a', { type: 'video', title: 'x', url: 'https://example.com' })).toBeNull();
    expect(entryFromDoc('a', { type: 'link', title: '', url: 'https://example.com' })).toBeNull();
    expect(entryFromDoc('a', { type: 'link', title: 'x', url: 'javascript:alert(1)' })).toBeNull();
    expect(entryFromDoc('a', { type: 'link', title: 'x', url: 'http://example.com' })).toBeNull();
    expect(entryFromDoc('a', { type: 'link', title: 'x', url: null })).toBeNull();
    expect(entryFromDoc('a', { type: 'glossary', title: 'x', url: 'javascript:alert(1)', description: 'd' })).toMatchObject({ url: null });
  });

  it('liest alle Einträge alphabetisch', () => {
    const doc = {
      knowledge: {
        b: { type: 'glossary', title: 'Zonendeckung', description: 'd' },
        a: { type: 'link', title: 'abseits-Video', url: 'https://example.com/a' },
        c: { type: 'link', title: 'kaputt', url: 'javascript:1' },
      },
    };
    expect(entriesFromDoc(doc).map((e) => e.id)).toEqual(['a', 'b']);
    expect(entriesFromDoc(null)).toEqual([]);
    expect(entriesFromDoc({ knowledge: [] })).toEqual([]);
    expect(entriesFromDoc({ knowledge: 'x' })).toEqual([]);
  });
});

describe('Filter und Kategorien', () => {
  const entries: KnowledgeEntry[] = [
    { id: '1', type: 'link', title: 'Pressing Video', url: 'https://example.com/1', description: 'Anlaufen im Mittelfeld', category: 'Taktik' },
    { id: '2', type: 'glossary', title: 'Abseits', url: null, description: 'Regel 11', category: 'Regeln' },
    { id: '3', type: 'link', title: 'Dehnübungen', url: 'https://example.com/3', description: '', category: 'taktik' },
    { id: '4', type: 'glossary', title: 'Gegenpressing', url: null, description: 'Sofort nach Ballverlust', category: '' },
  ];
  const f = (patch: object) => filterEntries(entries, { type: 'all', category: '', query: '', ...patch }).map((e) => e.id);

  it('ohne Filter alles', () => expect(f({})).toEqual(['1', '2', '3', '4']));
  it('nach Typ', () => {
    expect(f({ type: 'link' })).toEqual(['1', '3']);
    expect(f({ type: 'glossary' })).toEqual(['2', '4']);
  });
  it('nach Kategorie, Groß-/Kleinschreibung egal', () => expect(f({ category: 'Taktik' })).toEqual(['1', '3']));
  it('Suche in Titel, Beschreibung und Kategorie', () => {
    expect(f({ query: 'PRESSING' })).toEqual(['1', '4']);
    expect(f({ query: 'regel' })).toEqual(['2']);
    expect(f({ query: 'nichts' })).toEqual([]);
  });
  it('kombiniert', () => expect(f({ type: 'link', category: 'taktik', query: 'dehn' })).toEqual(['3']));
  it('Kategorien ohne Doppelte', () => expect(categoriesOf(entries)).toEqual(['Regeln', 'Taktik']));
  it('zeigt den Rechnernamen', () => {
    expect(urlHost('https://www.youtube.com/watch')).toBe('youtube.com');
    expect(urlHost('kaputt')).toBe('');
  });
});
