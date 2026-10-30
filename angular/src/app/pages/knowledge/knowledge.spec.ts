import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { MORE_GROUPS, SIDEBAR_ITEMS } from '../../core/shell/navigation';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Knowledge } from './knowledge';

describe('Wissen (Seite, SCRUM-106)', () => {
  let firebase: FakeFirebase;

  const seed = {
    knowledge: {
      a: { type: 'link', title: 'Pressing Video', url: 'https://www.youtube.com/watch?v=abc', description: 'Anlaufen', category: 'Taktik' },
      b: { type: 'glossary', title: 'Abseits', url: null, description: 'Regel 11', category: 'Regeln' },
      c: { type: 'link', title: 'Spielsystem PDF', url: 'https://drive.google.com/file/d/1/view', description: '', category: 'Taktik' },
      d: { type: 'link', title: 'Böse', url: 'javascript:alert(1)', description: '', category: '' },
    },
  };

  async function render(doc: Record<string, unknown> | null = seed) {
    firebase = new FakeFirebase();
    firebase.knowledge.doc = doc;
    await TestBed.configureTestingModule({ imports: [Knowledge], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Knowledge);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const titles = (fixture: { nativeElement: unknown }) => [...root(fixture).querySelectorAll('[data-testid="entry-list"] .what strong')].map((e) => e.textContent?.trim());
  const field = (fixture: { nativeElement: unknown }, name: string) => root(fixture).querySelector(`[name="${name}"]`) as HTMLInputElement;
  function type(input: HTMLInputElement, value: string, event = 'input') {
    input.value = value;
    input.dispatchEvent(new Event(event, { bubbles: true }));
  }
  const submit = (fixture: { nativeElement: unknown }) => (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
  const editButton = (fixture: { nativeElement: unknown }, title: string) =>
    [...root(fixture).querySelectorAll<HTMLButtonElement>('.row button')].find((b) => b.getAttribute('aria-label') === `Eintrag bearbeiten: ${title}`);

  it('zeigt eine leere Seite mit Hinweis', async () => {
    const fixture = await render(null);
    expect(root(fixture).textContent).toContain('Noch kein Eintrag angelegt.');
  });

  it('listet Einträge alphabetisch, ohne unsichere Links', async () => {
    const fixture = await render();
    expect(titles(fixture)).toEqual(['Abseits', 'Pressing Video', 'Spielsystem PDF']);
  });

  it('öffnet Links in neuem Tab mit rel noopener noreferrer, nur https', async () => {
    const fixture = await render();
    const anchors = [...root(fixture).querySelectorAll<HTMLAnchorElement>('a.link')];
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noopener noreferrer');
      expect(a.getAttribute('href')).toMatch(/^https:\/\//);
    }
    expect(root(fixture).innerHTML).not.toContain('javascript:');
    expect(root(fixture).querySelector('[style]')).toBeNull();
  });

  it('filtert nach Typ, Kategorie und Suchtext', async () => {
    const fixture = await render();
    type(field(fixture, 'type'), 'glossary', 'change');
    await fixture.whenStable();
    expect(titles(fixture)).toEqual(['Abseits']);
    type(field(fixture, 'type'), 'all', 'change');
    type(field(fixture, 'category'), 'Taktik', 'change');
    await fixture.whenStable();
    expect(titles(fixture)).toEqual(['Pressing Video', 'Spielsystem PDF']);
    type(field(fixture, 'query'), 'pdf');
    await fixture.whenStable();
    expect(titles(fixture)).toEqual(['Spielsystem PDF']);
    type(field(fixture, 'query'), 'gibtesnicht');
    await fixture.whenStable();
    expect(root(fixture).textContent).toContain('Kein Eintrag passt zu diesem Filter.');
    (root(fixture).querySelector('.empty button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(titles(fixture)).toHaveLength(3);
  });

  it('legt einen Link an und lehnt javascript:/http: im Formular ab', async () => {
    const fixture = await render(null);
    (root(fixture).querySelector('.head button') as HTMLButtonElement).click();
    await fixture.whenStable();
    type(field(fixture, 'title'), 'Konter');
    type(field(fixture, 'url'), 'javascript:alert(1)');
    submit(fixture);
    await fixture.whenStable();
    expect(root(fixture).querySelector('#err-url')?.textContent).toContain('https://');
    type(field(fixture, 'url'), 'http://example.com/v');
    submit(fixture);
    await fixture.whenStable();
    expect(root(fixture).querySelector('#err-url')).not.toBeNull();
    expect(Object.keys(firebase.knowledge.knowledge)).toHaveLength(0);
    type(field(fixture, 'url'), 'https://example.com/v');
    type(field(fixture, 'category'), 'Taktik');
    submit(fixture);
    await vi.waitFor(() => expect(Object.keys(firebase.knowledge.knowledge)).toHaveLength(1));
    await fixture.whenStable();
    expect(titles(fixture)).toEqual(['Konter']);
  });

  it('Glossar-Begriff braucht die Erklärung, den Link nicht', async () => {
    const fixture = await render(null);
    (root(fixture).querySelector('.head button') as HTMLButtonElement).click();
    await fixture.whenStable();
    type(field(fixture, 'type'), 'glossary', 'change');
    await fixture.whenStable();
    type(field(fixture, 'title'), 'Raumdeckung');
    submit(fixture);
    await fixture.whenStable();
    expect(root(fixture).querySelector('#err-description')).not.toBeNull();
    expect(root(fixture).querySelector('#err-url')).toBeNull();
    type(field(fixture, 'description'), 'Jeder deckt einen Raum');
    submit(fixture);
    await vi.waitFor(() => expect(Object.keys(firebase.knowledge.knowledge)).toHaveLength(1));
  });

  it('bearbeitet und löscht mit Rückfrage', async () => {
    const fixture = await render();
    editButton(fixture, 'Abseits')?.click();
    await fixture.whenStable();
    expect(field(fixture, 'title').value).toBe('Abseits');
    type(field(fixture, 'title'), 'Abseitsregel');
    submit(fixture);
    await vi.waitFor(() => expect((firebase.knowledge.knowledge['b'] as { title: string }).title).toBe('Abseitsregel'));
    await fixture.whenStable();

    editButton(fixture, 'Abseitsregel')?.click();
    await fixture.whenStable();
    (root(fixture).querySelector('form .delete') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root(fixture).textContent).toContain('Der Eintrag „Abseitsregel“ wird gelöscht');
    expect(firebase.knowledge.knowledge['b']).toBeDefined();
    const confirm = [...root(fixture).querySelectorAll<HTMLButtonElement>('.confirm-actions button')].find((b) => b.textContent?.includes('Endgültig'));
    confirm?.click();
    await vi.waitFor(() => expect(firebase.knowledge.knowledge['b']).toBeUndefined());
  });

  it('der Wissen-Eintrag steht in Sidebar und Mehr-Menü', () => {
    expect(SIDEBAR_ITEMS.map((item) => item.path)).toContain('/wissen');
    expect(MORE_GROUPS.flatMap((group) => group.items).map((item) => item.path)).toContain('/wissen');
  });
});
