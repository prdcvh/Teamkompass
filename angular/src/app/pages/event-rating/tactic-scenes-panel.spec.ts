import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { LayoutService } from '../../core/shell/layout.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { EventRating } from './event-rating';

/** Taktikdiagnostik am Termin: Szene erfassen mit getrennter Entscheidung und Ausführung (SCRUM-267). */
describe('Bewertungsseite: Taktikdiagnostik (SCRUM-267)', () => {
  let firebase: FakeFirebase;

  async function render(role: 'trainer' | 'physio' = 'trainer') {
    firebase = new FakeFirebase();
    firebase.events.events.set('e1', { type: 'Spiel', title: 'Heimspiel', date: '2026-10-04', opponent: 'SV Nord' });
    firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['ZM'], number: 8, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: 'Ali Demir', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit' });
    firebase.tacticScenes.scenes.set('other', { playerId: 'p2', eventId: 'e9', eventDate: '2026-09-01', eventType: 'Spiel', context: 'anderer Termin', decision: 'good', execution: 'success', situations: [] });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideFakeFirebase(firebase),
        { provide: LayoutService, useValue: { isMobile: signal(false) } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: 'e1' })) } },
      ],
    });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.uid.set('coach');
    session.displayName.set('Trainer Test');
    const fixture = TestBed.createComponent(EventRating);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('tk-event-details')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const panel = (fixture: { nativeElement: unknown }) => root(fixture).querySelector<HTMLElement>('tk-tactic-scenes-panel');
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const flush = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const choose = (host: HTMLElement, label: string) => {
    const option = [...host.querySelectorAll<HTMLLabelElement>('label.choice')].find((entry) => text(entry) === label);
    if (!option) throw new Error(`Auswahl ${label} fehlt`);
    option.querySelector('input')!.click();
  };

  it('nur für Trainer: Medizin sieht keine Szenen und lädt keine', async () => {
    const fixture = await render('physio');
    expect(panel(fixture)).toBeNull();
    expect(firebase.tacticScenes.calls).toEqual([]);
  });

  it('lädt nur die Szenen dieses Termins; Ausführung erst nach „Sinnvoll“; speichert Entscheidung und Ausführung getrennt', async () => {
    const fixture = await render();
    const host = panel(fixture)!;
    expect(host).not.toBeNull();
    expect(firebase.tacticScenes.calls).toEqual(['watchScenes:eventId=e1']);
    expect(text(host)).toContain('Zu diesem Termin ist noch keine Szene erfasst.');
    expect(text(host)).toContain('Spielwirkung');

    const select = host.querySelector<HTMLSelectElement>('select[name=playerId]')!;
    select.value = 'p1';
    select.dispatchEvent(new Event('change'));
    const minute = host.querySelector<HTMLInputElement>('input[name=minute]')!;
    minute.value = '34';
    minute.dispatchEvent(new Event('input'));
    const context = host.querySelector<HTMLInputElement>('input[name=context]')!;
    context.value = 'Aufbau gegen hohes Pressing';
    context.dispatchEvent(new Event('input'));
    await flush(fixture);
    expect(host.querySelector('legend')?.parentElement?.textContent).toContain('Entscheidung');
    expect([...host.querySelectorAll('legend')].map((legend) => text(legend))).not.toContain('Ausführung');

    choose(host, 'Sinnvoll');
    await flush(fixture);
    expect([...host.querySelectorAll('legend')].map((legend) => text(legend))).toContain('Ausführung');
    choose(host, 'Nicht erfolgreich');
    choose(host, 'Passentscheidung');
    await flush(fixture);

    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(async () => {
      await flush(fixture);
      expect(text(host)).toContain('Szene für 8 · Jonas Keller gespeichert.');
    });
    const saved = [...firebase.tacticScenes.scenes.entries()].find(([id]) => id !== 'other')!;
    expect(saved[1]).toMatchObject({
      playerId: 'p1',
      eventId: 'e1',
      eventDate: '2026-10-04',
      eventType: 'Spiel',
      eventTitle: 'Heimspiel',
      minute: 34,
      context: 'Aufbau gegen hohes Pressing',
      decision: 'good',
      execution: 'fail',
      situations: ['pass'],
      videoUrl: '',
      byUid: 'coach',
      by: 'Trainer Test',
    });
    const item = text(host.querySelector('.list li'));
    expect(item).toContain('34. Min.');
    expect(item).toContain('Entscheidung: Sinnvoll');
    expect(item).toContain('Ausführung: Nicht erfolgreich');
    expect(item).not.toContain('anderer Termin');
  });

  it('wechselt die Entscheidung auf „Nicht sinnvoll“, wird keine Ausführung gespeichert; ungültiger Videolink wird abgelehnt', async () => {
    const fixture = await render();
    const host = panel(fixture)!;
    const select = host.querySelector<HTMLSelectElement>('select[name=playerId]')!;
    select.value = 'p2';
    select.dispatchEvent(new Event('change'));
    const context = host.querySelector<HTMLInputElement>('input[name=context]')!;
    context.value = 'Konter';
    context.dispatchEvent(new Event('input'));
    await flush(fixture);
    choose(host, 'Sinnvoll');
    await flush(fixture);
    choose(host, 'Erfolgreich');
    choose(host, 'Nicht sinnvoll');
    await flush(fixture);
    const video = host.querySelector<HTMLInputElement>('input[name=videoUrl]')!;
    video.value = 'http://video.example/1';
    video.dispatchEvent(new Event('input'));
    await flush(fixture);
    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(async () => {
      await flush(fixture);
      expect(text(host)).toContain('https://');
    });
    expect(firebase.tacticScenes.calls.filter((call) => call.startsWith('saveScene'))).toEqual([]);

    video.value = 'https://video.example/1';
    video.dispatchEvent(new Event('input'));
    await flush(fixture);
    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(async () => {
      await flush(fixture);
      expect(text(host)).toContain('gespeichert');
    });
    const saved = [...firebase.tacticScenes.scenes.entries()].find(([id]) => id !== 'other')![1];
    expect(saved).toMatchObject({ decision: 'poor', execution: null, videoUrl: 'https://video.example/1' });
    // Videolink nur als Text, nie eingebettet oder als Link.
    expect(host.querySelector('iframe, video, a[href^="https://video"]')).toBeNull();
    expect(text(host.querySelector('.list .video'))).toContain('https://video.example/1');
  });
});
