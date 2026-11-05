import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { KnowledgeService } from '../../core/knowledge/knowledge.service';
import {
  type LearningPath,
  type LevelDraft,
  MAX_LEVELS,
  MAX_LEVEL_HOME_TASK,
  MAX_LEVEL_TITLE,
  MAX_LEVEL_UNIT,
  MAX_PATH_TITLE,
  type PathDraft,
  type PathErrors,
  UNIT_MINUTES,
  ageGroupLabel,
  draftFromPath,
  emptyLevelDraft,
  emptyPathDraft,
  positionLabel,
} from '../../core/learning/learning-path';
import { LearningService } from '../../core/learning/learning.service';
import { STANDARD_POSITIONS } from '../../core/player/player';
import { AGE_GROUPS } from '../../core/registration/registration';
import { CurrentTeam } from '../../core/team/current-team.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Lernpfad (SCRUM-192) anlegen oder ändern: Name, Position, Altersklasse und die Stufen mit Einheit und Hausaufgabe. */
@Component({
  selector: 'tk-path-dialog',
  imports: [Dialog, Button],
  templateUrl: './path-dialog.html',
  styleUrls: ['./entry-dialog.css', './path-dialog.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PathDialog {
  private readonly learning = inject(LearningService);
  private readonly knowledge = inject(KnowledgeService);
  private readonly team = inject(CurrentTeam);

  readonly open = input(false);
  /** Zu bearbeitender Pfad; leer = neuer Pfad. */
  readonly path = input<LearningPath | null>(null);
  readonly closed = output<void>();
  readonly deleteRequested = output<LearningPath>();

  protected readonly limits = { title: MAX_PATH_TITLE, levelTitle: MAX_LEVEL_TITLE, unit: MAX_LEVEL_UNIT, homeTask: MAX_LEVEL_HOME_TASK, levels: MAX_LEVELS };
  protected readonly minutes = UNIT_MINUTES;
  protected readonly positionLabel = positionLabel;
  protected readonly ageGroupLabel = ageGroupLabel;
  protected readonly draft = signal<PathDraft>(emptyPathDraft(''));
  protected readonly errors = signal<PathErrors>({});
  protected readonly editing = computed(() => this.path() !== null);
  protected readonly heading = computed(() => (this.editing() ? 'Lernpfad bearbeiten' : 'Lernpfad anlegen'));
  /** Links aus dem Tab „Wissen“, die sich in eine Stufe übernehmen lassen. */
  protected readonly links = computed(() => this.knowledge.entries().filter((entry) => entry.url !== null));

  /** Positionen zur Auswahl; ein gespeicherter eigener Wert bleibt wählbar. */
  protected readonly positions = computed(() => {
    const current = this.draft().position;
    const list: string[] = ['', ...STANDARD_POSITIONS];
    return current && !list.includes(current) ? [...list, current] : list;
  });
  protected readonly ageGroups = computed(() => {
    const current = this.draft().ageGroup;
    const list: string[] = ['', ...AGE_GROUPS];
    return current && !list.includes(current) ? [...list, current] : list;
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const path = this.path();
      untracked(() => {
        this.draft.set(path ? draftFromPath(path) : emptyPathDraft(this.team.label()));
        this.errors.set({});
      });
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected patch(change: Partial<PathDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected patchLevel(index: number, change: Partial<LevelDraft>): void {
    this.draft.update((draft) => ({ ...draft, levels: draft.levels.map((level, i) => (i === index ? { ...level, ...change } : level)) }));
  }

  protected setMinutes(index: number, event: Event): void {
    this.patchLevel(index, { minutes: Number(this.value(event)) });
  }

  /** Übernimmt die Adresse eines Wissen-Eintrags in die Stufe (und den Titel als Einheit, falls noch leer). */
  protected takeLink(index: number, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const entry = this.links().find((link) => link.id === select.value);
    select.value = '';
    if (!entry?.url) return;
    const level = this.draft().levels[index];
    this.patchLevel(index, { url: entry.url, unit: level && level.unit.trim() === '' ? entry.title : (level?.unit ?? '') });
  }

  protected addLevel(): void {
    if (this.draft().levels.length >= MAX_LEVELS) return;
    this.draft.update((draft) => ({ ...draft, levels: [...draft.levels, emptyLevelDraft()] }));
  }

  protected removeLevel(index: number): void {
    this.draft.update((draft) => ({ ...draft, levels: draft.levels.filter((_, i) => i !== index) }));
    this.errors.set({});
  }

  protected move(index: number, by: -1 | 1): void {
    const target = index + by;
    this.draft.update((draft) => {
      if (target < 0 || target >= draft.levels.length) return draft;
      const levels = [...draft.levels];
      [levels[index], levels[target]] = [levels[target], levels[index]];
      return { ...draft, levels };
    });
    this.errors.set({});
  }

  protected levelError(index: number, field: 'title' | 'unit' | 'url' | 'homeTask'): string {
    return this.errors().level?.[index]?.[field] ?? '';
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.learning.savePath(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }

  protected askDelete(): void {
    const path = this.path();
    if (path) this.deleteRequested.emit(path);
  }
}
