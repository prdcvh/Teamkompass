import { TestBed } from '@angular/core/testing';
import type { FakeFirebase } from '../../core/testing/fake-firebase';
import { q, renderProfile, text } from './testing/profile-fixture';

const scene = (id: string, change: Record<string, unknown> = {}) =>
  [
    id,
    {
      playerId: 'p1',
      eventId: 'e2',
      eventDate: '2026-09-08',
      eventType: 'Spiel',
      eventTitle: 'Heimspiel',
      minute: 20,
      context: `Szene ${id}`,
      decision: 'good',
      execution: 'success',
      situations: [],
      videoUrl: '',
      by: 'Trainer',
      byUid: 'uid-trainer',
      createdAt: '2026-09-09T10:00:00.000Z',
      ...change,
    },
  ] as const;

function withScenes(entries: ReturnType<typeof scene>[]) {
  return (firebase: FakeFirebase) => {
    for (const [id, data] of entries) firebase.tacticScenes.scenes.set(id, { ...data });
  };
}

/** Taktikdiagnostik im Spielerprofil (SCRUM-267): Kennzahlen mit Nenner, Stichprobe, Zeitfenster und Mindestfallzahl. */
describe('Profil: Taktikdiagnostik (SCRUM-267)', () => {
  const card = (fixture: Parameters<typeof q>[0]) => q<HTMLElement>(fixture, 'tk-tactic-diagnostics-card');
  /** Text je Zelle/Feld mit Leerzeichen getrennt (textContent klebt benachbarte Elemente zusammen). */
  const parts = (host: Element | null, selector: string) => [...(host?.querySelectorAll(selector) ?? [])].map((element) => text(element));
  const facts = (host: Element | null) => parts(host, '.facts div').map((row) => row);
  const kpis = (host: Element | null) => [...(host?.querySelectorAll('.kpi') ?? [])].map((kpi) => `${text(kpi.querySelector('span'))}: ${text(kpi.querySelector('strong'))}`);
  const rows = (host: Element | null) => [...(host?.querySelectorAll('tbody tr') ?? [])].map((row) => parts(row, 'td').join(' | '));

  async function render(setup?: (firebase: FakeFirebase) => void) {
    const result = await renderProfile({ id: 'p1', setup });
    await vi.waitFor(() => {
      TestBed.tick();
      result.fixture.detectChanges();
      expect(text(card(result.fixture))).not.toContain('werden geladen');
    });
    return result;
  }

  it('ohne Szene: kein Score, nur Hinweis, wo Szenen erfasst werden', async () => {
    const { fixture, firebase } = await render();
    expect(firebase.tacticScenes.calls).toEqual(['watchScenes:playerId=p1']);
    const content = text(card(fixture));
    expect(content).toContain('Noch keine Szene erfasst');
    expect(content).not.toContain('%');
  });

  it('richtige Entscheidung, erfolglose Ausführung: getrennte Ergebnisse, Zählung statt Prozent unter der Mindestfallzahl', async () => {
    const { fixture } = await render(withScenes([scene('s1', { execution: 'fail' }), scene('s2', { decision: 'unclear', execution: null })]));
    const content = text(card(fixture));
    expect(content).toContain('2 Szenen aus 1 Termin (2 aus Spielen, 0 aus Trainings)');
    expect(facts(card(fixture))).toContain('Zeitfenster08.09.2026');
    expect(kpis(card(fixture))).toEqual([
      'Entscheidungsqualität: 1 von 1 – noch keine Aussage (ab 5 beurteilbaren Szenen)',
      'Ausführungsquote: 0 von 1 – noch keine Aussage (ab 5 beurteilbaren Szenen)',
    ]);
    expect(content).toContain('1 Entscheidungen, 0 Ausführungen (zählen nicht mit)');
    expect(content).toContain('Aus wenigen Szenen lässt sich keine taktische Stärke');
    expect(content).not.toMatch(/\d+ %/);
  });

  it('nur unklare Szenen: Stichprobe sichtbar, aber kein Wert', async () => {
    const { fixture } = await render(withScenes([scene('s1', { decision: 'unclear', execution: null })]));
    const content = text(card(fixture));
    expect(content).toContain('1 Szene aus 1 Termin');
    expect(kpis(card(fixture))).toEqual(['Entscheidungsqualität: kein Wert (keine beurteilbare Szene)', 'Ausführungsquote: kein Wert (keine beurteilbare Szene)']);
    expect(rows(card(fixture))).toContain('Sep 2026 | 1 | – | –');
  });

  it('ab der Mindestfallzahl mit Prozent; Vergleich je Ereignistyp, Terminart und Monat', async () => {
    const { fixture } = await render(
      withScenes([
        scene('a', { situations: ['pass'] }),
        scene('b', { situations: ['pass'], execution: 'fail' }),
        scene('c', { situations: ['pass'], decision: 'poor', execution: null }),
        scene('d', { eventDate: '2026-10-05', eventId: 'e9', eventType: 'Training' }),
        scene('e', { eventDate: '2026-10-05', eventId: 'e9', eventType: 'Training', situations: ['pressing'] }),
        scene('f', { eventDate: '2026-10-05', eventId: 'e9', eventType: 'Training', videoUrl: 'https://video.example/f' }),
      ]),
    );
    const host = card(fixture)!;
    const content = text(host);
    expect(content).toContain('6 Szenen aus 2 Terminen (3 aus Spielen, 3 aus Trainings)');
    expect(content).toContain('08.09.2026 – 05.10.2026');
    expect(kpis(host)).toEqual(['Entscheidungsqualität: 5 von 6 (83 %)', 'Ausführungsquote: 4 von 5 (80 %)']);
    expect(content).not.toContain('Aus wenigen Szenen');
    const headings = [...host.querySelectorAll('h3')].map((heading) => text(heading));
    expect(headings).toEqual(expect.arrayContaining(['Nach Ereignistyp', 'Spiel und Training', 'Verlauf je Monat']));
    expect(rows(host)).toEqual([
      'Passentscheidung | 3 | 2/3 | 1/2',
      'Pressing | 1 | 1/1 | 1/1',
      'Ohne Ereignistyp | 2 | 2/2 | 2/2',
      'Spiel | 3 | 2/3 | 1/2',
      'Training | 3 | 3/3 | 3/3',
      'Sep 2026 | 3 | 2/3 | 1/2',
      'Okt 2026 | 3 | 3/3 | 3/3',
    ]);
    // Videolink nur als Text für Trainer, nie eingebettet.
    expect(host.querySelector('iframe, video, a')).toBeNull();
    expect(content).toContain('https://video.example/f');
  });
});
