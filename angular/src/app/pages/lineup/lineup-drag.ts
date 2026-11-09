/**
 * Ziehen in der Aufstellung (SCRUM-286) mit Pointer Events – eine Bedienung für Maus, Stift und Finger.
 * Ein Ziehen beginnt erst, wenn sich der Zeiger ein paar Pixel bewegt hat; ein einfaches Tippen/Klicken öffnet wie bisher
 * den Dialog. Ziele tragen `data-drop` (siehe dropKey); das Ziel unter dem Zeiger wird hervorgehoben. Damit die Seite
 * beim Ziehen mit dem Finger nicht scrollt, haben nur die Griffe `touch-action: none` (CSS) – überall sonst scrollt sie
 * normal. Am oberen/unteren Bildschirmrand scrollt die Seite beim Ziehen langsam mit, damit Bank und Feld erreichbar sind.
 */
import { signal } from '@angular/core';
import { type DropTarget, parseDropKey } from '../../core/lineup/lineup-drop';

/** Ab dieser Bewegung (px) ist es ein Ziehen statt eines Klicks. */
const DRAG_THRESHOLD = 6;
/** Abstand zum Bildschirmrand (px), ab dem beim Ziehen mitgescrollt wird. */
const EDGE = 56;
/** Nach dem Loslassen wird der Klick, den der Browser noch hinterherschickt, so lange ignoriert (ms). */
const CLICK_GRACE = 400;

export interface DragGhost {
  readonly playerId: string;
  readonly label: string;
  readonly fromPitch: boolean;
  readonly x: number;
  readonly y: number;
}

interface Pending {
  readonly element: HTMLElement;
  readonly pointerId: number;
  readonly playerId: string;
  readonly label: string;
  readonly fromPitch: boolean;
  readonly startX: number;
  readonly startY: number;
}

export class LineupDrag {
  /** Der gerade gezogene Spieler (für die „Geister“-Karte am Zeiger); null = kein Ziehen. */
  readonly ghost = signal<DragGhost | null>(null);
  /** data-drop-Schlüssel des Ziels unter dem Zeiger (Hervorhebung). */
  readonly over = signal<string | null>(null);

  private pending: Pending | null = null;
  private suppressUntil = 0;
  private scrollFrame = 0;
  private lastY = 0;

  constructor(private readonly onDrop: (playerId: string, target: DropTarget) => void) {}

  /**
   * pointerdown auf einem ziehbaren Spieler. Mit dem Finger nur über einen Griff (`.grip` oder Element mit Klasse `chip`),
   * damit man über die Bankliste weiter normal scrollen kann.
   */
  start(event: PointerEvent, playerId: string, label: string, fromPitch: boolean, canEdit: boolean): void {
    if (!canEdit || this.pending || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const element = event.currentTarget as HTMLElement | null;
    if (!element) return;
    if (event.pointerType === 'touch' && !(event.target as Element | null)?.closest('.grip, .chip')) return;
    this.pending = { element, pointerId: event.pointerId, playerId, label, fromPitch, startX: event.clientX, startY: event.clientY };
    element.setPointerCapture?.(event.pointerId);
    element.addEventListener('pointermove', this.move);
    element.addEventListener('pointerup', this.up);
    element.addEventListener('pointercancel', this.cancel);
    element.addEventListener('lostpointercapture', this.cancel);
  }

  /** true direkt nach einem Ziehen: Der Klick, den der Browser danach schickt, soll keinen Dialog öffnen. */
  clickSuppressed(): boolean {
    return Date.now() < this.suppressUntil;
  }

  /** Ziehen abbrechen (z. B. beim Verlassen der Seite). */
  stop(): void {
    const pending = this.pending;
    this.pending = null;
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = 0;
    this.ghost.set(null);
    this.over.set(null);
    if (!pending) return;
    pending.element.removeEventListener('pointermove', this.move);
    pending.element.removeEventListener('pointerup', this.up);
    pending.element.removeEventListener('pointercancel', this.cancel);
    pending.element.removeEventListener('lostpointercapture', this.cancel);
    if (pending.element.hasPointerCapture?.(pending.pointerId)) pending.element.releasePointerCapture(pending.pointerId);
  }

  private readonly move = (event: PointerEvent): void => {
    const pending = this.pending;
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (!this.ghost() && Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < DRAG_THRESHOLD) return;
    event.preventDefault();
    this.ghost.set({ playerId: pending.playerId, label: pending.label, fromPitch: pending.fromPitch, x: event.clientX, y: event.clientY });
    this.over.set(this.keyAt(event.clientX, event.clientY));
    this.lastY = event.clientY;
    if (!this.scrollFrame) this.scrollFrame = requestAnimationFrame(this.autoScroll);
  };

  private readonly up = (event: PointerEvent): void => {
    const pending = this.pending;
    if (!pending || event.pointerId !== pending.pointerId) return;
    const dragged = this.ghost() !== null;
    const target = dragged ? parseDropKey(this.keyAt(event.clientX, event.clientY)) : null;
    this.stop();
    if (!dragged) return;
    this.suppressUntil = Date.now() + CLICK_GRACE;
    if (target) this.onDrop(pending.playerId, target);
  };

  private readonly cancel = (event: PointerEvent): void => {
    if (this.pending && event.pointerId === this.pending.pointerId) this.stop();
  };

  /** Seite mitscrollen, solange der Zeiger beim Ziehen nah am oberen/unteren Rand steht. */
  private readonly autoScroll = (): void => {
    this.scrollFrame = 0;
    if (!this.ghost()) return;
    const height = window.innerHeight;
    const step = this.lastY < EDGE ? -(EDGE - this.lastY) / 4 : this.lastY > height - EDGE ? (this.lastY - (height - EDGE)) / 4 : 0;
    if (step) {
      window.scrollBy(0, step);
      const ghost = this.ghost();
      if (ghost) this.over.set(this.keyAt(ghost.x, ghost.y));
    }
    this.scrollFrame = requestAnimationFrame(this.autoScroll);
  };

  private keyAt(x: number, y: number): string | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
    return element?.dataset['drop'] ?? null;
  }
}
