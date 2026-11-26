import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from '@/integrations/supabase/client';
import { parseSegmentTags, useTalkXSegmentTags, SEGMENT_TAGS_LIMIT } from '@/hooks/integrations/useTalkXSegmentTags';

/**
 * X157 — tags mais usadas no público do segmento (RPC `talkx_segment_tags`).
 * O payload fixado aqui é o que a RPC devolveu em produção em 2026-11-27 para o
 * segmento `621521f3-…`: `[{"tag":"TESTE-DESIGN","count":3}, …]`.
 */

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe('parseSegmentTags (X157)', () => {
  it('lê o jsonb real da RPC e ordena por quantidade', () => {
    expect(parseSegmentTags([
      { tag: 'TESTE-DESIGN', count: 3 },
      { tag: 'Lead-quente', count: 1 },
      { tag: 'Orçamento', count: 1 },
      { tag: 'Suporte', count: 1 },
    ])).toEqual([
      { tag: 'TESTE-DESIGN', count: 3 },
      { tag: 'Lead-quente', count: 1 },
      { tag: 'Orçamento', count: 1 },
      { tag: 'Suporte', count: 1 },
    ]);
  });

  it('descarta item sem tag utilizável em vez de renderizar vazio', () => {
    expect(parseSegmentTags([
      { tag: 'válida', count: 2 },
      { tag: '   ', count: 9 },
      { tag: 42, count: 9 },
      { count: 5 },
      null,
      'texto solto',
    ])).toEqual([{ tag: 'válida', count: 2 }]);
  });

  it('soma a mesma tag repetida (servidor não pode duplicar contagem na tela)', () => {
    expect(parseSegmentTags([
      { tag: 'VIP', count: 2 },
      { tag: 'VIP', count: 3 },
    ])).toEqual([{ tag: 'VIP', count: 5 }]);
  });

  it('apara espaço em volta da tag', () => {
    expect(parseSegmentTags([{ tag: '  pago  ', count: 1 }])).toEqual([{ tag: 'pago', count: 1 }]);
  });

  it('contagem inválida vira 0 sem quebrar a lista', () => {
    expect(parseSegmentTags([
      { tag: 'sem-count' },
      { tag: 'negativa', count: -4 },
      { tag: 'texto', count: '3' },
    ])).toEqual([
      { tag: 'texto', count: 3 },
      { tag: 'negativa', count: 0 },
      { tag: 'sem-count', count: 0 },
    ]);
  });

  it('corta em 10 tags (mesmo teto da RPC)', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ tag: `t${i}`, count: 14 - i }));
    const out = parseSegmentTags(many);
    expect(out).toHaveLength(SEGMENT_TAGS_LIMIT);
    expect(out[0]).toEqual({ tag: 't0', count: 14 });
    expect(out[9]).toEqual({ tag: 't9', count: 5 });
  });

  it('resposta fora do contrato vira lista vazia', () => {
    expect(parseSegmentTags(null)).toEqual([]);
    expect(parseSegmentTags({ tag: 'x' })).toEqual([]);
    expect(parseSegmentTags('[]')).toEqual([]);
  });
});

describe('useTalkXSegmentTags (X157)', () => {
  it('consulta a RPC com o segmento e devolve as tags', async () => {
    rpcMock.mockResolvedValue({ data: [{ tag: 'VIP', count: 4 }], error: null });
    const { result } = renderHook(() => useTalkXSegmentTags('seg-1'), { wrapper: wrap });

    await waitFor(() => expect(result.current.tags).toEqual([{ tag: 'VIP', count: 4 }]));
    expect(rpcMock).toHaveBeenCalledWith('talkx_segment_tags', { p_segment: 'seg-1' });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('erro da RPC vira isError sem derrubar a tela', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result } = renderHook(() => useTalkXSegmentTags('seg-2'), { wrapper: wrap });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('talkx_segment_tags');
    expect(result.current.tags).toBeUndefined();
  });

  it('sem segmento não consulta o banco', async () => {
    const { result } = renderHook(() => useTalkXSegmentTags(null), { wrapper: wrap });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.tags).toBeUndefined();
  });

  it('refetch consulta de novo', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useTalkXSegmentTags('seg-3'), { wrapper: wrap });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpcMock).toHaveBeenCalledTimes(1);

    result.current.refetch();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
  });
});