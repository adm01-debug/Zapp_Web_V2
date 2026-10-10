import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import { shouldSkipPrefetch, PAUSA_ENTRE_CHUNKS_MS, type ViewLoaders } from '../hotRoutePrefetch';
import { HotRoutePrefetcher } from '../HotRoutePrefetcher';

/**
 * Os loaders são INJETADOS (props), não mockados por módulo: o ESM cacheia os
 * módulos, então `vi.mock` + espião só dispararia no primeiro caso e os demais
 * passariam sem provar nada. Injeção dá um espião novo por teste.
 */
function loadersEspioes(quantidade = 3): { views: ViewLoaders; espioes: ReturnType<typeof vi.fn>[] } {
  const espioes = Array.from({ length: quantidade }, () => vi.fn(async () => ({})));
  const views: ViewLoaders = {};
  espioes.forEach((e, i) => {
    views[`view${i}`] = e;
  });
  return { views, espioes };
}

/** Idle controlado: acumula callbacks para o teste decidir quando rodam. */
function instalarIdleControlado() {
  const pendentes: Array<() => void> = [];
  Object.defineProperty(window, 'requestIdleCallback', {
    value: (cb: IdleRequestCallback) => {
      pendentes.push(() => cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline));
      return pendentes.length;
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'cancelIdleCallback', { value: vi.fn(), writable: true, configurable: true });
  return { rodar: () => pendentes.forEach((f) => f()) };
}

function definirConexao(conn: Record<string, unknown> | undefined) {
  // `defineProperty(..., { value: undefined })` não apaga o valor anterior; sem o
  // delete, um caso vazaria `saveData: true` para o seguinte.
  if (conn === undefined) {
    delete (navigator as unknown as Record<string, unknown>).connection;
    return;
  }
  Object.defineProperty(navigator, 'connection', { value: conn, writable: true, configurable: true });
}

describe('HotRoutePrefetcher (E35)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete (navigator as unknown as Record<string, unknown>).connection;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('não renderiza nada (componente de efeito puro)', () => {
    instalarIdleControlado();
    definirConexao({ effectiveType: '4g' });
    const { views } = loadersEspioes();
    const { container } = render(<HotRoutePrefetcher views={views} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pré-carrega todos os loaders quando o navegador fica ocioso', async () => {
    const { rodar } = instalarIdleControlado();
    definirConexao({ effectiveType: '4g' });
    const { views, espioes } = loadersEspioes(3);

    render(<HotRoutePrefetcher views={views} />);
    expect(espioes[0]).not.toHaveBeenCalled(); // nada antes do idle

    rodar();
    await vi.advanceTimersByTimeAsync(PAUSA_ENTRE_CHUNKS_MS * 5);

    espioes.forEach((e) => expect(e).toHaveBeenCalledTimes(1));
  });

  it('não pré-carrega nada em conexão 2g nem com saveData', async () => {
    const { rodar } = instalarIdleControlado();
    definirConexao({ effectiveType: '2g' });
    const { views, espioes } = loadersEspioes(2);

    render(<HotRoutePrefetcher views={views} />);
    rodar();
    await vi.advanceTimersByTimeAsync(PAUSA_ENTRE_CHUNKS_MS * 5);

    espioes.forEach((e) => expect(e).not.toHaveBeenCalled());
  });

  it('não pré-carrega nada com economia de dados ativa', async () => {
    const { rodar } = instalarIdleControlado();
    definirConexao({ effectiveType: '4g', saveData: true });
    const { views, espioes } = loadersEspioes(2);

    render(<HotRoutePrefetcher views={views} />);
    rodar();
    await vi.advanceTimersByTimeAsync(PAUSA_ENTRE_CHUNKS_MS * 5);

    espioes.forEach((e) => expect(e).not.toHaveBeenCalled());
  });

  it('sem navigator.connection, assume conexão boa e pré-carrega', async () => {
    const { rodar } = instalarIdleControlado();
    definirConexao(undefined);
    const { views, espioes } = loadersEspioes(2);

    render(<HotRoutePrefetcher views={views} />);
    rodar();
    await vi.advanceTimersByTimeAsync(PAUSA_ENTRE_CHUNKS_MS * 5);

    espioes.forEach((e) => expect(e).toHaveBeenCalledTimes(1));
  });

  it('um loader que falha não impede os demais (otimização não pode quebrar a tela)', async () => {
    const { rodar } = instalarIdleControlado();
    definirConexao({ effectiveType: '4g' });
    const falha = vi.fn(async () => {
      throw new Error('chunk offline');
    });
    const ok = vi.fn(async () => ({}));
    const views: ViewLoaders = { quebra: falha, funciona: ok };

    render(<HotRoutePrefetcher views={views} />);
    rodar();
    await vi.advanceTimersByTimeAsync(PAUSA_ENTRE_CHUNKS_MS * 5);

    expect(falha).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('shouldSkipPrefetch: só pula em conexão ruim ou economia de dados', () => {
    definirConexao(undefined);
    expect(shouldSkipPrefetch()).toBe(false);
    definirConexao({ effectiveType: '4g' });
    expect(shouldSkipPrefetch()).toBe(false);
    definirConexao({ effectiveType: '3g' });
    expect(shouldSkipPrefetch()).toBe(false);
    definirConexao({ effectiveType: '2g' });
    expect(shouldSkipPrefetch()).toBe(true);
    definirConexao({ effectiveType: 'slow-2g' });
    expect(shouldSkipPrefetch()).toBe(true);
    definirConexao({ effectiveType: '4g', saveData: true });
    expect(shouldSkipPrefetch()).toBe(true);
  });
});
