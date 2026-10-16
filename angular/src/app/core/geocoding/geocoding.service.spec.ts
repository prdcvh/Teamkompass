import { afterEach } from 'vitest';
import {
  GEOCODING_MAX_RESULTS,
  OpenMeteoGeocodingService,
  coordsFromPlace,
  geocodingMessage,
  openMeteoGeocodingUrl,
  placeLabel,
  placesFromResponse,
} from './geocoding.service';

const hit = (n: number) => ({ id: n, name: `Ort ${n}`, latitude: 50 + n / 100, longitude: 8 + n / 100, admin1: 'Hessen', country: 'Deutschland', population: 1 });

describe('GeocodingService (Open-Meteo, gemocktes fetch)', () => {
  const service = new OpenMeteoGeocodingService();
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const respond = (body: unknown, ok = true) => fetchMock.mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });

  it('liefert Treffer mit Name, Region und Koordinaten und überträgt nur Ortstext und Sprache', async () => {
    respond({ results: [hit(1), hit(2)] });
    const result = await service.search('  Königstein ', 'de');
    expect(result).toEqual({
      status: 'ok',
      places: [
        { name: 'Ort 1', region: 'Hessen', country: 'Deutschland', lat: 50.01, lon: 8.01 },
        { name: 'Ort 2', region: 'Hessen', country: 'Deutschland', lat: 50.02, lon: 8.02 },
      ],
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin).toBe('https://geocoding-api.open-meteo.com');
    expect([...url.searchParams.keys()].sort()).toEqual(['count', 'format', 'language', 'name', 'ngsw-bypass']);
    expect(url.searchParams.get('name')).toBe('Königstein');
    expect(url.searchParams.get('language')).toBe('de');
    expect(url.searchParams.get('count')).toBe(String(GEOCODING_MAX_RESULTS));
  });

  it('gibt höchstens 5 Treffer zurück und überspringt unbrauchbare Einträge', async () => {
    respond({ results: [null, { name: 'ohne Koordinaten' }, { name: 'x', latitude: 99, longitude: 1 }, ...[1, 2, 3, 4, 5, 6, 7].map(hit)] });
    const result = await service.search('Ort');
    expect(result.status === 'ok' && result.places.map((p) => p.name)).toEqual(['Ort 1', 'Ort 2', 'Ort 3', 'Ort 4', 'Ort 5']);
  });

  it('meldet „leer“ als ok ohne Treffer (Open-Meteo lässt `results` dann weg)', async () => {
    respond({ generationtime_ms: 0.4 });
    expect(await service.search('Xyzzy')).toEqual({ status: 'ok', places: [] });
  });

  it('meldet Netzwerk-, HTTP- und Formatfehler, ohne zu werfen', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await service.search('Ort')).toEqual({ status: 'error', reason: 'network' });
    respond({}, false);
    expect(await service.search('Ort')).toEqual({ status: 'error', reason: 'network' });
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => Promise.reject(new SyntaxError('kaputt')) });
    expect(await service.search('Ort')).toEqual({ status: 'error', reason: 'bad-response' });
    respond('text');
    expect(await service.search('Ort')).toEqual({ status: 'error', reason: 'bad-response' });
    respond({ results: 'nein' });
    expect(await service.search('Ort')).toEqual({ status: 'error', reason: 'bad-response' });
  });

  it('fragt offline gar nicht erst an', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await service.search('Ort')).toEqual({ status: 'error', reason: 'offline' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('fragt bei zu kurzem Text nicht an', async () => {
    expect(await service.search(' a ')).toEqual({ status: 'error', reason: 'invalid-input' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Geocoding-Hilfen', () => {
  it('baut die URL mit kodiertem Ortstext', () => {
    expect(openMeteoGeocodingUrl('Bad Homburg & Co', 'de')).toContain('name=Bad+Homburg+%26+Co');
  });

  it('geht am Service Worker vorbei, damit eine ältere CSP des Workers nicht blockiert (SCRUM-151)', () => {
    expect(new URL(openMeteoGeocodingUrl('Königstein', 'de')).searchParams.get('ngsw-bypass')).toBe('true');
  });

  it('bildet Anzeigename und Event-Ort ohne doppelte Teile', () => {
    const place = { name: 'Berlin', region: 'Berlin', country: 'Deutschland', lat: 52.5, lon: 13.4 };
    expect(placeLabel(place)).toBe('Berlin, Deutschland');
    expect(coordsFromPlace(place)).toEqual({ lat: 52.5, lon: 13.4, name: 'Berlin, Deutschland' });
    expect(coordsFromPlace({ ...place, name: 'x'.repeat(200) }).name).toHaveLength(120);
  });

  it('kennt zu jedem Fehler eine Meldung', () => {
    for (const reason of ['invalid-input', 'offline', 'network', 'bad-response'] as const) expect(geocodingMessage(reason).length).toBeGreaterThan(10);
  });

  it('placesFromResponse: null bei Nicht-Objekt', () => {
    expect(placesFromResponse(null)).toBeNull();
  });
});
