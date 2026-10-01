import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Dialog (Desktop: zentriertes Fenster, Mobile: Sheet vom unteren Rand) auf Basis des
 * nativen <dialog>-Elements – Fokusfalle, Esc und Hintergrund-Sperre kommen vom Browser.
 */
@Component({
  selector: 'tk-dialog',
  template: `
    <dialog #dialog (cancel)="onCancel($event)">
      <div class="panel">
        <header>
          <h2>{{ title() }}</h2>
          <button type="button" class="close" aria-label="Schließen" (click)="requestClose()">×</button>
        </header>
        <ng-content />
      </div>
    </dialog>
  `,
  styleUrl: './dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Klick auf den Hintergrund (::backdrop gehört zum <dialog> selbst) schließt den Dialog.
    // Als Listener statt Template-Event, weil das Element nicht fokussierbar sein soll.
    afterNextRender(() => {
      const element = this.dialog().nativeElement;
      element.addEventListener('click', (event) => this.onBackdropClick(event));
    });
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) element.showModal?.();
      else if (!this.open() && element.open) element.close();
    });
  }

  protected requestClose(): void {
    this.closed.emit();
  }

  protected onCancel(event: Event): void {
    // Esc: Zustand gehört dem Aufrufer, nicht dem Browser.
    event.preventDefault();
    this.requestClose();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.requestClose();
  }
}
