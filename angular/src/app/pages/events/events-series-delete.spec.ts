import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { isoWeekday } from '../../core/planning/planning';
import { PlanningService } from '../../core/planning/planning.service';
import { todayIso } from '../../core/shared/dates';
import { LayoutService } from '../../core/shell/layout.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { EventRating } from '../event-rating/event-rating';
import { Events } from './events';

@Component({ template: '' })
class Blank {}

/**
 * Serien-Termin löschen (SCRUM-222). Zwei Wege: in der Eventliste am Desktop „Löschen“ in der Tabelle; auf der
 * Bewertungsseite Stift → „Event löschen“ (seit SCRUM-285, vorher „Anschauen“ → Stift auf der Handy-Karte).
 */
describe('Events: Serien-Termin löschen (SCRUM-222)', () => {
  const day = (offset: number) => new Date(Date.parse(`${todayIso()}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  const dates = [day(7), day(14), day(21)];
  const seriesEvent = (date: string) => ({ type: 'Training', title: 'Serientraining', date, intensity: 2, location: '', trainingFocus: 'Umschalten', startTime: '17:30', durationMinutes: 90, locationCoords: null });
  const seriesId = `serie-s1-${dates[0]}`;

  type Where = 'list' | 'rating';

  async function render(where: Where, eventId = seriesId) {
    const firebase = new FakeFirebase();
    firebase.planning.doc = {
      series: { s1: { weekday: isoWeekday(dates[0]), startTime: '17:30', durationMinutes: 90, location: '', locationCoords: null, title: '', trainingFocus: 'Umschalten', intensity: 2, startDate: day(-30), endDate: dates[2] } },
    };
    for (const date of dates) firebase.events.events.set(`serie-s1-${date}`, seriesEvent(date));
    firebase.events.events.set('e1', { type: 'Training', title: 'Einzeltraining', date: dates[0] });
    firebase.ratings.ratings.set(`serie-s1-${dates[1]}`, new Map([['p1', { attendance: 'present' }]]));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'events', component: Blank }]),
        ...provideFakeFirebase(firebase),
        { provide: LayoutService, useValue: { isMobile: signal(false) } },
        ...(where === 'rating' ? [{ provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: eventId })) } }] : []),
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = where === 'list' ? TestBed.createComponent(Events) : TestBed.createComponent(EventRating);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(where === 'list' ? '.filters' : '.edit-pen')).not.toBeNull();
    });
    if (where === 'list') {
      // Suche klappt alle Bereiche auf.
      const search = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
      search.value = 'training';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }
    return { fixture, firebase, root: fixture.nativeElement as HTMLElement };
  }

  const buttons = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('.confirm-actions button')];
  const label = (root: HTMLElement, text: string) => buttons(root).find((button) => button.textContent?.includes(text));
  const step = async (ctx: Awaited<ReturnType<typeof render>>) => {
    await ctx.fixture.whenStable();
    ctx.fixture.detectChanges();
  };

  /** Rendert den Weg und öffnet die Rückfrage für das Event am Datum `date` (Titel `title`). */
  const askDelete = async (where: Where, title: string, date: string) => {
    if (where === 'rating') {
      const ctx = await render('rating', title === 'Einzeltraining' ? 'e1' : `serie-s1-${date}`);
      ctx.root.querySelector<HTMLButtonElement>('.edit-pen')!.click();
      await step(ctx);
      ctx.root.querySelector<HTMLButtonElement>('button.delete')!.click();
      await step(ctx);
      return ctx;
    }
    const ctx = await render('list');
    const shown = date.split('-').reverse().join('.');
    const inRow = (b: HTMLButtonElement) => b.closest('tr, li')?.textContent?.includes(shown);
    [...ctx.root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === `Löschen: ${title}` && inRow(b))!.click();
    await step(ctx);
    return ctx;
  };

  describe.each([
    ['in der Eventliste', 'list'],
    ['auf der Bewertungsseite', 'rating'],
  ] as const)('%s', (_label, where) => {
    it('fragt bei einem Serien-Termin: nur diesen / alle / abbrechen, und nennt die bleibenden Termine', async () => {
      const ctx = await askDelete(where, 'Serientraining', dates[0]);
      expect(ctx.root.textContent).toContain('gehört zu einer Trainingsserie');
      expect(label(ctx.root, 'Nur diesen Termin')).toBeDefined();
      expect(label(ctx.root, 'Alle Termine der Serie')).toBeDefined();
      expect(label(ctx.root, 'Abbrechen')).toBeDefined();
      await vi.waitFor(() => {
        ctx.fixture.detectChanges();
        expect(ctx.root.querySelector('[data-testid="series-delete-preview"]')?.textContent).toContain('2 Termine werden entfernt; 1 Termin bleibt, weil er schon bewertet ist.');
      });
    });

    it('„Nur diesen Termin“ löscht genau einen Termin und merkt den Tag', async () => {
      const ctx = await askDelete(where, 'Serientraining', dates[0]);
      label(ctx.root, 'Nur diesen Termin')!.click();
      await vi.waitFor(() => expect(ctx.firebase.calls).toContain(`deleteEvent:serie-s1-${dates[0]}`));
      expect(ctx.firebase.calls).toContain(`markSkipped:s1:${dates[0]}`);
      expect(ctx.firebase.calls).not.toContain('deleteSeries');
      expect(ctx.firebase.events.events.has(`serie-s1-${dates[1]}`)).toBe(true);
      expect(ctx.firebase.events.events.has(`serie-s1-${dates[2]}`)).toBe(true);
    });

    it('„Alle Termine der Serie“ nutzt die Serien-Löschlogik: bewertete Termine bleiben', async () => {
      const ctx = await askDelete(where, 'Serientraining', dates[0]);
      await vi.waitFor(() => {
        ctx.fixture.detectChanges();
        expect(label(ctx.root, 'Alle Termine der Serie')!.disabled).toBe(false);
      });
      label(ctx.root, 'Alle Termine der Serie')!.click();
      await vi.waitFor(() => expect(ctx.firebase.calls).toContain('deleteSeries'));
      expect(ctx.firebase.events.events.has(`serie-s1-${dates[0]}`)).toBe(false);
      expect(ctx.firebase.events.events.has(`serie-s1-${dates[1]}`)).toBe(true); // bewertet
      expect(ctx.firebase.events.events.has(`serie-s1-${dates[2]}`)).toBe(false);
      expect(ctx.firebase.events.events.has('e1')).toBe(true);
    });

    it('„Abbrechen“ löscht nichts', async () => {
      const ctx = await askDelete(where, 'Serientraining', dates[0]);
      label(ctx.root, 'Abbrechen')!.click();
      await ctx.fixture.whenStable();
      expect(ctx.firebase.calls.some((call) => call.startsWith('deleteEvent') || call === 'deleteSeries')).toBe(false);
    });

    it('ein Termin ohne Serie bekommt die normale Bestätigung', async () => {
      const ctx = await askDelete(where, 'Einzeltraining', dates[0]);
      expect(label(ctx.root, 'Alle Termine der Serie')).toBeUndefined();
      expect(label(ctx.root, 'Nur diesen Termin')).toBeUndefined();
      label(ctx.root, 'Endgültig löschen')!.click();
      await vi.waitFor(() => expect(ctx.firebase.calls).toContain('deleteEvent:e1'));
    });
  });

  it('Bewertungsseite: nach dem Löschen geht es zurück in die Eventliste, bei „Alle Termine“ mit Fortschrittsanzeige', async () => {
    const ctx = await askDelete('rating', 'Einzeltraining', dates[0]);
    const router = TestBed.inject(Router);
    label(ctx.root, 'Endgültig löschen')!.click();
    await vi.waitFor(() => expect(router.url).toBe('/events'));
    TestBed.resetTestingModule();

    const series = await askDelete('rating', 'Serientraining', dates[0]);
    const seriesRouter = TestBed.inject(Router);
    await vi.waitFor(() => {
      series.fixture.detectChanges();
      expect(label(series.root, 'Alle Termine der Serie')!.disabled).toBe(false);
    });
    label(series.root, 'Alle Termine der Serie')!.click();
    await vi.waitFor(() => expect(seriesRouter.url).toBe('/events?serie-geloescht=1'));
  });

  it('Eventliste mit ?serie-geloescht=1 zeigt den Fortschritt der Serien-Löschung', async () => {
    const firebase = new FakeFirebase();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideFakeFirebase(firebase),
        { provide: LayoutService, useValue: { isMobile: signal(false) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ 'serie-geloescht': '1' }) } } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    TestBed.inject(PlanningService).run.set({ state: 'running', text: 'Serie wird gelöscht …' });
    const fixture = TestBed.createComponent(Events);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="series-delete-run"]')?.textContent).toContain('Serie wird gelöscht');
  });

  it('bietet „Alle“ nicht an, wenn die Serie nicht mehr existiert', async () => {
    const ctx = await render('list');
    ctx.firebase.planning.doc = { series: {} };
    ctx.firebase.planning.emit();
    const shown = dates[0].split('-').reverse().join('.');
    [...ctx.root.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.getAttribute('aria-label') === 'Löschen: Serientraining' && b.closest('tr')?.textContent?.includes(shown))!
      .click();
    await step(ctx);
    await vi.waitFor(() => {
      ctx.fixture.detectChanges();
      expect(label(ctx.root, 'Alle Termine der Serie')!.disabled).toBe(true);
    });
    expect(label(ctx.root, 'Nur diesen Termin')!.disabled).toBe(false);
  });
});
