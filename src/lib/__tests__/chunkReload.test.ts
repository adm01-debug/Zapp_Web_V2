import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

const {
  isChunkLoadError,
  triggerChunkReload,
  hasExhaustedChunkReloads,
  resetChunkReloadGuard,
  CHUNK_RELOAD_AT_KEY,
  CHUNK_RELOAD_COUNT_KEY,
  CHUNK_RELOAD_COOLDOWN_MS,
  LEGACY_CHUNK_RELOAD_KEY,
  MAX_CHUNK_RELOADS,
} = await import('@/lib/chunkReload');

const reload = vi.fn();

describe('chunkReload — reconhecimento', () => {
  it('reconhece as mensagens de chunk sem diferenciar maiusculas', () => {
    const mensagens = [
      'Failed to fetch dynamically imported module: https://x/app.js',
      'ChunkLoadError: Loading chunk 42 failed.',
      'Loading chunk 7 failed.',
      'Error: Importing a module script failed.',
      'error loading dynamically imported module',
      'Unable to preload CSS for /assets/x.css',
    ];
    for (const mensagem of mensagens) {
      expect(isChunkLoadError(new Error(mensagem)), mensagem).toBe(true);
    }
    expect(isChunkLoadError(new TypeError('LOADING CHUNK 3 FAILED'))).toBe(true);
  });

  it('reconhece erro nomeado ChunkLoadError sem mensagem conhecida', () => {
    const erro = new Error('qualquer coisa');
    erro.name = 'ChunkLoadError';
    expect(isChunkLoadError(erro)).toBe(true);
  });

  it('nao confunde erro comum com falha de chunk', () => {
    expect(isChunkLoadError(new Error('Failed to fetch'))).toBe(false);
    expect(isChunkLoadError(new Error('network timeout'))).toBe(false);
    expect(isChunkLoadError({ message: 'oops' })).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('chunkReload — orcamento e cooldown', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetChunkReloadGuard();
    reload.mockClear();
    // jsdom nao navega: troca o location por um duble observavel.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { reload },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recarrega, grava o contador e o instante da recarga', () => {
    expect(triggerChunkReload()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY)).toBe('1');
    expect(Number(sessionStorage.getItem(CHUNK_RELOAD_AT_KEY))).toBeGreaterThan(0);
    expect(hasExhaustedChunkReloads()).toBe(false);
  });

  it('respeita o cooldown: segunda falha em menos de 30 s nao recarrega', () => {
    expect(triggerChunkReload()).toBe(true);
    expect(triggerChunkReload()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY)).toBe('1');
  });

  it('gasta o orcamento de 2 recargas e para na terceira', () => {
    // zera o cooldown entre as tentativas para exercitar so o orcamento
    expect(triggerChunkReload()).toBe(true);
    sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, '0');
    expect(triggerChunkReload()).toBe(true);
    sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, '0');
    expect(triggerChunkReload()).toBe(false);

    expect(reload).toHaveBeenCalledTimes(MAX_CHUNK_RELOADS);
    expect(sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY)).toBe(String(MAX_CHUNK_RELOADS));
    expect(hasExhaustedChunkReloads()).toBe(true);
  });

  it('contador corrompido degrada para esgotado em vez de zerar', () => {
    sessionStorage.setItem(CHUNK_RELOAD_COUNT_KEY, '999');
    expect(hasExhaustedChunkReloads()).toBe(true);
    expect(triggerChunkReload()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('relogio torto (instante no futuro) nao trava a guarda', () => {
    sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    expect(triggerChunkReload()).toBe(true);
  });

  it('instante invalido (1e308) nao trava a guarda', () => {
    sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, '1e308');
    expect(triggerChunkReload()).toBe(true);
  });

  it('cooldown exatamente vencido permite recarregar', () => {
    sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, String(Date.now() - CHUNK_RELOAD_COOLDOWN_MS - 1));
    expect(triggerChunkReload()).toBe(true);
  });

  it('reset limpa contador, instante e a guarda legada', () => {
    sessionStorage.setItem(CHUNK_RELOAD_COUNT_KEY, '2');
    sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, '123');
    sessionStorage.setItem(LEGACY_CHUNK_RELOAD_KEY, '1');
    resetChunkReloadGuard();
    expect(sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY)).toBeNull();
    expect(sessionStorage.getItem(CHUNK_RELOAD_AT_KEY)).toBeNull();
    expect(sessionStorage.getItem(LEGACY_CHUNK_RELOAD_KEY)).toBeNull();
    expect(hasExhaustedChunkReloads()).toBe(false);
  });

  it('sem sessionStorage na leitura nao recarrega automatico e pede acao manual', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage bloqueado');
    });
    expect(triggerChunkReload()).toBe(false);
    expect(hasExhaustedChunkReloads()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('sem sessionStorage na escrita nao recarrega automatico e pede acao manual', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('storage bloqueado');
    });
    expect(triggerChunkReload()).toBe(false);
    expect(hasExhaustedChunkReloads()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
});
