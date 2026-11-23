import { clickByText, q, qa, renderProfile, settle, text, typeInto } from './testing/profile-fixture';

describe('Profil: Bewertung veröffentlichen (SCRUM-115)', () => {
  const panel = (fixture: { nativeElement: unknown }) => text(q(fixture, 'tk-grade-release-panel'));

  it('zeigt „nicht veröffentlicht“ und veröffentlicht unbefristet bis jetzt', async () => {
    const { fixture, firebase } = await renderProfile({ id: 'p1' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(panel(fixture)).toContain('Noten sind nicht veröffentlicht.');
    });
    expect(panel(fixture)).toContain('Kommentare zur Bewertung sieht er nie');
    expect(qa(fixture, 'tk-grade-release-panel .release button').map(text)).toEqual(['Bewertung veröffentlichen']);
    clickByText(fixture, 'tk-grade-release-panel .release button', 'Bewertung veröffentlichen');
    await settle(fixture);
    clickByText(fixture, 'tk-grade-release-panel tk-dialog button', 'Veröffentlichen');
    await vi.waitFor(() => expect(firebase.calls).toContain('publishGrades:p1:unbefristet'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(panel(fixture)).toContain('unbefristet sichtbar');
    });
    expect(qa(fixture, 'tk-grade-release-panel .release button').map(text)).toEqual(['Erneut veröffentlichen (bis jetzt)', 'Freigabe zurücknehmen']);
  });

  it('Dauer in Tagen wie bei Einladungscodes; ungültige Eingabe wird abgewiesen', async () => {
    const { fixture, firebase } = await renderProfile({ id: 'p1' });
    await settle(fixture);
    clickByText(fixture, 'tk-grade-release-panel .release button', 'Bewertung veröffentlichen');
    await settle(fixture);
    const input = q<HTMLInputElement>(fixture, 'tk-grade-release-panel input[name="days"]')!;
    typeInto(input, '0');
    await settle(fixture);
    clickByText(fixture, 'tk-grade-release-panel tk-dialog button', 'Veröffentlichen');
    await settle(fixture);
    expect(text(q(fixture, 'tk-grade-release-panel tk-dialog'))).toContain('ganze Zahl von 1 bis 365');
    expect(firebase.calls.some((call) => call.startsWith('publishGrades'))).toBe(false);
    typeInto(input, '14');
    await settle(fixture);
    clickByText(fixture, 'tk-grade-release-panel tk-dialog button', 'Veröffentlichen');
    const expected = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    await vi.waitFor(() => expect(firebase.calls).toContain(`publishGrades:p1:${expected}`));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(panel(fixture)).toContain('sichtbar bis');
    });
  });

  it('Freigabe zurücknehmen erst nach Rückfrage', async () => {
    const { fixture, firebase } = await renderProfile({
      id: 'p1',
      setup: (fb) => fb.gradeReleases.releases.set('p1', { playerId: 'p1', publishedUntil: new Date(), expiresAt: null, createdBy: 'uid-trainer' }),
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(panel(fixture)).toContain('Veröffentlicht');
    });
    clickByText(fixture, 'tk-grade-release-panel .release button', 'Freigabe zurücknehmen');
    await settle(fixture);
    expect(firebase.calls).not.toContain('revokeGrades:p1');
    clickByText(fixture, 'tk-grade-release-panel tk-dialog button', 'Zurücknehmen');
    await vi.waitFor(() => expect(firebase.calls).toContain('revokeGrades:p1'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(panel(fixture)).toContain('Noten sind nicht veröffentlicht.');
    });
  });

  it('Veröffentlichen erst, wenn die Bewertungen für die Spieleransicht eingerichtet sind', async () => {
    const { fixture } = await renderProfile({
      id: 'p1',
      setup: (fb) => {
        fb.playerView.marker = null;
        fb.playerView.writeError = new Error('offline');
      },
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(panel(fixture)).toContain('gerade für die Spieleransicht eingerichtet');
    });
    expect(q<HTMLButtonElement>(fixture, 'tk-grade-release-panel .release button')!.disabled).toBe(true);
  });
});
