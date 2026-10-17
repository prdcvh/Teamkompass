import { Injectable, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { docFromEvent } from '../events/event';
import { EventsService } from '../events/events.service';
import { EventsApi } from '../firebase/events.api';
import { PlanningApi } from '../firebase/planning.api';
import { todayIso } from '../shared/dates';
import { type BreakChangePlan, breakCandidates, breakChangeText, breakScope, breakSummary, planBreakChange } from './break-change';
import { type BreakDraft, type BreakErrors, type PlanningBreak, breakFromDraft, docFromBreak, validateBreakDraft } from './breaks';
import { PlanningService } from './planning.service';
import { eventFromSeries, skippedFromPlanningDoc } from './series-events';

/** Welche künftigen Termine im Zeitraum einer Pause schon Bewertungen/Notizen haben (für die Vorschau der Pause). */
export interface BreakProtection {
  /** Zeiträume, für die nachgesehen wurde. */
  readonly key: string;
  readonly state: 'loading' | 'ready' | 'error';
  readonly rated: ReadonlySet<string>;
}

/**
 * Pausen (SCRUM-148): anlegen, ändern, verlängern, kürzen und löschen. Danach werden die Serien-Trainings in Ordnung
 * gebracht (siehe `break-change.ts`). Das Planungsdokument, die Meldung (`run`) und das Schreiben in Blöcken stammen aus
 * {@link PlanningService}.
 */
@Injectable({ providedIn: 'root' })
export class BreaksService {
  private readonly planning = inject(PlanningService);
  private readonly api = inject(PlanningApi);
  private readonly events = inject(EventsService);
  private readonly eventsApi = inject(EventsApi);

  /** Stand der Prüfung auf bewertete Termine für die Vorschau im Pausen-Formular. */
  readonly breakProtection = signal<BreakProtection | null>(null);
  private breakRun = 0;

  constructor() {
    // Beim Abmelden bzw. Beenden der Planung: Vorschau-Stand verwerfen.
    effect(() => {
      if (this.planning.load() === 'idle') {
        this.breakProtection.set(null);
        this.breakRun += 1;
      }
    });
  }

  private get run() {
    return this.planning.run;
  }

  /** Die Pausen nach einer Änderung: die geänderte Pause ersetzt oder entfernt, alle anderen unverändert. */
  private breaksAfter(before: PlanningBreak | null, after: PlanningBreak | null): readonly PlanningBreak[] {
    const id = (after ?? before)?.id;
    return [...this.planning.breaks().filter((entry) => entry.id !== id), ...(after ? [after] : [])];
  }

  /** Alter und neuer Stand der Pause zu einem Entwurf; null, solange der Entwurf ungültig ist. */
  private breakStates(draft: BreakDraft): { readonly before: PlanningBreak | null; readonly after: PlanningBreak } | null {
    if (Object.keys(validateBreakDraft(draft)).length > 0) return null;
    const before = draft.id === null ? null : (this.planning.breaks().find((entry) => entry.id === draft.id) ?? null);
    return { before, after: breakFromDraft(draft, draft.id ?? 'neu') };
  }

  private breakKey(before: PlanningBreak | null, after: PlanningBreak | null): string {
    return breakScope(before, after)
      .map((range) => `${range.from}/${range.to}`)
      .join('|');
  }

  /**
   * Schaut nach, welche Serien-Trainings im Zeitraum der Pause schon Bewertungen oder Notizen haben (für die Vorschau).
   * Ändert sich der Zeitraum nicht, wird nicht noch einmal gefragt; beim Speichern wird ohnehin neu geprüft.
   */
  async loadBreakProtection(draft: BreakDraft | null, removing: PlanningBreak | null = null): Promise<void> {
    const states = draft ? this.breakStates(draft) : removing ? { before: removing, after: null } : null;
    if (!states) return;
    const key = this.breakKey(states.before, states.after);
    const current = this.breakProtection();
    if (current && current.key === key && current.state !== 'error') return;
    const run = ++this.breakRun;
    this.breakProtection.set({ key, state: 'loading', rated: new Set() });
    const events = await this.events.whenLoaded();
    if (run !== this.breakRun) return;
    if (this.events.load() !== 'ready') {
      this.breakProtection.set({ key, state: 'error', rated: new Set() });
      return;
    }
    try {
      const ids = breakCandidates(this.planning.series(), todayIso(), events, breakScope(states.before, states.after));
      const rated = await this.eventsApi.findEventsWithRecords(ids);
      if (run === this.breakRun) this.breakProtection.set({ key, state: 'ready', rated });
    } catch (error) {
      console.error(error);
      if (run === this.breakRun) this.breakProtection.set({ key, state: 'error', rated: new Set() });
    }
  }

  /** Vorschau für das Pausen-Formular, z. B. „In der Pause „Herbstferien“: 4 Trainings fallen weg.“ Null, solange ungültig. */
  previewBreak(draft: BreakDraft): string | null {
    const states = this.breakStates(draft);
    if (!states || this.events.load() !== 'ready') return null;
    return this.breakPreviewText(`In der Pause „${states.after.name}“`, states.before, states.after);
  }

  /** Vorschau für die Rückfrage beim Löschen einer Pause. */
  deleteBreakPreview(id: string): string | null {
    const before = this.planning.breaks().find((entry) => entry.id === id);
    if (!before || this.events.load() !== 'ready') return null;
    return this.breakPreviewText(`Pause „${before.name}“ wird gelöscht`, before, null);
  }

  private breakPreviewText(lead: string, before: PlanningBreak | null, after: PlanningBreak | null): string {
    const events = this.events.events();
    const scope = breakScope(before, after);
    const hasCandidates = breakCandidates(this.planning.series(), todayIso(), events, scope).length > 0;
    const protection = this.breakProtection();
    if (hasCandidates) {
      if (protection === null || protection.key !== this.breakKey(before, after) || protection.state === 'loading') return 'Es wird geprüft, welche Termine schon bewertet sind …';
      if (protection.state === 'error') return 'Es konnte nicht geprüft werden, welche Termine schon bewertet sind. Beim Speichern wird es erneut versucht; klappt auch das nicht, bleiben die Termine unverändert.';
    }
    const rated = hasCandidates && protection ? protection.rated : new Set<string>();
    const plan = planBreakChange(this.planning.series(), todayIso(), events, rated, skippedFromPlanningDoc(this.planning.stored()), this.breaksAfter(before, after), scope);
    return breakChangeText(lead, plan);
  }

  /**
   * Prüft und speichert eine Pause (neu oder geändert) und bringt danach die Serien-Trainings in Ordnung: neu oder
   * verlängert entfernt sie unbewertete, nicht von Hand geänderte Serien-Trainings in der Pause; gekürzt lässt sie wieder
   * entstehen. Gibt die Fehler der Prüfung zurück; leer = gespeichert.
   */
  saveBreak(draft: BreakDraft): BreakErrors {
    if (!this.planning.canWrite() || this.planning.load() !== 'ready') return { startDate: 'Die Planung ist noch nicht geladen. Bitte kurz warten und erneut speichern.' };
    const errors = validateBreakDraft(draft);
    if (Object.keys(errors).length > 0) return errors;
    const before = draft.id === null ? null : (this.planning.breaks().find((entry) => entry.id === draft.id) ?? null);
    const after = breakFromDraft(draft, draft.id ?? `b${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`);
    void this.applyBreak(before, after, this.planning.write(this.api.saveBreak(after.id, docFromBreak(after)), 'Die Pause konnte nicht gespeichert werden.'));
    return {};
  }

  /** Löscht die Pause: erst entstehen die Serien-Trainings wieder, dann wird die Pause entfernt (bei Fehler bleibt sie bestehen). */
  deleteBreak(id: string): boolean {
    const before = this.planning.breaks().find((entry) => entry.id === id);
    if (!before || !this.planning.canWrite() || this.planning.load() !== 'ready') return false;
    void this.removeBreak(before);
    return true;
  }

  private async applyBreak(before: PlanningBreak | null, after: PlanningBreak, written: Promise<boolean>): Promise<void> {
    this.run.set({ state: 'running', text: 'Termine werden aktualisiert …' });
    if (!(await written)) {
      this.run.set({ state: 'error', text: 'Die Pause wurde nicht gespeichert, deshalb wurden keine Termine geändert.' });
      return;
    }
    const plan = await this.prepareBreakPlan(before, after, 'Die Pause ist gespeichert, aber ', 'Bitte die Pause später erneut speichern.');
    if (!plan) return;
    const failure = await this.executeBreak(plan, 'Bitte die Pause erneut speichern, dann wird der Rest erledigt.');
    this.run.set(failure ? { state: 'error', text: failure } : { state: 'done', text: breakSummary(plan) });
  }

  private async removeBreak(before: PlanningBreak): Promise<void> {
    this.run.set({ state: 'running', text: 'Pause wird gelöscht …' });
    const plan = await this.prepareBreakPlan(before, null, 'Die Pause wurde nicht gelöscht, denn ', 'Bitte später erneut löschen.');
    if (!plan) return;
    const failure = await this.executeBreak(plan, 'Die Pause besteht noch; bitte erneut löschen, dann wird der Rest erledigt.');
    if (failure) {
      this.run.set({ state: 'error', text: failure });
      return;
    }
    if (!(await this.planning.write(this.api.deleteBreak(before.id), 'Die Pause konnte nicht gelöscht werden.'))) {
      this.run.set({ state: 'error', text: 'Die Serien-Trainings wurden wieder angelegt, aber die Pause konnte nicht gelöscht werden. Bitte erneut löschen.' });
      return;
    }
    this.run.set({ state: 'done', text: `Die Pause „${before.name}“ wurde gelöscht. ${breakSummary(plan)}` });
  }

  /** Liest Events und Bewertungsstand frisch und plant die Folgen der Pause. Bei Fehler: Meldung, Rückgabe null, nichts geändert. */
  private async prepareBreakPlan(before: PlanningBreak | null, after: PlanningBreak | null, prefix: string, suffix: string): Promise<BreakChangePlan | null> {
    const events = await this.events.whenLoaded();
    if (this.events.load() !== 'ready') {
      this.run.set({ state: 'error', text: `${prefix}die vorhandenen Events konnten nicht geladen werden. Es wurden keine Termine geändert. ${suffix}` });
      return null;
    }
    const scope = breakScope(before, after);
    let rated: ReadonlySet<string>;
    try {
      rated = await this.eventsApi.findEventsWithRecords(breakCandidates(this.planning.series(), todayIso(), events, scope));
    } catch (error) {
      console.error(error);
      this.run.set({ state: 'error', text: `${prefix}es konnte nicht geprüft werden, welche Termine schon bewertet sind. Deshalb wurde nichts geändert. ${authErrorMessage(errorCode(error))} ${suffix}` });
      return null;
    }
    return planBreakChange(this.planning.series(), todayIso(), events, rated, skippedFromPlanningDoc(this.planning.stored()), this.breaksAfter(before, after), scope);
  }

  private executeBreak(plan: BreakChangePlan, retryHint: string): Promise<string | null> {
    const creates = plan.create.flatMap((entry) =>
      entry.dates.map((date) => {
        const event = eventFromSeries(entry.series, date);
        return { id: event.id, data: docFromEvent(event) };
      }),
    );
    return this.planning.writeChunks(creates, [], plan.remove, retryHint);
  }
}
