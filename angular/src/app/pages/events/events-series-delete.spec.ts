import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { isoWeekday } from '../../core/planning/planning';
import { todayIso } from '../../core/shared/dates';
import { LayoutService } from '../../core/shell/layout.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Events } from './events';

describe('Events: Serien-Termin löschen (SCRUM-222)', () => {
  const day = (offset: number) => new Date(Date.parse(`${todayIso()}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  const dates = [day(7), day(14), day(21)];
  const seriesEvent = (date: string) => ({ type: 'Training', title: 'Serientraining', date, intensity: 2, location: '', trainingFocus: 'Umschalten', startTime: '17:30', durationMinutes: 90, locationCoords: null });

  async function render(mobile: boolean) {
    const firebase = new FakeFirebase();
    firebase.planning.doc = {
      series: { s1: { weekday: isoWeekday(dates[0]), startTime: '17:30', durationMinutes: 90, location: '', locationCoords: null, title: '', trainingFocus: 'Umschalten', intensity: 2, startDate: day(-30), endDate: dates[2] } },
    };
    for (const date of dates) firebase.events.events.set(`serie-s1-${date}`, seriesEvent(date));
    firebase.events.events.set('e1', { type: 'Training', title: 'Einzeltraining', date: dates[0] });
    firebase.ratings.ratings.set(`serie-s1-${dates[1]}`, new Map([['p1', { attendance: 'present' }]]));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile: signal(mobile) } }],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Events);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.filters')).not.toBeNull();
    });
    // Suche klappt alle Bereiche auf.
    const search = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'training';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    return { fixture, firebase, root: fixture.nativeElement as HTMLElement };
  }

  const buttons = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('.confirm-actions button')];
  const label = (root: HTMLElement, text: string) => buttons(root).find((button) => button.textContent?.includes(text));
  /** Desktop: „Löschen“ in der Tabelle. Handy: Karte „Anschauen“ → Stift → „Event löschen“ (die Karte hat keinen eigenen Löschen-Knopf). */
  const askDelete = async (ctx: Awaited<ReturnType<typeof render>>, title: string, date: string, mobile = false) => {
    const shown = date.split('-').reverse().join('.');
    const inRow = (b: HTMLButtonElement) => b.closest('tr, li')?.textContent?.includes(shown);
    const all = [...ctx.root.querySelectorAll<HTMLButtonElement>('button')];
    const step = async () => {
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();
    };
    if (!mobile) {
      all.find((b) => b.getAttribute('aria-label') === `Löschen: ${title}` && inRow(b))!.click();
      await step();
      return;
    }
    all.find((b) => b.getAttribute('aria-label') === `Event anschauen: ${title}` && inRow(b))!.click();
    await step();
    ctx.root.querySelector<HTMLButtonElement>('.edit-pen')!.click();
    await step();
    ctx.root.querySelector<HTMLButtonElement>('button.delete')!.click();
    await step();
  };

  describe.each([
    ['am Desktop', false],
    ['am Handy', true],
  ])('%s', (_label, mobile) => {
    it('fragt bei einem Serien-Termin: nur diesen / alle / abbrechen, und nennt die bleibenden Termine', async () => {
      const ctx = await render(mobile);
      await askDelete(ctx, 'Serientraining', dates[0], mobile);
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
      const ctx = await render(mobile);
      await askDelete(ctx, 'Serientraining', dates[0], mobile);
      label(ctx.root, 'Nur diesen Termin')!.click();
      await vi.waitFor(() => expect(ctx.firebase.calls).toContain(`deleteEvent:serie-s1-${dates[0]}`));
      expect(ctx.firebase.calls).toContain(`markSkipped:s1:${dates[0]}`);
      expect(ctx.firebase.calls).not.toContain('deleteSeries');
      expect(ctx.firebase.events.events.has(`serie-s1-${dates[1]}`)).toBe(true);
      expect(ctx.firebase.events.events.has(`serie-s1-${dates[2]}`)).toBe(true);
    });

    it('„Alle Termine der Serie“ nutzt die Serien-Löschlogik: bewertete Termine bleiben', async () => {
      const ctx = await render(mobile);
      await askDelete(ctx, 'Serientraining', dates[0], mobile);
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
      const ctx = await render(mobile);
      await askDelete(ctx, 'Serientraining', dates[0], mobile);
      label(ctx.root, 'Abbrechen')!.click();
      await ctx.fixture.whenStable();
      expect(ctx.firebase.calls.some((call) => call.startsWith('deleteEvent') || call === 'deleteSeries')).toBe(false);
    });

    it('ein Termin ohne Serie bekommt die normale Bestätigung', async () => {
      const ctx = await render(mobile);
      await askDelete(ctx, 'Einzeltraining', dates[0], mobile);
      expect(label(ctx.root, 'Alle Termine der Serie')).toBeUndefined();
      expect(label(ctx.root, 'Nur diesen Termin')).toBeUndefined();
      label(ctx.root, 'Endgültig löschen')!.click();
      await vi.waitFor(() => expect(ctx.firebase.calls).toContain('deleteEvent:e1'));
    });
  });

  it('bietet „Alle“ nicht an, wenn die Serie nicht mehr existiert', async () => {
    const ctx = await render(false);
    ctx.firebase.planning.doc = { series: {} };
    ctx.firebase.planning.emit();
    await askDelete(ctx, 'Serientraining', dates[0]);
    await vi.waitFor(() => {
      ctx.fixture.detectChanges();
      expect(label(ctx.root, 'Alle Termine der Serie')!.disabled).toBe(true);
    });
    expect(label(ctx.root, 'Nur diesen Termin')!.disabled).toBe(false);
  });
});
