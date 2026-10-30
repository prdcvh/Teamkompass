import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { defaultLocationFromDoc, docFromDefaultLocation, docFromFederalState, federalStateFromDoc } from './team-settings';
import { TeamSettingsService } from './team-settings.service';

describe('TeamSettingsService (Standardort)', () => {
  let firebase: FakeFirebase;

  async function setup(role: 'trainer' | 'player' | null = 'trainer') {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    const service = TestBed.inject(TeamSettingsService);
    service.start();
    if (role === 'trainer') await vi.waitFor(() => expect(service.load()).toBe('ready'));
    return service;
  }

  it('liest und speichert den Standardort', async () => {
    const service = await setup();
    expect(service.defaultLocation()).toBeNull();
    expect(service.saveDefaultLocation({ text: ' Heimplatz ', coords: { lat: 50.1, lon: 8.4, name: 'Königstein' } })).toBe(true);
    await vi.waitFor(() => expect(firebase.settings.settings).toEqual({ defaultLocation: { text: 'Heimplatz', coords: { lat: 50.1, lon: 8.4, name: 'Königstein' } } }));
    expect(service.defaultLocation()).toEqual({ text: 'Heimplatz', coords: { lat: 50.1, lon: 8.4, name: 'Königstein' } });
    service.saveDefaultLocation(null);
    await vi.waitFor(() => expect(service.defaultLocation()).toBeNull());
  });

  it('liest und schreibt nur als Trainer', async () => {
    const service = await setup('player');
    expect(firebase.settings.watchers).toBe(0);
    expect(service.saveDefaultLocation({ text: 'x', coords: null })).toBe(false);
    expect(firebase.calls).not.toContain('saveSettings');
  });

  it('verwirft die Daten beim Abmelden', async () => {
    firebase = new FakeFirebase();
    firebase.settings.settings = { defaultLocation: { text: 'Heimplatz', coords: null } };
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set('trainer');
    const service = TestBed.inject(TeamSettingsService);
    service.start();
    await vi.waitFor(() => expect(service.defaultLocation()?.text).toBe('Heimplatz'));
    session.role.set(null);
    TestBed.tick();
    expect(service.defaultLocation()).toBeNull();
    expect(firebase.settings.watchers).toBe(0);
  });

  it('bleibt bei Ladefehler ohne Standardort', async () => {
    firebase = new FakeFirebase();
    firebase.settings.watchError = new Error('x');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set('trainer');
    const service = TestBed.inject(TeamSettingsService);
    service.start();
    await vi.waitFor(() => expect(service.load()).toBe('error'));
    expect(service.defaultLocation()).toBeNull();
  });
});

describe('TeamSettingsService (Bundesland, SCRUM-186)', () => {
  it('gilt ohne gespeichertes Feld als Hessen und speichert die Wahl', async () => {
    const firebase = new FakeFirebase();
    firebase.settings.settings = { defaultLocation: { text: 'Heimplatz', coords: null } };
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set('trainer');
    const service = TestBed.inject(TeamSettingsService);
    service.start();
    await vi.waitFor(() => expect(service.load()).toBe('ready'));
    expect(service.federalState()).toBe('HE');
    expect(service.saveFederalState('BY')).toBe(true);
    await vi.waitFor(() => expect(firebase.settings.settings).toEqual({ defaultLocation: { text: 'Heimplatz', coords: null }, federalState: 'BY' }));
    expect(service.federalState()).toBe('BY');
    expect(service.saveFederalState('XX' as never)).toBe(false);
  });

  it('lässt nur Trainer das Bundesland ändern', () => {
    const firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set('player');
    const service = TestBed.inject(TeamSettingsService);
    expect(service.saveFederalState('BY')).toBe(false);
    expect(firebase.calls).not.toContain('saveSettings');
  });

  it('liest unbekannte Werte als Hessen', () => {
    expect(federalStateFromDoc(null)).toBe('HE');
    expect(federalStateFromDoc({ federalState: 'XX' })).toBe('HE');
    expect(federalStateFromDoc({ federalState: 42 })).toBe('HE');
    expect(federalStateFromDoc({ federalState: 'SN' })).toBe('SN');
    expect(docFromFederalState('NW')).toEqual({ federalState: 'NW' });
  });
});

describe('Standardort-Dokument', () => {
  it('ignoriert unbrauchbare Dokumente und ungültige Koordinaten', () => {
    expect(defaultLocationFromDoc(null)).toBeNull();
    expect(defaultLocationFromDoc({ defaultLocation: 'x' })).toBeNull();
    expect(defaultLocationFromDoc({ defaultLocation: { text: '', coords: { lat: 999, lon: 0, name: 'x' } } })).toBeNull();
    expect(defaultLocationFromDoc({ defaultLocation: { text: 'Platz', coords: { lat: 999, lon: 0, name: 'x' } } })).toEqual({ text: 'Platz', coords: null });
    expect(docFromDefaultLocation(null)).toEqual({ defaultLocation: null });
  });
});
