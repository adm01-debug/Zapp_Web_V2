import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), in: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => h.from(...args) },
}));

import {
  fetchSenderProfiles,
  mediaSenderProfilesKey,
  normalizeSenderIds,
  useMediaSenderProfiles,
} from '@/hooks/chat/useMediaSenderProfiles';

function makeClient() {
  // gcTime infinito: o cache de perfis tem de sobreviver entre consumidores no teste.
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const perfil = (id: string) => ({
  id,
  name: `Atendente ${id}`,
  nickname: null,
  avatar_url: `https://cdn.test/${id}.png`,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.in.mockResolvedValue({ data: [], error: null });
  h.select.mockReturnValue({ in: h.in });
  h.from.mockImplementation(() => ({ select: h.select }));
});

describe('normalizeSenderIds / mediaSenderProfilesKey', () => {
  it('tira nulos, vazios e repeticoes e ordena de forma estavel', () => {
    expect(normalizeSenderIds(['p2', null, 'p1', undefined, 'p2', '   ', 'p3'])).toEqual(['p1', 'p2', 'p3']);
    expect(normalizeSenderIds([])).toEqual([]);
    expect(normalizeSenderIds(null)).toEqual([]);
  });

  it('a chave nao muda com a ordem nem com repeticao (mesmo cache para a mesma tela)', () => {
    expect(mediaSenderProfilesKey(['b', 'a', 'a'])).toEqual(mediaSenderProfilesKey(['a', 'b']));
  });
});

describe('useMediaSenderProfiles — lote e cache (D04)', () => {
  it('resolve N cartoes em UMA consulta em lote, pedindo os ids unicos', async () => {
    h.in.mockResolvedValue({
      data: [perfil('p1'), perfil('p2'), perfil('p3')],
      error: null,
    });

    const qc = makeClient();
    const { result } = renderHook(
      () => useMediaSenderProfiles(['p2', 'p1', null, 'p2', 'p3']),
      { wrapper: wrapperFor(qc) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(h.from).toHaveBeenCalledTimes(1);
    expect(h.from).toHaveBeenCalledWith('profiles');
    expect(h.select).toHaveBeenCalledWith('id, name, nickname, avatar_url');
    expect(h.in).toHaveBeenCalledTimes(1);
    expect(h.in).toHaveBeenCalledWith('id', ['p1', 'p2', 'p3']);
    expect(Object.keys(result.current.profiles).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(result.current.profiles.p2?.avatar_url).toBe('https://cdn.test/p2.png');
  });

  it('dois consumidores com os mesmos ids compartilham o cache: uma consulta so', async () => {
    h.in.mockResolvedValue({ data: [perfil('p1')], error: null });
    const qc = makeClient();

    const a = renderHook(() => useMediaSenderProfiles(['p1']), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(a.result.current.isLoading).toBe(false));

    const b = renderHook(() => useMediaSenderProfiles(['p1']), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(b.result.current.profiles.p1).toBeDefined());

    expect(h.from).toHaveBeenCalledTimes(1);
  });

  it('a lista que cresce pede SO os ids que faltam (o cache anterior e reaproveitado)', async () => {
    h.in
      .mockResolvedValueOnce({ data: [perfil('p1')], error: null })
      .mockResolvedValueOnce({ data: [perfil('p2')], error: null });
    const qc = makeClient();

    const primeiro = renderHook(() => useMediaSenderProfiles(['p1']), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(primeiro.result.current.profiles.p1).toBeDefined());

    const segundo = renderHook(() => useMediaSenderProfiles(['p1', 'p2']), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(segundo.result.current.profiles.p2).toBeDefined());

    expect(h.from).toHaveBeenCalledTimes(2);
    expect(h.in).toHaveBeenNthCalledWith(1, 'id', ['p1']);
    expect(h.in).toHaveBeenNthCalledWith(2, 'id', ['p2']);
    // O mapa devolvido soma o que ja estava em cache com o que chegou agora.
    expect(Object.keys(segundo.result.current.profiles).sort()).toEqual(['p1', 'p2']);
  });

  it('erro/RLS negado devolve mapa vazio e NAO lanca (a UI cai nas iniciais)', async () => {
    h.in.mockResolvedValue({ data: null, error: { message: 'permission denied for table profiles' } });
    const qc = makeClient();

    const { result } = renderHook(() => useMediaSenderProfiles(['p1']), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.profiles).toEqual({});
  });

  it('sem ids nao consulta o banco', async () => {
    const qc = makeClient();
    const { result } = renderHook(() => useMediaSenderProfiles([]), { wrapper: wrapperFor(qc) });

    expect(result.current.profiles).toEqual({});
    expect(result.current.isLoading).toBe(false);
    expect(h.from).not.toHaveBeenCalled();
  });

  it('marca carregando enquanto a consulta esta em voo', async () => {
    let liberar: ((value: unknown) => void) | undefined;
    h.in.mockImplementation(() => new Promise((resolve) => { liberar = resolve; }));
    const qc = makeClient();

    const { result } = renderHook(() => useMediaSenderProfiles(['p1']), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    await act(async () => {
      liberar?.({ data: [perfil('p1')], error: null });
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.profiles.p1).toBeDefined();
  });
});

describe('fetchSenderProfiles (funcao do queryFn)', () => {
  it('sem ids devolve mapa vazio sem tocar no banco', async () => {
    const qc = makeClient();
    await expect(fetchSenderProfiles(qc, [])).resolves.toEqual({});
    expect(h.from).not.toHaveBeenCalled();
  });
});
