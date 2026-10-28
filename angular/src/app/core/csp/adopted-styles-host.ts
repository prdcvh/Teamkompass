import { DOCUMENT, Injectable, OnDestroy, inject } from '@angular/core';
import { ɵSharedStylesHost as SharedStylesHost } from '@angular/platform-browser';

/**
 * PROTOTYP (SCRUM-119/121): Komponenten-Styles über CSSOM (`document.adoptedStyleSheets`) statt Style-Elementen.
 * CSSOM ist von `style-src` nicht betroffen; Style-Elemente bräuchten `'unsafe-inline'`.
 */
@Injectable()
export class AdoptedStylesHost implements OnDestroy {
  private readonly doc = inject(DOCUMENT);
  private readonly sheets = new Map<string, { usage: number; sheet: CSSStyleSheet }>();

  addStyles(styles: string[], urls?: string[]): void {
    for (const css of styles) {
      const record = this.sheets.get(css);
      if (record) {
        record.usage++;
        continue;
      }
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      this.sheets.set(css, { usage: 1, sheet });
      this.doc.adoptedStyleSheets = [...this.doc.adoptedStyleSheets, sheet];
    }
    if (urls?.length) throw new Error('Externe Komponenten-Styles werden nicht unterstützt');
  }

  removeStyles(styles: string[]): void {
    for (const css of styles) {
      const record = this.sheets.get(css);
      if (!record || --record.usage > 0) continue;
      this.sheets.delete(css);
      this.doc.adoptedStyleSheets = this.doc.adoptedStyleSheets.filter((sheet) => sheet !== record.sheet);
    }
  }

  addHost(): void {}
  removeHost(): void {}

  ngOnDestroy(): void {
    const own = new Set([...this.sheets.values()].map((record) => record.sheet));
    this.doc.adoptedStyleSheets = this.doc.adoptedStyleSheets.filter((sheet) => !own.has(sheet));
    this.sheets.clear();
  }
}

export const provideAdoptedStyles = () => [{ provide: SharedStylesHost, useClass: AdoptedStylesHost }];
