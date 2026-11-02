import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { CurrentTeam } from '../team/current-team.service';
import { cardChanges } from './consent-card.service';
import {
  OWN_TEAM_IDS,
  consentPrintHtml,
  consentTextParagraphs,
  hasHealthFields,
  healthLockedMessage,
  mayGiveReason,
  mayStoreHealth,
  requiresDocumentedConsent,
} from './consent';
import { cardFromPlayer, emptyDraft, playerFromCard, playerFromDoc } from './player';
import { SquadService } from './squad.service';

const FOREIGN = 'Xy7Fremd0000Verein01';

describe('Einwilligung (SCRUM-245)', () => {
  it('eigene Teams ohne Sperre, jedes andere Team mit voller Sperre', () => {
    expect(OWN_TEAM_IDS).toEqual(['mein-team', 'U14', 'U15', 'U17']);
    for (const team of OWN_TEAM_IDS) expect(requiresDocumentedConsent(team)).toBe(false);
    for (const team of [FOREIGN, 'u17', 'U18', '']) expect(requiresDocumentedConsent(team)).toBe(true);
  });

  it('Gesundheitsdaten speichern: eigene Teams immer, fremde nur dokumentiert', () => {
    for (const consentStatus of ['pending', 'granted', 'revoked'] as const) expect(mayStoreHealth({ consentStatus }, 'U17')).toBe(true);
    expect(mayStoreHealth({ consentStatus: 'granted' }, FOREIGN)).toBe(true);
    expect(mayStoreHealth({ consentStatus: 'pending' }, FOREIGN)).toBe(false);
    expect(mayStoreHealth({ consentStatus: 'revoked' }, FOREIGN)).toBe(false);
    expect(mayStoreHealth(null, FOREIGN)).toBe(false);
  });

  it('Absagegrund: nie bei Widerruf, in fremden Vereinen nur dokumentiert', () => {
    expect(mayGiveReason({ consentStatus: 'pending' }, 'U14')).toBe(true);
    expect(mayGiveReason({ consentStatus: 'revoked' }, 'U14')).toBe(false);
    expect(mayGiveReason({ consentStatus: 'pending' }, FOREIGN)).toBe(false);
    expect(mayGiveReason({ consentStatus: 'granted' }, FOREIGN)).toBe(true);
  });

  it('erkennt Gesundheitsangaben im Spielerdokument', () => {
    expect(hasHealthFields({ status: 'Fit', injuryUntil: '', injuredSince: '' })).toBe(false);
    expect(hasHealthFields({ status: 'Angeschlagen', injuryUntil: '', injuredSince: '' })).toBe(true);
    expect(hasHealthFields({ status: 'Fit', injuryUntil: '2026-12-01', injuredSince: '' })).toBe(true);
  });

  it('Einwilligungstext mit Verein, Druckfassung maskiert Namen', () => {
    expect(consentTextParagraphs('1. FC Königstein · U17')[0]).toContain('Wir (1. FC Königstein · U17) nutzen TeamKompass');
    expect(consentTextParagraphs('')[0]).toContain('(Name Verein/Team)');
    const html = consentPrintHtml('Verein', '<b>Elias</b>');
    expect(html).toContain('&lt;b&gt;Elias&lt;/b&gt;');
    expect(html).not.toContain('<b>Elias');
    expect(html).toContain('Unterschrift');
    expect(healthLockedMessage('Ali')).toContain('Ali');
  });

  it('bereinigte Karte enthält keine Gesundheitsangaben', () => {
    const player = playerFromDoc('p1', { name: 'Ali', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Verletzt', injuryUntil: '2026-12-01', injuredSince: '2026-11-01', consentStatus: 'revoked' });
    const card = cardFromPlayer(player);
    expect(Object.keys(card).sort()).toEqual(['birthdate', 'consentStatus', 'name', 'number', 'playerId', 'positions']);
    const back = playerFromCard('p1', { ...card, status: 'Verletzt', injuryUntil: '2026-12-01' });
    expect(back).toMatchObject({ name: 'Ali', number: 9, status: 'Fit', injuryUntil: '', injuredSince: '', consentStatus: 'revoked', healthHidden: true });
  });

  it('Kartenabgleich: Karte nur bei Widerruf, unveränderte nicht neu, überflüssige löschen', () => {
    const revoked = playerFromDoc('p1', { name: 'Ali', positions: ['ST'], number: 9, birthdate: '2012-05-05', consentStatus: 'revoked' });
    const open = playerFromDoc('p2', { name: 'Zoe', positions: ['TW'], number: 1, birthdate: '2012-05-05', consentStatus: 'pending' });
    expect([...cardChanges([revoked, open], []).keys()]).toEqual(['p1']);
    const published = [{ id: 'p1', data: Object.fromEntries(Object.entries(cardFromPlayer(revoked)).sort(([a], [b]) => a.localeCompare(b))) }];
    expect(cardChanges([revoked, open], published).size).toBe(0);
    expect(cardChanges([{ ...revoked, name: 'Ali A.' }], published).get('p1')).toMatchObject({ name: 'Ali A.' });
    expect(cardChanges([{ ...revoked, consentStatus: 'pending' }], published).get('p1')).toBeNull();
  });
});

describe('SquadService und Einwilligung (SCRUM-245)', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'physio' | 'player' | 'parent', team = 'U14') {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'pending' });
    firebase.players.players.set('p2', { name: 'Zoe Zander', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'revoked' });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(CurrentTeam).id.set(team);
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.uid.set('uid-trainer');
    session.email.set('trainer@example.test');
    if (role === 'player' || role === 'parent') session.playerId.set('p2');
    return TestBed.inject(SquadService);
  }

  const draft = (overrides = {}) => ({ ...emptyDraft([]), id: 'p1', name: 'Ali Adler', positions: ['ST'], birthdate: '2012-05-05', number: '9', ...overrides });

  it('fremder Verein: Status „Verletzt“ ohne dokumentierte Einwilligung wird nicht gespeichert', async () => {
    const squad = setup('trainer', FOREIGN);
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    const errors = squad.save(draft({ status: 'Verletzt', consentStatus: 'pending' }));
    expect(errors.status).toContain('fehlt die dokumentierte Einwilligung');
    expect(firebase.calls).not.toContain('savePlayer:p1');
    // Mit „Fit“ oder mit dokumentierter Einwilligung geht es.
    expect(squad.save(draft({ status: 'Fit', consentStatus: 'pending' }))).toEqual({});
    expect(squad.save(draft({ status: 'Verletzt', consentStatus: 'granted' }))).toEqual({});
  });

  it('eigenes Team: Status „Verletzt“ bei offener Einwilligung wie bisher', async () => {
    const squad = setup('trainer');
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    expect(squad.save(draft({ status: 'Verletzt', consentStatus: 'pending' }))).toEqual({});
  });

  it('„dokumentiert“ speichert Datum und wer es eingetragen hat', async () => {
    const squad = setup('trainer');
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    expect(squad.save(draft({ consentStatus: 'granted', consentDate: '' }))).toEqual({});
    await vi.waitFor(() => expect(firebase.players.players.get('p1')?.['consentStatus']).toBe('granted'));
    const saved = firebase.players.players.get('p1')!;
    expect(saved['consentByUid']).toBe('uid-trainer');
    expect(saved['consentBy']).toBe('trainer@example.test');
    expect(saved['consentDate']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('Medizin lädt die Liste ohne widerrufene Einwilligungen', async () => {
    const squad = setup('physio');
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    expect(firebase.players.lastWatchOptions).toEqual({ withoutRevokedConsent: true });
    expect(squad.players().map((player) => player.id)).toEqual(['p1']);
  });

  it('Trainer: merkt Spielerdokumente ohne Feld consentStatus', async () => {
    const squad = setup('trainer');
    firebase.players.players.set('p3', { name: 'Alt', positions: ['ZM'], number: 3, birthdate: '2012-01-01' });
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    expect(squad.missingConsent()).toEqual(['p3']);
  });

  it('Spieler mit widerrufener Einwilligung: gesperrtes Spielerdokument → bereinigte Karte ohne Gesundheitsangaben', async () => {
    const squad = setup('player');
    firebase.players.readablePlayerDocs = new Set(['p1']);
    firebase.players.cards.set('p2', { playerId: 'p2', name: 'Zoe Zander', number: 1, positions: ['TW'], birthdate: '2012-05-05', consentStatus: 'revoked' });
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    expect(squad.players()).toHaveLength(1);
    expect(squad.players()[0]).toMatchObject({ id: 'p2', name: 'Zoe Zander', healthHidden: true, consentStatus: 'revoked' });
  });

  it('Spieler: gesperrtes Dokument ohne Karte bleibt ein Ladefehler', async () => {
    const squad = setup('player');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.players.readablePlayerDocs = new Set(['p1']);
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('error'));
  });
});
