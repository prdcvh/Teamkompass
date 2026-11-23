import { clickByText, q, qa, renderProfile, settle, text } from './testing/profile-fixture';

describe('Profil: Gründe in Bewertungen und Absagen entfernen (SCRUM-248)', () => {
  async function revoked() {
    const context = await renderProfile({
      id: 'p2',
      consent: 'revoked',
      setup: (fb) => {
        fb.ratings.ratings.set('e1', new Map([['p2', { attendance: 'absent', note: 'Verletzt (ca. bis 12.12.2026)', autoAbsence: true, playerId: 'p2' }]]));
        fb.ratings.ratings.set('e2', new Map([['p2', { attendance: 'absent', note: 'Abgesagt: krank', rsvpAbsence: true, playerId: 'p2' }]]));
        fb.ratings.ratings.set('e3', new Map([['p2', { attendance: 'absent', note: 'Hat sich beim Trainer abgemeldet', playerId: 'p2' }]]));
        fb.rsvp.set('e2', 'p2', { playerId: 'p2', status: 'no', reason: 'krank', by: 'parent' });
        fb.rsvp.set('e3', 'p2', { playerId: 'p2', status: 'yes', reason: '', by: 'player' });
      },
    });
    await vi.waitFor(() => {
      context.fixture.detectChanges();
      expect(text(q(context.fixture, 'tk-health-reasons-task'))).toContain('Nur die Gründe entfernen');
    });
    return context;
  }

  it('listet automatisch eingetragene Gründe und Absagen mit Grund, Freitext nicht', async () => {
    const { fixture } = await revoked();
    const task = text(q(fixture, 'tk-health-reasons-task'));
    expect(task).toContain('2 Bewertung(en) mit Grund in der Rückmeldung und 1 Absage(n) mit Grund.');
    expect(task).toContain('Bewertung: „Verletzt (ca. bis 12.12.2026)“');
    expect(task).toContain('Bewertung: „Abgesagt: krank“');
    expect(task).toContain('Absage: „krank“');
    expect(task).not.toContain('Hat sich beim Trainer abgemeldet');
  });

  it('entfernt erst nach Rückfrage und nur den Grund', async () => {
    const { fixture, firebase } = await revoked();
    clickByText(fixture, 'tk-health-reasons-task button', 'Nur die Gründe entfernen');
    await settle(fixture);
    expect(text(q(fixture, 'tk-health-reasons-task tk-dialog'))).toContain('aus 3 Einträgen nur der Grund entfernt');
    clickByText(fixture, 'tk-health-reasons-task tk-dialog button', 'Abbrechen');
    await settle(fixture);
    expect(firebase.ratings.ratings.get('e1')?.get('p2')?.['note']).toBe('Verletzt (ca. bis 12.12.2026)');
    expect(firebase.rsvp.responses.get('e2')?.get('p2')?.['reason']).toBe('krank');

    clickByText(fixture, 'tk-health-reasons-task button', 'Nur die Gründe entfernen');
    await settle(fixture);
    clickByText(fixture, 'tk-health-reasons-task tk-dialog button', 'Gründe entfernen');
    await vi.waitFor(() => expect(firebase.rsvp.responses.get('e2')?.get('p2')?.['reason']).toBe(''));
    expect(firebase.ratings.ratings.get('e1')?.get('p2')).toMatchObject({ attendance: 'absent', note: 'Fehlt', autoAbsence: true });
    expect(firebase.ratings.ratings.get('e2')?.get('p2')).toMatchObject({ attendance: 'absent', note: 'Abgesagt', rsvpAbsence: true });
    expect(firebase.ratings.ratings.get('e3')?.get('p2')?.['note']).toBe('Hat sich beim Trainer abgemeldet');
    expect(firebase.rsvp.responses.get('e2')?.get('p2')).toMatchObject({ status: 'no', by: 'parent' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, 'tk-health-reasons-task'))).toContain('Keine Gründe in Bewertungen oder Absagen gespeichert.');
    });
  });

  it('meldet einen Fehler und lässt die Rückfrage offen', async () => {
    const { fixture, firebase } = await revoked();
    firebase.rsvp.saveError = { code: 'permission-denied' };
    clickByText(fixture, 'tk-health-reasons-task button', 'Nur die Gründe entfernen');
    await settle(fixture);
    clickByText(fixture, 'tk-health-reasons-task tk-dialog button', 'Gründe entfernen');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, 'tk-health-reasons-task [role=alert]'))).toContain('Nicht alles hat geklappt');
    });
  });

  it('nur bei widerrufener Einwilligung: sonst keine Prüfung und keine Lesezugriffe auf Absagen', async () => {
    const { fixture, firebase } = await renderProfile({ id: 'p2' });
    await settle(fixture);
    expect(qa(fixture, 'tk-health-reasons-task')).toHaveLength(0);
    expect(firebase.calls.some((call) => call.startsWith('readResponse'))).toBe(false);
  });
});
