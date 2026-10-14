import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Ab dieser Breite (px) gilt die Desktop-Ansicht – derselbe Umbruch wie in der bisherigen App. */
export const MOBILE_MAX_WIDTH = 720;

/**
 * Meldet, ob die Handy- oder die Desktop-Variante des Layouts gezeigt wird. Der Zustand
 * der Seiten liegt in Services, daher bleibt beim Drehen/Größenändern nichts auf der Strecke.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly query =
    typeof matchMedia === 'function' ? matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`) : null;

  readonly isMobile = signal(this.query?.matches ?? false);

  constructor() {
    if (!this.query) return;
    const query = this.query;
    const onChange = (event: MediaQueryListEvent) => this.isMobile.set(event.matches);
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }
}
