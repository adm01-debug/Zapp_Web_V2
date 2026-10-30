import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useDebouncedValue,
  useMentionableProfileNames,
  useMentionableProfiles,
} from '../useMentionableProfiles';

/**
 * PK-17, item 1: a lista de colegas mencionáveis vinha de um `select(...)`
 * sem ordem e SEM filtro no servidor, com o termo aplicado no cliente — a
 * partir do 21º colega ativo ninguém mais aparecia para ser marcado. Agora o
 * filtro é do servidor (`ilike`), ordenado (`name`, desempate `id`), limitado a
 * 20 por consulta e com debounce.
 *
 * O cliente Supabase é a única dependência externa; a cadeia é um thenable que
 * registra os métodos chamados.
 */

interface Chamada {
  metodo: string;
  args: unknown[];
}

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
}));

function criarChain(resultado: { data: unknown; error: unknown }) {
  const chamadas: Chamada[] = [];
  const chain: Record<string, unknown> = {};
  for (const metodo of ['select', 'eq', 'ilike', 'order', 'limit', 'range', 'not']) {
    chain[metodo] = (...args: unknown[]) => {
      chamadas.push({ metodo, args });
      return chain;
    };
  }
  chain.then = (onFulfilled: unknown, onRejected: unknown) =>
    Promise.resolve(resultado).then(
      onFulfilled as (v: unknown) => unknown,
      onRejected as (e: unknown) => unknown,
    );
  return { chain, chamadas };
}

function argsDe(chamadas: Chamada[], metodo: string): unknown[][] {
  return chamadas.filter((c) => c.metodo === metodo).map((c) => c.args);
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PERFIS = [
  { id: 'p-2', name: 'Bruno', avatar_url: null },
  { id: 'p-1', name: 'Ana Maria', avatar_url: 'a.png' },
];

describe('useMentionableProfiles — busca no servidor', () => {
  let chain: { chain: Record<string, unknown>; chamadas: Chamada[] };
  let resultado: { data: unknown; error: unknown };

  beforeEach(() => {
    vi.clearAllMocks();
    resultado = { data: PERFIS, error: null };
    chain = criarChain(resultado);
    mocks.from.mockReturnValue(chain.chain);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sem termo: só ativos, ordenado por nome (desempate id) e limitado a 20', async () => {
    const { result } = renderHook(() => useMentionableProfiles(''), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(PERFIS));

    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(argsDe(chain.chamadas, 'select')).toEqual([['id, name, avatar_url']]);
    expect(argsDe(chain.chamadas, 'eq')).toEqual([['is_active', true]]);
    expect(argsDe(chain.chamadas, 'ilike')).toEqual([]);
    expect(argsDe(chain.chamadas, 'order')).toEqual([
      ['name', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(argsDe(chain.chamadas, 'limit')).toEqual([[20]]);
  });

  it('idealiza o termo no servidor: ilike no nome com curinga só nas pontas', async () => {
    const { result } = renderHook(() => useMentionableProfiles('silva'), { wrapper });

    // 250ms de debounce antes de virar consulta.
    await waitFor(() => expect(result.current.data).toEqual(PERFIS), { timeout: 2000 });

    expect(argsDe(chain.chamadas, 'ilike')).toEqual([['name', '%silva%']]);
  });

  it('curingas digitados pelo usuário não viram busca ampla (escapados)', async () => {
    renderHook(() => useMentionableProfiles('50%_'), { wrapper });

    await waitFor(() => expect(argsDe(chain.chamadas, 'ilike')).toHaveLength(1));

    expect(argsDe(chain.chamadas, 'ilike')).toEqual([['name', '%50\\%\\_%']]);
  });

  it('linhas sem nome não entram na lista', async () => {
    resultado.data = [...PERFIS, { id: 'p-3', name: '   ', avatar_url: null }];
    const { result } = renderHook(() => useMentionableProfiles(''), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(PERFIS));
  });
});

describe('useMentionableProfileNames — nomes para o selo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lê todos os ativos (paginado por id) e devolve só os nomes', async () => {
    const { chain, chamadas } = criarChain({
      data: [{ name: 'Ana Maria' }, { name: 'Bruno' }],
      error: null,
    });
    mocks.from.mockReturnValue(chain);

    const { result } = renderHook(() => useMentionableProfileNames(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(['Ana Maria', 'Bruno']));

    expect(argsDe(chamadas, 'select')).toEqual([['id, name']]);
    expect(argsDe(chamadas, 'eq')).toEqual([['is_active', true]]);
    expect(argsDe(chamadas, 'order')).toEqual([['id', { ascending: true }]]);
    expect(argsDe(chamadas, 'range')).toEqual([[0, 999]]);
  });
});

describe('useDebouncedValue — uma consulta por pausa', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('só propaga o valor depois do atraso', async () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), {
      initialProps: { v: 'a' },
    });

    expect(result.current).toBe('a');

    rerender({ v: 'ab' });
    expect(result.current).toBe('a');

    await waitFor(() => expect(result.current).toBe('ab'), { timeout: 2000 });
  });
});
