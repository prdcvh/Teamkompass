import { describe, expect, it } from 'vitest';
import { applyCss } from './file-output';

describe('applyCss (SCRUM-119/121)', () => {
  it('setzt die Gestaltung als konstruiertes Stylesheet, wenn der Browser das kann (CSSOM, ohne <style>)', () => {
    const made: { css: string }[] = [];
    class FakeSheet {
      css = '';
      replaceSync(css: string): void {
        this.css = css;
        made.push(this);
      }
    }
    const appended: unknown[] = [];
    const doc = {
      adoptedStyleSheets: [] as unknown[],
      defaultView: { CSSStyleSheet: FakeSheet },
      createElement: () => ({}),
      head: { append: (node: unknown) => appended.push(node) },
    };
    applyCss(doc as unknown as Document, 'body { margin: 32px; }');
    expect(made.map((sheet) => sheet.css)).toEqual(['body { margin: 32px; }']);
    expect(doc.adoptedStyleSheets).toEqual(made);
    expect(appended).toEqual([]);
  });

  it('fällt ohne konstruierbare Stylesheets auf ein <style>-Element zurück', () => {
    const doc = document.implementation.createHTMLDocument('Bericht');
    Object.defineProperty(doc, 'defaultView', { value: null });
    applyCss(doc, 'h1 { font-size: 30px; }');
    expect(doc.head.querySelector('style')?.textContent).toBe('h1 { font-size: 30px; }');
  });
});
