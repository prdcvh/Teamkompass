import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';

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

/**
 * Ab dieser Breite (px) passen Tabellen und Matrizen mit allen Spalten neben das Seitenmenü (Seitenmenü 240 px, Seitenränder,
 * Kartenränder). Darunter zeigen die Seiten die Kartenansicht statt seitlich zu scrollen (SCRUM-134).
 */
export const TABLE_MIN_WIDTH = 1280;

/**
 * Signal, das wahr ist, solange das Fenster schmaler als {@link TABLE_MIN_WIDTH} ist. Muss im Injektionskontext
 * (Feld einer Komponente) aufgerufen werden; ohne matchMedia (Tests) bleibt es falsch.
 */
export function injectNarrowViewport(): Signal<boolean> {
  const narrow = signal(false);
  if (typeof matchMedia !== 'function') return narrow;
  const query = matchMedia(`(max-width: ${TABLE_MIN_WIDTH - 1}px)`);
  narrow.set(query.matches);
  const onChange = (event: MediaQueryListEvent) => narrow.set(event.matches);
  query.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  return narrow;
}
