import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { FirebaseService } from '../../core/firebase.service';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { FakeFirebase } from '../../core/testing';
import { Profile } from './profile';

describe('Profile (Spielerprofil)', () => {
  let firebase: FakeFirebase;
  let navigate: ReturnType<typeof vi.fn>;
  const isMobile = signal(false);

  const grades = (grade: number, extra: Record<string, unknown> = {}) => ({ attendance: 'present', effort: grade, technique: grade, tactics: grade, comprehension: grade, ...extra });

  async function render(options: { mobile?: boolean; id?: string; withData?: boolean } = {}) {
    const { mobile = false, id = '', withData = true } = options;
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Verletzt', injuryUntil: '2026-12-01', consentStatus: 'granted', consentDate: '2026-09-01' });
    firebase.players.set('p2', { name: '<b>Elias</b> Wagner', positions: ['RV', 'LV'], number: 2, birthdate: '2012-06-06', status: 'Fit', consentStatus: 'pending' });
    if (withData) {
      firebase.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-09-01', intensity: 2, notes: 'Passspiel' });
      firebase.events.set('e2', { type: 'Spiel', title: '<img src=x onerror=alert(1)>', date: '2026-09-08', intensity: 3, goalsFor: 3, goalsAgainst: 1, matchDuration: 80 });
      firebase.events.set('e3', { type: 'Training', title: 'Training Zukunft', date: '2099-01-01' });
      firebase.ratings.set('e1', new Map([['p1', grades(3, { note: '' })]]));
      firebase.ratings.set('e2', new Map([['p1', grades(1, { note: 'Starkes Spiel', minutes: 80, goals: 2, assists: 1 })]]));
      firebase.ratings.set('e3', new Map([['p1', { attendance: 'absent' }]]));
    }
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseService, useValue: firebase },
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap(id ? { id } : {})) } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Profile);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.header, .notice, .empty')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);
  const qa = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => [...root(fixture).querySelectorAll<T>(selector)];
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('zeigt den ersten Spieler mit Kopfbereich, Schnitt und Datennutzung', async () => {
    const fixture = await render();
    expect(text(q(fixture, '.who strong'))).toBe('Jonas Keller');
    expect(text(q(fixture, '.who'))).toContain('TW');
    expect(text(q(fixture, '.who'))).toContain('Verletzt (ca. bis 01.12.2026)');
    expect(text(q(fixture, '.who'))).toContain('Datennutzung: dokumentiert am 01.09.2026');
    expect(text(q(fixture, '.grade strong'))).toBe('2,0'); // Schnitt aus 3 und 1; „Fehlt“ und Zukunft zählen nicht
  });

  it('zeigt Verlaufsdiagramm, Kompetenzprofil und Verfügbarkeit', async () => {
    const fixture = await render();
    expect(qa(fixture, 'svg circle')).toHaveLength(2);
    expect(q(fixture, 'svg')?.getAttribute('aria-label')).toContain('2 benotete Events');
    const labels = (list: Element) => [...list.querySelectorAll('.bar')].map((bar) => bar.getAttribute('aria-label'));
    expect(labels(qa(fixture, '.bars')[0])).toEqual(['Einsatz 2,0', 'Fehlerquote 2,0', 'Entscheidungsfindung 2,0', 'Lernfähigkeit 2,0']);
    // das Zukunftsevent mit „Fehlt“ zählt nicht
    expect(labels(qa(fixture, '.bars')[1])).toEqual(['Anwesend 2/2', 'Teilweise 0/2', 'Fehlt 0/2', 'Nicht im Kader 0/2']);
  });

  it('zeigt Statistik-Karten mit den berechneten Werten', async () => {
    const fixture = await render();
    const cards = Object.fromEntries(qa(fixture, '.stat').map((card) => [text(card.querySelector('span')), text(card.querySelector('strong'))]));
    expect(cards['Notenschnitt']).toBe('2,0');
    expect(cards['Spiel-Schnitt']).toBe('1,0');
    expect(cards['Training-Schnitt']).toBe('3,0');
    expect(cards['Bewertete Events']).toBe('2');
    expect(cards['Teilnahmen']).toBe('2');
    expect(cards['Trend']).toBe('+2'); // 3 → 1
    expect(cards['Entwicklung Saison']).toBe('+2');
    expect(cards['Bestes Event']).toBe('1,0 · Spiel');
    expect(cards['Einsatzquote']).toBe('100%'); // 80 von 80 Minuten
    expect(cards['Tore + Vorlagen']).toBe('2 + 1');
    expect(cards['Scorer/Spiel']).toBe('3');
    expect(cards['Min./Spiel']).toBe('80');
  });

  it('zeigt die Eventhistorie, neueste zuerst, mit Ergebnis und Notiz', async () => {
    const fixture = await render();
    const rows = qa(fixture, '.history li');
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain('08.09.2026');
    expect(text(rows[0])).toContain('Spiel · 3:1 · Note 1,0');
    expect(text(rows[0])).toContain('Starkes Spiel');
    expect(text(rows[1])).toContain('Training Montag');
    expect(text(rows[1])).toContain('Passspiel'); // Event-Notiz, wenn kein Feedback da ist
  });

  it('maskiert Namen und Titel (keine unmaskierte HTML-Ausgabe)', async () => {
    const fixture = await render();
    expect(root(fixture).querySelector('img')).toBeNull();
    expect(text(q(fixture, '.history'))).toContain('<img src=x onerror=alert(1)>');
    const picker = qa<HTMLOptionElement>(fixture, '.picker option').map(text);
    expect(picker).toContain('2 · <b>Elias</b> Wagner');
    expect(root(fixture).querySelector('.picker b')).toBeNull();
  });

  it('wechselt den Spieler per Auswahl und passt die Adresse an', async () => {
    const fixture = await render();
    const select = q<HTMLSelectElement>(fixture, '.picker select')!;
    select.value = 'p2';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, '.who strong'))).toContain('Wagner');
    });
    expect(navigate).toHaveBeenCalledWith(['/profile', 'p2'], { replaceUrl: true });
    expect(text(q(fixture, '.who'))).toContain('Datennutzung: noch offen');
    expect(text(root(fixture))).toContain('Für diesen Spieler gibt es noch keine Bewertungen.');
    expect(text(q(fixture, '.grade strong'))).toBe('–');
    expect(firebase.calls).toContain('watchRatingDoc:e1:p2');
  });

  it('öffnet den Spieler aus der Adresse', async () => {
    const fixture = await render({ id: 'p2' });
    expect(text(q(fixture, '.who strong'))).toContain('Wagner');
  });

  it('zeigt bei leerem Kader einen Hinweis', async () => {
    isMobile.set(false);
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseService, useValue: firebase },
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Profile);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.empty')).not.toBeNull();
    });
    expect(text(q(fixture, '.empty'))).toContain('Noch kein Spieler im Kader.');
  });

  it('zeigt Ladefehler mit „Erneut versuchen“', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    isMobile.set(false);
    firebase = new FakeFirebase();
    firebase.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    firebase.events.set('e1', { type: 'Training', title: 'T', date: '2026-09-01' });
    firebase.watchRatingDocError = { code: 'permission-denied' };
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseService, useValue: firebase },
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Profile);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.notice')).not.toBeNull();
    });
    expect(text(q(fixture, '.notice'))).toContain('Das Profil konnte nicht geladen werden');
    firebase.watchRatingDocError = null;
    q<HTMLButtonElement>(fixture, '.notice button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.header')).not.toBeNull();
    });
  });

  it('nutzt am Handy dieselbe Seite einspaltig', async () => {
    const fixture = await render({ mobile: true });
    expect(q(fixture, '.page')?.getAttribute('data-variant')).toBe('mobile');
    expect(qa(fixture, '.stat')).toHaveLength(14);
  });

  describe('Zusatzdaten', () => {
    async function renderExtras(role: 'trainer' | 'medical' = 'trainer') {
      isMobile.set(false);
      firebase = new FakeFirebase();
      firebase.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'granted' });
      firebase.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-09-01', intensity: 2 });
      firebase.playerRecords.set('p1/developmentPlans', new Map([['dp1', { focus: 'Orientierung', goal: 'Blick vor dem Ball', status: 'In Arbeit', dueDate: '2026-12-01', createdAt: '2026-09-01', selfReflection: 'Lief gut', coachReview: 'Weiter so' }]]));
      firebase.playerRecords.set('p1/absences', new Map([
        ['ab1', { kind: 'injury', label: 'Verletzung', detail: 'Zerrung', from: '2020-01-01', to: '' }],
        ['ab2', { kind: 'absence', label: 'Urlaub', from: '2026-08-01', to: '2026-08-10' }],
      ]));
      firebase.playerRecords.set('p1/measurements', new Map([
        ['me1', { date: '2026-07-01', height: '150', weight: '40' }],
        ['me2', { date: '2026-10-01', height: '155', weight: '43' }],
      ]));
      navigate = vi.fn().mockResolvedValue(true);
      TestBed.configureTestingModule({
        providers: [
          { provide: FirebaseService, useValue: firebase },
          { provide: LayoutService, useValue: { isMobile } },
          { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) } },
          { provide: Router, useValue: { navigate } },
        ],
      });
      TestBed.inject(SessionService).role.set(role);
      const fixture = TestBed.createComponent(Profile);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(root(fixture).querySelector('.block')).not.toBeNull();
      });
      return fixture;
    }

    const clickByText = (fixture: { nativeElement: unknown }, selector: string, label: string) => {
      const button = qa<HTMLButtonElement>(fixture, selector).find((entry) => text(entry) === label);
      expect(button, `${selector} „${label}“`).toBeDefined();
      button!.click();
    };
    const settle = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const typeInto = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string, event = 'input') => {
      element.value = value;
      element.dispatchEvent(new Event(event));
    };

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
      await vi.waitFor(() => expect([...firebase.playerRecords.get('p1/developmentPlans')!.values()].some((data) => data['focus'] === 'Mut')).toBe(true));
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
      await vi.waitFor(() => expect([...firebase.playerRecords.get('p1/absences')!.values()].some((data) => data['label'] === 'Klassenfahrt')).toBe(true));
      // Das Event vom 01.09. liegt nicht in der Klassenfahrt, wohl aber in der laufenden Verletzung ohne Ende (seit 2020):
      // der Spieler wird dafür automatisch auf „Fehlt“ gesetzt (SCRUM-18).
      await vi.waitFor(() => expect(firebase.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'absent', autoAbsence: true, note: 'Verletzung · Zerrung (Ende offen)' }));
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
      await vi.waitFor(() => expect([...firebase.playerRecords.get('p1/measurements')!.values()].some((data) => data['height'] === '160.5' && data['weight'] === '48')).toBe(true));
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
      firebase.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
      firebase.watchPlayerRecordsError = { code: 'permission-denied' };
      TestBed.configureTestingModule({
        providers: [
          { provide: FirebaseService, useValue: firebase },
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
      firebase.playerRecords.get('p1/developmentPlans')!.set('dp2', { focus: '<img src=x onerror=alert(1)>', goal: '<b>fett</b>', status: 'Offen', createdAt: '2026-10-01' });
      firebase.playerRecords.get('p1/developmentPlans')!.set('dp1', { ...firebase.playerRecords.get('p1/developmentPlans')!.get('dp1') });
      // Echtzeit-Update über Speichern eines weiteren Eintrags
      await firebase.savePlayerRecord('p1', 'absences', 'ab3', { kind: 'absence', label: '<script>x</script>', from: '2026-10-01', to: '2026-10-02' });
      await firebase.savePlayerRecord('p1', 'developmentPlans', 'dp3', { focus: '<img src=x onerror=alert(1)>', goal: '<b>fett</b>', status: 'Offen', createdAt: '2026-10-02' });
      await settle(fixture);
      expect(root(fixture).querySelector('tk-profile-extras img')).toBeNull();
      expect(root(fixture).querySelector('tk-profile-extras b')).toBeNull();
      expect(root(fixture).querySelector('tk-profile-extras script')).toBeNull();
      expect(text(q(fixture, 'tk-profile-extras'))).toContain('<img src=x onerror=alert(1)>');
    });
  });
});
