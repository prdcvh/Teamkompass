import { Injectable, inject } from '@angular/core';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { todayIso } from '../shared/dates';
import { SessionService } from '../auth/session.service';
import { type DevelopmentPlan, type PlanDraft, type PlanErrors, docFromPlan, planFromDraft, validatePlan } from './plan';
import { RecordsStateService } from './records-state.service';

/** Förderpläne des geladenen Spielers schreiben (Trainer) und die Selbstreflexion (nur der Spieler selbst). */
@Injectable({ providedIn: 'root' })
export class PlansService {
  private readonly playerRecordsApi = inject(PlayerRecordsApi);
  private readonly session = inject(SessionService);
  private readonly state = inject(RecordsStateService);

  readonly plans = this.state.plans.asReadonly();

  savePlan(draft: PlanDraft): PlanErrors {
    const playerId = this.state.writablePlayer();
    if (!playerId) return { focus: 'Nur Trainer dürfen Förderpläne ändern.' };
    const errors = validatePlan(draft);
    if (Object.keys(errors).length > 0) return errors;
    const id = draft.id ?? `dp${crypto.randomUUID()}`;
    const plan = planFromDraft(draft, id, this.state.plans().find((item) => item.id === id), todayIso());
    this.state.plans.update((list) => [...list.filter((item) => item.id !== id), plan]);
    this.state.write('Förderplan konnte nicht gespeichert werden.', () => this.playerRecordsApi.savePlayerRecord(playerId, 'developmentPlans', id, docFromPlan(plan)));
    return {};
  }

  async deletePlan(id: string): Promise<boolean> {
    return this.state.remove('developmentPlans', id, 'Förderplan konnte nicht gelöscht werden.', (list) => this.state.plans.set(list as DevelopmentPlan[]), this.state.plans());
  }

  /** Die Selbstreflexion schreibt nur der Spieler selbst, nur zu seinem eigenen Förderplan. */
  async saveSelfReflection(planId: string, text: string): Promise<boolean> {
    const playerId = this.state.playerId();
    if (this.session.role() !== 'player' || !playerId || this.session.playerId() !== playerId) return false;
    if (!this.state.plans().some((plan) => plan.id === planId)) return false;
    const reflection = text.trim().slice(0, 400);
    const at = new Date().toISOString();
    this.state.plans.update((list) => list.map((plan) => (plan.id === planId ? { ...plan, selfReflection: reflection, selfReflectionAt: at } : plan)));
    this.state.markSyncing();
    try {
      await this.playerRecordsApi.saveSelfReflection(playerId, planId, reflection, at);
      this.state.clearSyncError();
      return true;
    } catch (error) {
      this.state.failWrite(error, 'Reflexion konnte nicht gespeichert werden.');
      return false;
    }
  }
}
