import { Injectable } from '@angular/core';

/** Dateien an den Nutzer ausgeben: Download einer Textdatei und Druckdialog für einen Bericht. Eigene Klasse, damit Tests sie ersetzen können. */
@Injectable({ providedIn: 'root' })
export class FileOutput {
  /** Speichert Text als Datei (Download im Browser). */
  saveText(fileName: string, text: string, mimeType = 'application/json'): void {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Öffnet den Druckdialog für ein HTML-Dokument („Als PDF speichern“). Das Dokument läuft in einem unsichtbaren,
   * sandboxed iframe: es kann weder Skripte ausführen noch auf die App zugreifen, und es gibt keinen Pop-up-Blocker.
   * Die Gestaltung (`css`) kommt nicht als Style-Element ins HTML, sondern wird per CSSOM gesetzt: das iframe erbt die
   * CSP der App, und dort sind Style-Elemente ohne `style-src 'unsafe-inline'` gesperrt (SCRUM-119/121).
   */
  print(html: string, css = ''): void {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-modals allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      if (doc && css) applyCss(doc, css);
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60_000);
    });
    frame.srcdoc = html;
    document.body.append(frame);
  }
}

/**
 * Setzt `css` als Stylesheet in `doc`: als konstruiertes Stylesheet (CSSOM, von `style-src` nicht betroffen) oder,
 * wo der Browser das nicht kann, als Style-Element wie bisher.
 */
export function applyCss(doc: Document, css: string): void {
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  const Sheet = view?.CSSStyleSheet;
  if (Sheet && 'adoptedStyleSheets' in doc && typeof Sheet.prototype.replaceSync === 'function') {
    // Das Stylesheet muss im Fenster des Dokuments entstehen, sonst lehnt der Browser es ab.
    const sheet = new Sheet();
    sheet.replaceSync(css);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    return;
  }
  const style = doc.createElement('style');
  style.textContent = css;
  doc.head.append(style);
}
