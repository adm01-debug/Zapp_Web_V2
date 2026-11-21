import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTalkXSegmentProgress } from '../useTalkXSegmentProgress';

// Referência mutável compartilhada entre mock e testes (padrão vi.hoisted do repo).
const rowsRef = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({ then: () => undefined }),
  supabase: {
    rpc: (name: string) =>
      Promise.resolve({
        data: name === 'talkx_campaign_segment_progress' ? rowsRef.value : [],
        error: null,
      }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, {
    client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  }, children);
}

describe('useTalkXSegmentProgress', () => {
  beforeEach(() => {
    rowsRef.value = [
      { segment_id: 's1', position: 1, total: 10, sent: 10, delivered: 10, failed: 0, remaining: 0, percent: 100, status: 'done', total_segments: 2, pending_segments: 0 },
      { segment_id: 's2', position: 2, total: 10, sent: 4, delivered: 4, failed: 0, remaining: 6, percent: 40, status: 'running', total_segments: 2, pending_segments: 1 },
    ];
  });

  it('converte linhas da RPC X142 em itens do card, ordenados por posição', async () => {
    const { result } = renderHook(() => useTalkXSegmentProgress('camp-1'), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());
    expect(result.current.rows?.length).toBe(2);
    expect(result.current.rows?.[0]).toMatchObject({ segmentId: 's1', position: 1, percent: 100, done: true });
    expect(result.current.rows?.[1]).toMatchObject({ segmentId: 's2', position: 2, percent: 40, done: false });
  });

  it('retorna lista vazia quando a RPC devolve shape inesperado (defensivo)', async () => {
    rowsRef.value = { kpis: { x: 1 } } as unknown as unknown[];
    const { result } = renderHook(() => useTalkXSegmentProgress('camp-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(result.current.rows).toEqual([]);
  });

  it('não consulta sem campaignId', async () => {
    const { result } = renderHook(() => useTalkXSegmentProgress(null), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.data).toBeUndefined();
    expect(result.current.rows).toBeUndefined();
  });
});
