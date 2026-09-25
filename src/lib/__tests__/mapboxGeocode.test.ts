import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  reverseGeocodeAddress,
  reverseGeocodePlace,
  searchPlace,
  resetReverseGeocodeCacheForTests,
  coordinateKey,
} from '../mapboxGeocode';

const feature = (place_name: string) => ({ ok: true, json: async () => ({ features: [{ place_name }] }) });

describe('reverseGeocodeAddress', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    resetReverseGeocodeCacheForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('consulta lng,lat em pt com o token e devolve o place_name', async () => {
    fetchMock.mockResolvedValue(feature('Av. Paulista, 1000, São Paulo - SP, Brasil'));
    await expect(reverseGeocodeAddress(-23.55, -46.63, 'pk.a b')).resolves.toBe('Av. Paulista, 1000, São Paulo - SP, Brasil');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/mapbox.places/-46.63,-23.55.json');
    expect(url).toContain('access_token=pk.a%20b');
    expect(url).toContain('language=pt');
    expect(url).toContain('limit=1');
  });

  it('coordenadas praticamente iguais (~1 m) e chamadas simultâneas compartilham uma consulta', async () => {
    fetchMock.mockResolvedValue(feature('Rua A'));
    const results = await Promise.all([
      reverseGeocodeAddress(-23.550001, -46.630001, 'pk'),
      reverseGeocodeAddress(-23.550004, -46.630004, 'pk'),
    ]);
    expect(results).toEqual(['Rua A', 'Rua A']);
    await reverseGeocodeAddress(-23.550002, -46.630002, 'pk');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await reverseGeocodeAddress(-23.56, -46.64, 'pk');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(coordinateKey(-23.550004, -46.630004)).toBe(coordinateKey(-23.550001, -46.630001));
  });

  it.each([
    ['HTTP de erro', () => fetchMock.mockResolvedValue({ ok: false })],
    ['falha de rede', () => fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))],
    ['sem resultado', () => fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) })],
    ['place_name vazio', () => fetchMock.mockResolvedValue(feature(''))],
  ])('%s vira null e não fica em cache', async (_label, arrange) => {
    arrange();
    await expect(reverseGeocodeAddress(-23.55, -46.63, 'pk')).resolves.toBeNull();
    fetchMock.mockResolvedValue(feature('Rua B'));
    await expect(reverseGeocodeAddress(-23.55, -46.63, 'pk')).resolves.toBe('Rua B');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('estoura o timeout, aborta a requisição e devolve null', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = reverseGeocodeAddress(-23.55, -46.63, 'pk');
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toBeNull();
    expect((fetchMock.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted).toBe(true);
  });

  it('coordenada inválida devolve null sem consultar', async () => {
    await expect(reverseGeocodeAddress(Number.NaN, -46.63, 'pk')).resolves.toBeNull();
    await expect(reverseGeocodeAddress(-23.55, Number.POSITIVE_INFINITY, 'pk')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('o cache é limitado: passando de 200 coordenadas a mais antiga é descartada', async () => {
    fetchMock.mockResolvedValue(feature('Rua'));
    for (let i = 0; i <= 200; i += 1) await reverseGeocodeAddress(-10 - i / 1000, -40, 'pk');
    expect(fetchMock).toHaveBeenCalledTimes(201);
    await reverseGeocodeAddress(-10, -40, 'pk');
    expect(fetchMock).toHaveBeenCalledTimes(202);
    await reverseGeocodeAddress(-10 - 200 / 1000, -40, 'pk');
    expect(fetchMock).toHaveBeenCalledTimes(202);
  });
});

describe('reverseGeocodePlace', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    resetReverseGeocodeCacheForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('devolve rótulo curto e endereço completo', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [{ text: 'Av. Paulista', place_name: 'Av. Paulista, São Paulo' }] }) });
    await expect(reverseGeocodePlace(-23.55, -46.63, 'pk')).resolves.toEqual({ name: 'Av. Paulista', address: 'Av. Paulista, São Paulo' });
  });

  it('requisição pendurada vira null no timeout e não fica em cache', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = reverseGeocodePlace(-23.55, -46.63, 'pk');
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toBeNull();

    // Falha não cacheada: a próxima tentativa consulta de novo.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [{ place_name: 'Rua B' }] }) });
    await expect(reverseGeocodePlace(-23.55, -46.63, 'pk')).resolves.toEqual({ address: 'Rua B' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('searchPlace', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('devolve coordenada, rótulo e endereço; consulta em pt, br, limit=1, token codificado', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [{ center: [-46.6, -23.5], text: 'B', place_name: 'B, SP' }] }) });
    await expect(searchPlace('avenida paulista', 'pk.a b')).resolves.toEqual({ ok: true, place: { lat: -23.5, lng: -46.6, name: 'B', address: 'B, SP' } });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/mapbox.places/avenida%20paulista.json');
    expect(url).toContain('access_token=pk.a%20b');
    expect(url).toContain('language=pt');
    expect(url).toContain('country=br');
    expect(url).toContain('limit=1');
  });

  it('classifica a falha: 429, outro HTTP, rede e sem resultado', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(searchPlace('a', 'pk')).resolves.toEqual({ ok: false, kind: 'rate_limited' });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(searchPlace('a', 'pk')).resolves.toEqual({ ok: false, kind: 'http' });

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(searchPlace('a', 'pk')).resolves.toEqual({ ok: false, kind: 'network' });

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) });
    await expect(searchPlace('a', 'pk')).resolves.toEqual({ ok: false, kind: 'not_found' });

    // Resultado sem coordenada não vale como acerto.
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ features: [{ place_name: 'sem centro' }] }) });
    await expect(searchPlace('a', 'pk')).resolves.toEqual({ ok: false, kind: 'not_found' });
  });

  it('busca pendurada vira timeout em 8 s em vez de nunca responder', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = searchPlace('a', 'pk');
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toEqual({ ok: false, kind: 'timeout' });
    expect((fetchMock.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted).toBe(true);
  });

  it('cancelamento externo vira aborted, não erro de tela', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = searchPlace('a', 'pk', controller.signal);
    controller.abort();
    await expect(pending).resolves.toEqual({ ok: false, kind: 'aborted' });

    // Signal já abortado antes da chamada: nem consulta.
    fetchMock.mockClear();
    await expect(searchPlace('a', 'pk', controller.signal)).resolves.toEqual({ ok: false, kind: 'aborted' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consulta vazia não vai à rede', async () => {
    await expect(searchPlace('   ', 'pk')).resolves.toEqual({ ok: false, kind: 'not_found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não cacheia: a mesma consulta repetida vai à rede de novo', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [{ center: [-46.6, -23.5], place_name: 'B' }] }) });
    await searchPlace('mesma', 'pk');
    await searchPlace('mesma', 'pk');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
