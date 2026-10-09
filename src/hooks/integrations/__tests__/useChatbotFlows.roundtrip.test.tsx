import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// R2-MOD-068 / item 104 (P1): o roundtrip do Chatbot gravava o JSONB via
// JSON.stringify — o PostgREST então persistia uma STRING dentro da coluna
// jsonb e, ao reabrir, `Array.isArray(flow.nodes)` era false → grafo vazio.
// Este teste fixa o contrato: grava-se array/objeto (não string) e, na
// leitura, um campo que ainda volte como string JSON é normalizado.
const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useChatbotFlows } from '@/hooks/integrations/useChatbotFlows';

const NODE = {
  id: 'node-1',
  type: 'message' as const,
  data: { label: 'Olá', content: 'Bem-vindo' },
  position: { x: 250, y: 120 },
};
const EDGE = { id: 'edge-1', source: 'start-1', target: 'node-1' };

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('useChatbotFlows — roundtrip JSONB (R2-MOD-068)', () => {
  let insertPayload: Record<string, unknown> | undefined;
  let updatePayload: Record<string, unknown> | undefined;
  let orderResult: { data: unknown; error: unknown };

  beforeEach(() => {
    vi.clearAllMocks();
    insertPayload = undefined;
    updatePayload = undefined;
    orderResult = { data: [], error: null };

    fromMock.mockImplementation(() => ({
      select: vi.fn(() => ({ order: vi.fn(async () => orderResult) })),
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertPayload = payload;
        return {
          select: () => ({ single: async () => ({ data: { id: 'f3', ...payload }, error: null }) }),
        };
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        updatePayload = payload;
        return {
          eq: () => ({
            select: () => ({ single: async () => ({ data: { id: 'f1', ...payload }, error: null }) }),
          }),
        };
      }),
      delete: vi.fn(() => ({ eq: async () => ({ error: null }) })),
    }));
  });

  it('createFlow grava nodes/edges/variables como JSONB (array/objeto), nunca como string', async () => {
    const { result } = renderHook(() => useChatbotFlows(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.createFlow.mutate({ name: 'Fluxo', nodes: [NODE], edges: [EDGE], variables: { a: 1 } });
    });
    await waitFor(() => expect(insertPayload).toBeDefined());

    expect(typeof insertPayload!.nodes).toBe('object');
    expect(Array.isArray(insertPayload!.nodes)).toBe(true);
    expect(insertPayload!.nodes).toEqual([NODE]);
    expect(insertPayload!.edges).toEqual([EDGE]);
    expect(insertPayload!.variables).toEqual({ a: 1 });
  });

  it('updateFlow envia nodes/edges como JSONB (array), nunca como string', async () => {
    const { result } = renderHook(() => useChatbotFlows(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.updateFlow.mutate({ id: 'f1', nodes: [NODE], edges: [EDGE] });
    });
    await waitFor(() => expect(updatePayload).toBeDefined());

    expect(Array.isArray(updatePayload!.nodes)).toBe(true);
    expect(updatePayload!.nodes).toEqual([NODE]);
    expect(updatePayload!.edges).toEqual([EDGE]);
  });

  it('reabre o grafo normalizando campos que voltaram como string JSON', async () => {
    // Regressão do defeito: linhas já gravadas pelo bug têm jsonb STRING.
    orderResult = {
      data: [
        {
          id: 'f1',
          name: 'Legado',
          is_active: true,
          trigger_type: 'keyword',
          nodes: JSON.stringify([NODE]),
          edges: JSON.stringify([EDGE]),
          variables: JSON.stringify({ a: 1 }),
        },
      ],
      error: null,
    };

    const { result } = renderHook(() => useChatbotFlows(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.flows.length).toBe(1));

    const flow = result.current.flows[0];
    expect(Array.isArray(flow.nodes)).toBe(true);
    expect(flow.nodes).toEqual([NODE]);
    expect(flow.edges).toEqual([EDGE]);
    expect(flow.variables).toEqual({ a: 1 });
  });

  it('roundtrip: o que é gravado reabre com o grafo intacto', async () => {
    // 1) grava
    const write = renderHook(() => useChatbotFlows(), { wrapper: createWrapper() });
    await act(async () => {
      write.result.current.createFlow.mutate({ name: 'Fluxo', nodes: [NODE], edges: [EDGE] });
    });
    await waitFor(() => expect(insertPayload).toBeDefined());

    // 2) o jsonb devolve exatamente o que foi gravado
    orderResult = {
      data: [
        {
          id: 'f9',
          name: 'Fluxo',
          is_active: true,
          trigger_type: 'keyword',
          nodes: insertPayload!.nodes,
          edges: insertPayload!.edges,
          variables: insertPayload!.variables,
        },
      ],
      error: null,
    };

    // 3) reabre
    const read = renderHook(() => useChatbotFlows(), { wrapper: createWrapper() });
    await waitFor(() => expect(read.result.current.flows.length).toBe(1));
    const flow = read.result.current.flows[0];

    expect(Array.isArray(flow.nodes)).toBe(true);
    expect(flow.nodes).toEqual([NODE]);
    expect(flow.edges).toEqual([EDGE]);
  });
});
