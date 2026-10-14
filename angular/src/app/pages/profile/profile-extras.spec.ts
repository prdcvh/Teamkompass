import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Profile } from './profile';
import { clickByText, isMobile, q, qa, root, settle, text, typeInto, renderProfileExtras } from './testing/profile-fixture';

describe('Profile: Zusatzdaten', () => {
  let firebase: FakeFirebase;

  async function renderExtras(...args: Parameters<typeof renderProfileExtras>) {
    const result = await renderProfileExtras(...args);
    firebase = result.firebase;
    return result.fixture;
  }

  it('zeigt Förderplan, Abwesenheiten und Messwerte mit Verlaufsdiagramm', async () => {
    const fixture = await renderExtras();
    const items = qa(fixture, 'tk-profile-extras .items').map(text);
    expect(items[0]).toContain('In Arbeit');
    expect(items[0]).toContain('Orientierung');
    expect(items[0]).toContain('Ziel bis 01.12.2026');
    expect(items[0]).toContain('Selbstreflexion: Lief gut');
    expect(items[0]).toContain('Trainerreview: Weiter so');
    expect(items[1]).toContain('Verletzung · Zerrung');
    expect(items[1]).toContain('seit 01.01.2020 · Ende offen');
    expect(items[1]).toContain('01.08.2026 – 10.08.2026');
    expect(items[2]).toContain('01.10.2026');
    expect(items[2]).toContain('155 cm · 43 kg · BMI 17,9');
    expect(q(fixture, 'tk-profile-extras svg')).not.toBeNull(); // Diagramm nur sichtbar, wenn die Messungen jünger als 12 Monate sind
  });

  it('die laufende Verletzung überlagert den Status und füllt den Belastungsindikator', async () => {
    const fixture = await renderExtras();
    expect(text(q(fixture, '.status-line'))).toContain('Verletzt');
    expect(text(q(fixture, '.risk'))).toContain('Belastungsindikator');
    expect(text(q(fixture, '.risk'))).toContain('Nicht einsetzen · 85%');
    expect(text(q(fixture, '.risk'))).toContain('Aktuell verletzt');
    expect(q(fixture, '.risk')?.getAttribute('data-tier')).toBe('aussetzen');
  });

  it('legt einen Förderplan an und prüft Pflichtfelder', async () => {
    const fixture = await renderExtras();
    clickByText(fixture, 'tk-profile-extras .block-head button', '+ Förderplan');
    await settle(fixture);
    const dialog = q<HTMLElement>(fixture, 'tk-plan-dialog')!;
    (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(text(dialog.querySelector('#err-focus'))).toBe('Bitte einen Schwerpunkt eingeben.');
    expect(text(dialog.querySelector('#err-goal'))).toBe('Bitte ein Ziel eingeben.');
    typeInto(dialog.querySelector<HTMLInputElement>('input[name="focus"]')!, 'Mut');
    typeInto(dialog.querySelector<HTMLInputElement>('input[name="goal"]')!, 'Mehr 1 gegen 1');
    (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect([...firebase.records.playerRecords.get('p1/developmentPlans')!.values()].some((data) => data['focus'] === 'Mut')).toBe(true));
    await settle(fixture);
    expect(text(qa(fixture, 'tk-profile-extras .items')[0])).toContain('Mut');
  });

  it('trägt eine Abwesenheit ein; ein offenes Ende geht nur bei einer Verletzung', async () => {
    const fixture = await renderExtras();
    clickByText(fixture, 'tk-profile-extras .block-head button', '+ Eintrag');
    await settle(fixture);
    const dialog = q<HTMLElement>(fixture, 'tk-absence-dialog')!;
    typeInto(dialog.querySelector<HTMLSelectElement>('select[name="reason"]')!, 'Klassenfahrt', 'change');
    typeInto(dialog.querySelector<HTMLInputElement>('input[name="from"]')!, '2026-10-12');
    (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(text(dialog.querySelector('#err-to'))).toContain('Enddatum');
    typeInto(dialog.querySelector<HTMLInputElement>('input[name="to"]')!, '2026-10-16');
    (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect([...firebase.records.playerRecords.get('p1/absences')!.values()].some((data) => data['label'] === 'Klassenfahrt')).toBe(true));
    // Das Event vom 01.09. liegt nicht in der Klassenfahrt, wohl aber in der laufenden Verletzung ohne Ende (seit 2020):
    // der Spieler wird dafür automatisch auf „Fehlt“ gesetzt (SCRUM-18).
    await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'absent', autoAbsence: true, note: 'Verletzung · Zerrung (Ende offen)' }));
  });

  it('trägt eine Messung ein und prüft die Werte', async () => {
    const fixture = await renderExtras();
    clickByText(fixture, 'tk-profile-extras .block-head button', '+ Messung');
    await settle(fixture);
    const dialog = q<HTMLElement>(fixture, 'tk-measurement-dialog')!;
    (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(text(dialog.querySelector('#err-height'))).toContain('Größe oder Gewicht');
    typeInto(dialog.querySelector<HTMLInputElement>('input[name="height"]')!, '160,5');
    typeInto(dialog.querySelector<HTMLInputElement>('input[name="weight"]')!, '48');
    (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect([...firebase.records.playerRecords.get('p1/measurements')!.values()].some((data) => data['height'] === '160.5' && data['weight'] === '48')).toBe(true));
  });

  it('löscht erst nach Bestätigung', async () => {
    const fixture = await renderExtras();
    const button = qa<HTMLButtonElement>(fixture, 'tk-profile-extras button').find((entry) => entry.getAttribute('aria-label') === 'Messung löschen: 01.07.2026')!;
    button.click();
    await settle(fixture);
    expect(firebase.calls.some((call) => call.startsWith('deletePlayerRecord'))).toBe(false);
    expect(text(q(fixture, 'tk-profile-extras .confirm-actions')?.parentElement)).toContain('die Messung vom 01.07.2026');
    clickByText(fixture, 'tk-profile-extras .confirm-actions button', 'Endgültig löschen');
    await vi.waitFor(() => expect(firebase.calls).toContain('deletePlayerRecord:p1:measurements:me1'));
  });

  it('zeigt Ladefehler der Zusatzdaten mit „Erneut versuchen“', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    isMobile.set(false);
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    firebase.records.watchPlayerRecordsError = { code: 'permission-denied' };
    TestBed.configureTestingModule({
      providers: [
        ...provideFakeFirebase(firebase),
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Profile);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, '.notice'))).toContain('Zusatzdaten konnten nicht geladen werden');
    });
  });

  it('maskiert Texte der Zusatzdaten (keine unmaskierte HTML-Ausgabe)', async () => {
    const fixture = await renderExtras();
    firebase.records.playerRecords.get('p1/developmentPlans')!.set('dp2', { focus: '<img src=x onerror=alert(1)>', goal: '<b>fett</b>', status: 'Offen', createdAt: '2026-10-01' });
    firebase.records.playerRecords.get('p1/developmentPlans')!.set('dp1', { ...firebase.records.playerRecords.get('p1/developmentPlans')!.get('dp1') });
    // Echtzeit-Update über Speichern eines weiteren Eintrags
    await firebase.records.savePlayerRecord('p1', 'absences', 'ab3', { kind: 'absence', label: '<script>x</script>', from: '2026-10-01', to: '2026-10-02' });
    await firebase.records.savePlayerRecord('p1', 'developmentPlans', 'dp3', { focus: '<img src=x onerror=alert(1)>', goal: '<b>fett</b>', status: 'Offen', createdAt: '2026-10-02' });
    await settle(fixture);
    expect(root(fixture).querySelector('tk-profile-extras img')).toBeNull();
    expect(root(fixture).querySelector('tk-profile-extras b')).toBeNull();
    expect(root(fixture).querySelector('tk-profile-extras script')).toBeNull();
    expect(text(q(fixture, 'tk-profile-extras'))).toContain('<img src=x onerror=alert(1)>');
  });
});
