import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FirebaseService } from '../../core/firebase.service';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { FakeFirebase } from '../../core/testing';
import { Squad } from './squad';

describe('Squad (Kader-Seite)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);

  async function render(role: 'trainer' | 'medical' = 'trainer', mobile = false) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.set('p2', { name: 'Elias Wagner', positions: ['RV'], number: 2, birthdate: '2012-06-06', status: 'Fit' });
    firebase.players.set('p3', { name: 'Jan Braun', positions: ['RA'], number: 17, birthdate: '2013-01-01', status: 'Verletzt' });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: FirebaseService, useValue: firebase }, { provide: LayoutService, useValue: { isMobile } }],
    });
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Squad);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.metrics')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);
  const qa = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => [...root(fixture).querySelectorAll<T>(selector)];
  const type = (input: HTMLInputElement | HTMLSelectElement, value: string, event = 'input') => {
    input.value = value;
    input.dispatchEvent(new Event(event));
  };
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  describe('Desktop', () => {
    it('zeigt Spieler als Tabelle mit Zählern je Status', async () => {
      const fixture = await render();
      expect(qa(fixture, 'tbody tr')).toHaveLength(3);
      expect(text(qa(fixture, 'tbody tr')[0])).toContain('1 · Jonas Keller');
      expect(text(qa(fixture, 'tbody tr')[0])).toContain('TW');
      const counts = qa(fixture, '.metrics .count').map(text);
      expect(counts).toEqual(['2', '0', '1', '0']);
      expect(text(q(fixture, '.meta'))).toBe('3 Spieler');
      expect(q(fixture, '.sync')?.getAttribute('data-state')).toBe('saved');
    });

    it('sucht, filtert nach Position und Status und setzt Filter zurück', async () => {
      const fixture = await render();
      type(q<HTMLInputElement>(fixture, 'input[type="search"]')!, 'wagner');
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr')).toHaveLength(1);
      type(q<HTMLInputElement>(fixture, 'input[type="search"]')!, 'xyz');
      fixture.detectChanges();
      expect(text(q(fixture, '.empty'))).toContain('Kein Spieler passt');
      qa<HTMLButtonElement>(fixture, '.empty button')[0].click();
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr')).toHaveLength(3);

      const [position, status] = qa<HTMLSelectElement>(fixture, '.filters select');
      type(position, 'RA', 'change');
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr').map(text)[0]).toContain('Jan Braun');
      type(position, 'all', 'change');
      type(status, 'Verletzt', 'change');
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr')).toHaveLength(1);
    });

    it('sortiert nach Name', async () => {
      const fixture = await render();
      const sort = qa<HTMLSelectElement>(fixture, '.filters select')[2];
      type(sort, 'name', 'change');
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr strong').map(text)).toEqual(['2 · Elias Wagner', '17 · Jan Braun', '1 · Jonas Keller'].sort((a, b) => a.split(' · ')[1].localeCompare(b.split(' · ')[1], 'de')));
    });

    it('legt einen Spieler an und speichert ihn in der Cloud', async () => {
      const fixture = await render();
      qa<HTMLButtonElement>(fixture, '.head button').find((b) => text(b).includes('Spieler anlegen'))!.click();
      fixture.detectChanges();
      expect(text(q(fixture, 'dialog h2'))).toBe('Spieler anlegen');
      expect(q<HTMLInputElement>(fixture, 'input[name="number"]')!.value).toBe('3'); // nächste freie Nummer

      // Erst leer abschicken: Fehler statt Speichern.
      q<HTMLFormElement>(fixture, 'form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      expect(qa(fixture, 'dialog .error').length).toBeGreaterThanOrEqual(3);
      expect(firebase.calls.some((c) => c.startsWith('savePlayer'))).toBe(false);

      type(q<HTMLInputElement>(fixture, 'input[name="name"]')!, 'Luca Weber');
      type(q<HTMLInputElement>(fixture, 'input[name="birthdate"]')!, '2012-03-12');
      qa<HTMLButtonElement>(fixture, 'button.position').filter((b) => ['ZM', 'OM'].includes(text(b))).forEach((b) => b.click());
      fixture.detectChanges();
      type(q<HTMLSelectElement>(fixture, 'select[name="status"]')!, 'Verletzt', 'change');
      fixture.detectChanges();
      type(q<HTMLInputElement>(fixture, 'input[name="injuryUntil"]')!, '2026-12-01');
      q<HTMLFormElement>(fixture, 'form')!.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => expect(firebase.players.size).toBe(4));
      const saved = [...firebase.players.values()].find((p) => p['name'] === 'Luca Weber')!;
      expect(saved).toMatchObject({ number: 3, positions: ['ZM', 'OM'], status: 'Verletzt', injuryUntil: '2026-12-01', consentStatus: 'pending' });
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr')).toHaveLength(4);
    });

    it('lehnt eine vergebene Rückennummer im Dialog ab', async () => {
      const fixture = await render();
      qa<HTMLButtonElement>(fixture, '.head button')[0].click();
      fixture.detectChanges();
      type(q<HTMLInputElement>(fixture, 'input[name="name"]')!, 'Doppel');
      type(q<HTMLInputElement>(fixture, 'input[name="birthdate"]')!, '2012-03-12');
      type(q<HTMLInputElement>(fixture, 'input[name="number"]')!, '17');
      qa<HTMLButtonElement>(fixture, 'button.position')[0].click();
      q<HTMLFormElement>(fixture, 'form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      expect(text(q(fixture, '#err-number'))).toContain('bereits vergeben');
      expect(firebase.calls.some((c) => c.startsWith('savePlayer'))).toBe(false);
    });

    it('bearbeitet einen Spieler: Formular ist vorbefüllt, Speichern ändert den Eintrag', async () => {
      const fixture = await render();
      qa<HTMLButtonElement>(fixture, 'tbody tr')[0].querySelector<HTMLButtonElement>('button')!.click();
      fixture.detectChanges();
      expect(text(q(fixture, 'dialog h2'))).toBe('Spieler bearbeiten');
      expect(q<HTMLInputElement>(fixture, 'input[name="name"]')!.value).toBe('Jonas Keller');
      expect(q<HTMLInputElement>(fixture, 'input[name="number"]')!.value).toBe('1');
      expect(qa(fixture, 'button.position').find((b) => text(b) === 'TW')!.getAttribute('aria-pressed')).toBe('true');
      type(q<HTMLInputElement>(fixture, 'input[name="name"]')!, 'Jonas K.');
      q<HTMLFormElement>(fixture, 'form')!.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => expect(firebase.players.get('p1')?.['name']).toBe('Jonas K.'));
      expect(firebase.players.size).toBe(3);
    });

    it('löscht erst nach Bestätigung', async () => {
      const fixture = await render();
      const deleteButton = () => qa<HTMLButtonElement>(fixture, 'tbody tr')[2].querySelectorAll('button')[1];
      deleteButton().click();
      fixture.detectChanges();
      expect(text(qa(fixture, 'dialog h2').find((h) => text(h) === 'Spieler löschen?'))).toBe('Spieler löschen?');
      expect(firebase.calls.some((c) => c.startsWith('deletePlayer'))).toBe(false);
      // Abbrechen löscht nichts.
      qa<HTMLButtonElement>(fixture, '.confirm-actions button')[0].click();
      fixture.detectChanges();
      expect(firebase.players.size).toBe(3);
      deleteButton().click();
      fixture.detectChanges();
      qa<HTMLButtonElement>(fixture, '.confirm-actions button')[1].click();
      await vi.waitFor(() => expect(firebase.players.has('p3')).toBe(false));
    });

    it('zeigt „verletzt bis“ und die Datennutzung', async () => {
      const fixture = await render();
      firebase.players.set('p3', { ...firebase.players.get('p3'), injuryUntil: '2026-11-01', consentStatus: 'granted' });
      firebase.emitPlayers();
      fixture.detectChanges();
      const row = qa(fixture, 'tbody tr').find((r) => text(r).includes('Jan Braun'))!;
      expect(text(row)).toContain('bis 01.11.2026');
      expect(text(row)).toContain('Einwilligung dokumentiert');
      expect(text(qa(fixture, 'tbody tr')[0])).toContain('Einwilligung offen');
    });

    it('verhindert Doppelklick beim Löschen', async () => {
      const fixture = await render();
      qa<HTMLButtonElement>(fixture, 'tbody tr')[0].querySelectorAll('button')[1].click();
      fixture.detectChanges();
      const confirm = qa<HTMLButtonElement>(fixture, '.confirm-actions button')[1];
      confirm.click();
      confirm.click();
      await vi.waitFor(() => expect(firebase.players.has('p1')).toBe(false));
      expect(firebase.calls.filter((c) => c === 'deletePlayer:p1')).toHaveLength(1);
    });

    it('meldet einen Ladefehler mit Wiederholen-Schaltfläche', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const fixture = await render();
      firebase.failPlayers({ code: 'permission-denied' });
      fixture.detectChanges();
      expect(q(fixture, '[role="alert"]')?.textContent).toContain('konnte nicht geladen werden');
      q<HTMLButtonElement>(fixture, '.notice button')!.click();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(q(fixture, '.metrics')).not.toBeNull();
      });
    });
  });

  describe('Handy', () => {
    it('zeigt Karten gruppiert nach Mannschaftsteil mit Zugänge-Karte und Anlegen-Knopf', async () => {
      const fixture = await render('trainer', true);
      expect(qa(fixture, 'h2.group').map(text)).toEqual(['Tor · 1', 'Abwehr · 1', 'Angriff · 1']);
      expect(qa(fixture, '.player-card')).toHaveLength(3);
      expect(text(qa(fixture, '.player-card')[0])).toContain('Jonas Keller');
      expect(text(qa(fixture, '.player-card')[0])).toContain('TW · 14 J.');
      expect(q(fixture, 'table')).toBeNull();
      expect(q(fixture, '.access-card')).not.toBeNull();
      expect(q(fixture, 'button.fab')?.getAttribute('aria-label')).toBe('Spieler anlegen');
    });

    it('öffnet per Tipp auf die Karte den Dialog mit Status als Auswahlleiste', async () => {
      const fixture = await render('trainer', true);
      qa<HTMLButtonElement>(fixture, '.player-card')[2].click();
      fixture.detectChanges();
      expect(q<HTMLInputElement>(fixture, 'input[name="name"]')!.value).toBe('Jan Braun');
      const radios = qa<HTMLButtonElement>(fixture, '[role="radio"]');
      expect(radios.map(text)).toEqual(['Fit', 'Angeschlagen', 'Verletzt', 'Pause']);
      expect(radios[2].getAttribute('aria-checked')).toBe('true');
      radios[0].click();
      fixture.detectChanges();
      expect(radios[0].getAttribute('aria-checked')).toBe('true');
      expect(q(fixture, 'input[name="injuryUntil"]')).toBeNull();
    });

    it('bedient die Status-Auswahl per Pfeiltasten (nur der gewählte Eintrag ist per Tab erreichbar)', async () => {
      const fixture = await render('trainer', true);
      qa<HTMLButtonElement>(fixture, '.player-card')[0].click();
      fixture.detectChanges();
      const radios = () => qa<HTMLButtonElement>(fixture, '[role="radio"]');
      expect(radios().map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
      radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(radios()[1].getAttribute('aria-checked')).toBe('true');
      expect(radios().map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1']);
      radios()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
      radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(radios()[3].getAttribute('aria-checked')).toBe('true'); // springt von Fit nach Pause
    });

    it('legt über den Knopf einen Spieler an', async () => {
      const fixture = await render('trainer', true);
      q<HTMLButtonElement>(fixture, 'button.fab')!.click();
      fixture.detectChanges();
      expect(text(q(fixture, 'dialog h2'))).toBe('Spieler anlegen');
    });
  });

  describe('nur Lesen (Medizin)', () => {
    it.each([false, true])('zeigt keine Schreibfunktionen (Handy: %s)', async (mobile) => {
      const fixture = await render('medical', mobile);
      expect(qa(fixture, mobile ? '.player-card' : 'tbody tr')).toHaveLength(3);
      for (const selector of ['button.fab', '.access-card', 'tk-player-dialog', 'tbody tr button', '.head button']) {
        expect(q(fixture, selector), selector).toBeNull();
      }
      if (mobile) expect(qa<HTMLButtonElement>(fixture, '.player-card').every((card) => card.disabled)).toBe(true);
      expect(qa(fixture, 'a').filter((a) => a.getAttribute('href') === '/zugaenge')).toHaveLength(0);
    });
  });
});
