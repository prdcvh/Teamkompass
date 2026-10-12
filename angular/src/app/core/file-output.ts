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
   */
  print(html: string): void {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-modals allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    frame.addEventListener('load', () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60_000);
    });
    frame.srcdoc = html;
    document.body.append(frame);
  }
}
