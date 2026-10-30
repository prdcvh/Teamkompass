import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { formatDate } from '../../core/events/event';
import { EventsService } from '../../core/events/events.service';
import {
  type CheckedRow,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  TEMPLATE_FILE_NAME,
  checkRows,
  draftsToImport,
  parseSchedule,
  summarize,
  templateCsv,
} from '../../core/events/schedule-import';
import { FileOutput } from '../../core/export/file-output';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Liest eine CSV-Datei als Text: UTF-8, sonst (ältere Excel-Dateien) Windows-1252. */
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Spielplan-Import per CSV (SCRUM-189): Datei wählen (nur im Browser gelesen, nichts wird hochgeladen), Vorschau mit
 * Prüfung, dann alle Spiele in einem Schritt anlegen. Nur Trainer sehen den Einstieg (Seite „Events“).
 */
@Component({
  selector: 'tk-schedule-import-dialog',
  imports: [Dialog, Button],
  templateUrl: './schedule-import-dialog.html',
  styleUrl: './schedule-import-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleImportDialog {
  private readonly events = inject(EventsService);
  private readonly files = inject(FileOutput);

  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly maxRows = MAX_IMPORT_ROWS;
  protected readonly fileName = signal('');
  protected readonly fileError = signal('');
  protected readonly checked = signal<readonly CheckedRow[]>([]);
  protected readonly reading = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal('');
  protected readonly created = signal<number | null>(null);

  protected readonly summary = computed(() => summarize(this.checked()));
  protected readonly previewing = computed(() => this.checked().length > 0);
  /** Mit fehlerhaften Zeilen wird nichts angelegt: erst die Datei korrigieren. */
  protected readonly canCreate = computed(() => this.summary().ok > 0 && this.summary().errors === 0 && !this.busy() && this.events.canEdit());
  protected formatDate = formatDate;

  constructor() {
    effect(() => {
      if (this.open()) untracked(() => this.reset());
    });
  }

  private reset(): void {
    this.fileName.set('');
    this.fileError.set('');
    this.checked.set([]);
    this.reading.set(false);
    this.busy.set(false);
    this.failure.set('');
    this.created.set(null);
  }

  protected downloadTemplate(): void {
    // BOM, damit Excel die Umlaute richtig öffnet.
    this.files.saveText(TEMPLATE_FILE_NAME, `﻿${templateCsv()}`, 'text/csv;charset=utf-8');
  }

  protected async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.reading() || this.busy()) return;
    this.reset();
    this.fileName.set(file.name);
    if (file.size > MAX_IMPORT_BYTES) {
      this.fileError.set('Die Datei ist zu groß für einen Spielplan.');
      return;
    }
    this.reading.set(true);
    try {
      const parsed = parseSchedule(decodeCsv(await readFile(file)));
      if (parsed.fileError) {
        this.fileError.set(parsed.fileError);
        return;
      }
      // Für den Abgleich müssen auch ältere Saisons geladen sein, falls die Datei Spiele davor enthält.
      if (parsed.rows.some((row) => row.date !== '' && row.date < this.events.seasonStart())) this.events.showAllSeasons();
      const loaded = await this.events.whenLoaded();
      const games = loaded.filter((entry) => entry.type === 'Spiel');
      this.checked.set(checkRows(parsed.rows, games));
    } catch {
      this.fileError.set('Die Datei konnte nicht gelesen werden.');
    } finally {
      this.reading.set(false);
    }
  }

  protected async create(): Promise<void> {
    if (!this.canCreate()) return;
    this.busy.set(true);
    this.failure.set('');
    try {
      const drafts = draftsToImport(this.checked());
      const error = await this.events.importGames(drafts);
      if (error) this.failure.set(error);
      else this.created.set(drafts.length);
    } finally {
      this.busy.set(false);
    }
  }

  protected statusLabel(entry: CheckedRow): string {
    switch (entry.status) {
      case 'ok':
        return 'Wird angelegt';
      case 'error':
        return 'Fehler';
      default:
        return 'Dublette – wird nicht angelegt';
    }
  }

  protected sideLabel(entry: CheckedRow): string {
    return entry.row.homeAway === 'home' ? 'Heim' : entry.row.homeAway === 'away' ? 'Gast' : '';
  }
}
