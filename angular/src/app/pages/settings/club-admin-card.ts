import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { type AdminClub, ClubAdminService } from '../../core/registration/club-admin.service';
import { shrinkLogo } from '../../core/registration/club-logo';
import { formatInviteCode } from '../../core/registration/registration';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/**
 * Einstellungen → „Verein“ (nur für Vereinsadmins, SCRUM-181): Trainer für ein neues Team im Verein einladen. Der
 * Vereinsadmin sieht dabei keine Spieler- oder Teamdaten (Regeln: nur Verwaltung).
 */
@Component({
  selector: 'tk-club-admin-card',
  imports: [Button, Card],
  templateUrl: './club-admin-card.html',
  styleUrl: './settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubAdminCard implements OnInit {
  protected readonly admin = inject(ClubAdminService);
  protected readonly email = signal('');
  protected readonly copied = signal(false);
  protected readonly format = formatInviteCode;
  /** Ungespeicherte Änderungen je Verein (Name, Logo; Logo null = entfernen). */
  protected readonly drafts = signal<ReadonlyMap<string, { name?: string; logoUrl?: string | null }>>(new Map());
  protected readonly reading = signal(false);
  protected readonly logoError = signal('');

  ngOnInit(): void {
    void this.admin.load();
  }

  protected nameFor(club: AdminClub): string {
    return this.drafts().get(club.clubId)?.name ?? club.name;
  }

  protected logoFor(club: AdminClub): string | null {
    const draft = this.drafts().get(club.clubId);
    return draft && 'logoUrl' in draft ? (draft.logoUrl ?? null) : club.logoUrl;
  }

  protected changed(club: AdminClub): boolean {
    return this.nameFor(club).trim() !== club.name || this.logoFor(club) !== club.logoUrl;
  }

  protected setName(clubId: string, name: string): void {
    this.patch(clubId, { name });
  }

  protected removeLogo(clubId: string): void {
    this.logoError.set('');
    this.patch(clubId, { logoUrl: null });
  }

  /** Datei gewählt: im Browser verkleinern (nichts wird hochgeladen, bevor „Speichern“ gedrückt ist). */
  protected async pick(clubId: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.logoError.set('');
    this.reading.set(true);
    try {
      this.patch(clubId, { logoUrl: await shrinkLogo(file) });
    } catch (error) {
      this.logoError.set(error instanceof Error ? error.message : 'Das Bild konnte nicht gelesen werden.');
    } finally {
      this.reading.set(false);
    }
  }

  protected async save(club: AdminClub): Promise<void> {
    if (await this.admin.saveClub(club.clubId, this.nameFor(club), this.logoFor(club))) {
      this.drafts.update((drafts) => {
        const next = new Map(drafts);
        next.delete(club.clubId);
        return next;
      });
    }
  }

  private patch(clubId: string, change: { name?: string; logoUrl?: string | null }): void {
    this.drafts.update((drafts) => new Map(drafts).set(clubId, { ...drafts.get(clubId), ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async create(clubId: string): Promise<void> {
    this.copied.set(false);
    if (await this.admin.createInvite(clubId, this.email(), location.origin)) this.email.set('');
  }

  protected async copy(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  protected date(value: Date | null): string {
    return value ? value.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
  }
}
