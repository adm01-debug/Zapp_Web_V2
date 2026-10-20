import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  reportClientError: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => h.invoke(...args) } },
}));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: (...args: unknown[]) => h.reportClientError(...args) }));
vi.mock('@/lib/logger', () => ({ log: { error: (...args: unknown[]) => h.logError(...args) } }));

import {
  getMapboxToken,
  resetMapboxTokenForTests,
  reportMapboxFailure,
  mapboxFailureKindFromMapError,
  mapboxFailureKindOf,
  mapboxFailureMessage,
  MapboxTokenError,
  MAPBOX_TOKEN_TIMEOUT_MS,
} from '../mapboxToken';

const ok = (token = 'pk.test') => ({ data: { token }, error: null });
const httpError = (status: number) => ({ data: null, error: { name: 'FunctionsHttpError', context: { status } } });

describe('getMapboxToken', () => {
  beforeEach(() => {
    h.invoke.mockReset();
    h.reportClientError.mockReset();
    h.logError.mockReset();
    resetMapboxTokenForTests();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('devolve o token e reaproveita o cache na segunda chamada', async () => {
    h.invoke.mockResolvedValue(ok('pk.a'));
    expect(await getMapboxToken()).toBe('pk.a');
    expect(await getMapboxToken()).toBe('pk.a');
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('chamadas simultâneas compartilham uma única invoke', async () => {
    h.invoke.mockResolvedValue(ok('pk.a'));
    const tokens = await Promise.all([getMapboxToken(), getMapboxToken(), getMapboxToken()]);
    expect(tokens).toEqual(['pk.a', 'pk.a', 'pk.a']);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('force ignora o cache', async () => {
    h.invoke.mockResolvedValueOnce(ok('pk.a')).mockResolvedValueOnce(ok('pk.b'));
    expect(await getMapboxToken()).toBe('pk.a');
    expect(await getMapboxToken({ force: true })).toBe('pk.b');
    expect(await getMapboxToken()).toBe('pk.b');
    expect(h.invoke).toHaveBeenCalledTimes(2);
  });

  it('estoura o timeout, aborta a requisição e devolve kind=timeout', async () => {
    vi.useFakeTimers();
    h.invoke.mockReturnValue(new Promise(() => {}));
    const pending = getMapboxToken();
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(MAPBOX_TOKEN_TIMEOUT_MS);
    await assertion;
    const options = h.invoke.mock.calls[0][1] as { signal: AbortSignal };
    expect(options.signal.aborted).toBe(true);
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'rate_limited'],
    [500, 'server_error'],
    [503, 'server_error'],
  ])('HTTP %i vira %s', async (status, kind) => {
    h.invoke.mockResolvedValue(httpError(status));
    await expect(getMapboxToken()).rejects.toMatchObject({ kind });
  });

  it('erro de fetch da SDK vira network e relay vira server_error', async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsFetchError' } });
    await expect(getMapboxToken()).rejects.toMatchObject({ kind: 'network' });
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsRelayError' } });
    await expect(getMapboxToken()).rejects.toMatchObject({ kind: 'server_error' });
  });

  it('TypeError lançado (fetch falhou) vira network', async () => {
    h.invoke.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getMapboxToken()).rejects.toMatchObject({ kind: 'network' });
  });

  it('resposta 200 sem token vira unknown', async () => {
    h.invoke.mockResolvedValue({ data: {}, error: null });
    await expect(getMapboxToken()).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('falha não é cacheada: a próxima chamada tenta de novo', async () => {
    h.invoke.mockResolvedValueOnce(httpError(500)).mockResolvedValueOnce(ok('pk.a'));
    await expect(getMapboxToken()).rejects.toBeInstanceOf(MapboxTokenError);
    expect(await getMapboxToken()).toBe('pk.a');
    expect(h.invoke).toHaveBeenCalledTimes(2);
  });
});

describe('classificação e telemetria', () => {
  beforeEach(() => { h.reportClientError.mockReset(); h.logError.mockReset(); });

  it('classifica o erro do evento error do mapbox-gl', () => {
    expect(mapboxFailureKindFromMapError({ status: 401 })).toBe('invalid_token');
    expect(mapboxFailureKindFromMapError({ status: 403 })).toBe('forbidden');
    expect(mapboxFailureKindFromMapError(new TypeError('Failed to fetch'))).toBe('network');
    expect(mapboxFailureKindFromMapError(new Error('x'))).toBe('unknown');
    expect(mapboxFailureKindFromMapError(null)).toBe('unknown');
  });

  it('kind de erro arbitrário é unknown; de MapboxTokenError é o próprio kind', () => {
    expect(mapboxFailureKindOf(new MapboxTokenError('timeout'))).toBe('timeout');
    expect(mapboxFailureKindOf(new Error('x'))).toBe('unknown');
    expect(mapboxFailureMessage('unknown')).toBe('Não foi possível carregar o mapa.');
  });

  it('reportMapboxFailure loga e reporta com source e kind', () => {
    reportMapboxFailure('timeout', 'picker');
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(h.reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'mapbox_timeout' }),
      { source: 'mapbox_picker', kind: 'timeout' },
    );
  });
});
