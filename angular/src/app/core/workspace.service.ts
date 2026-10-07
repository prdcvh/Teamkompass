import { Injectable, signal } from '@angular/core';
import { clearLocalTeamData } from './local-data';
import { type Workspace, WORKSPACE_KEY, parseWorkspace, retentionLabel, withActivity } from './workspace';

/** Geräte-Einstellungen aus dem Browser-Speicher; Änderungen werden sofort gespeichert und im Verlauf vermerkt. */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly state = signal<Workspace>(parseWorkspace(read()));
  readonly retentionDays = () => this.state().retentionDays;
  readonly activity = () => this.state().activity;

  setRetention(days: number): void {
    if (days === this.state().retentionDays) return;
    this.update({ ...this.state(), retentionDays: days }, `Lokale Aufbewahrung auf ${retentionLabel(days)} gesetzt`);
  }

  /** Löscht lokal gespeicherte Teamdaten dieses Geräts; Daten in der Cloud bleiben unberührt. */
  clearLocalData(): void {
    clearLocalTeamData();
    this.update(this.state(), 'Lokalen Zwischenspeicher gelöscht');
  }

  private update(next: Workspace, action: string): void {
    const workspace = withActivity(next, action, new Date(), crypto.randomUUID());
    this.state.set(workspace);
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
    } catch {
      // Speicher gesperrt: Einstellung gilt nur für diese Sitzung.
    }
  }
}

function read(): string | null {
  try {
    return localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return null;
  }
}
