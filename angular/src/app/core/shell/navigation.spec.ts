import { MORE_GROUPS, SIDEBAR_ITEMS, TAB_ITEMS } from './navigation';

describe('Navigation', () => {
  it('jede Seite der Seitenleiste ist am Handy in der Tab-Leiste oder im „Mehr“-Menü erreichbar', () => {
    const mobile = new Set([
      ...TAB_ITEMS.map((item) => item.path),
      ...MORE_GROUPS.flatMap((group) => group.items).map((item) => item.path),
    ]);
    const missing = SIDEBAR_ITEMS.map((item) => item.path).filter((path) => !mobile.has(path));
    expect(missing).toEqual([]);
  });

  it('Aufstellung steht unter „Mehr → Bereiche“ mit Hinweistext', () => {
    const bereiche = MORE_GROUPS.find((group) => group.title === 'Bereiche');
    const item = bereiche?.items.find((entry) => entry.path === '/aufstellung');
    expect(item?.hint).toBeTruthy();
  });
});
