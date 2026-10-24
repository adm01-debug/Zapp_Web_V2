import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSLARules } from '@/hooks/sla/useSLARules';

// Estado "vivo" lido pelo mock na hora em que a query/mutation é aguardada.
const h = vi.hoisted(() => ({
  rules: [] as Array<Record<string, unknown>>,
  insertResult: { error: null as { message: string } | null },
  writeResult: { error: null as { message: string } | null },
  inserted: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
  deleted: 0,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => {
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = vi.fn(() => { op = 'select'; return builder; });
      builder.order = vi.fn(chain);
      builder.eq = vi.fn(chain);
      builder.not = vi.fn(chain);
      builder.is = vi.fn(chain);
      builder.insert = vi.fn((payload: Record<string, unknown>) => {
        op = 'insert';
        h.inserted.push(payload);
        return builder;
      });
      builder.update = vi.fn((payload: Record<string, unknown>) => {
        op = 'update';
        h.updated.push(payload);
        return builder;
      });
      builder.delete = vi.fn(() => {
        op = 'delete';
        h.deleted += 1;
        return builder;
      });
      builder.then = (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) => {
        const result =
          op === 'select'
            ? { data: h.rules, error: null }
            : op === 'insert'
              ? h.insertResult
              : h.writeResult;
        return Promise.resolve(result).then(onFulfilled, onRejected);
      };
      return builder;
    }),
  },
}));

const APPLICABLE_KEY = ['applicable-sla', { contactId: 'c1' }] as const;

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  // Semeia o cache de `applicable-sla` para provar que a mutation o invalida de fato.
  queryClient.setQueryData(APPLICABLE_KEY, {
    firstResponseMinutes: 30,
    resolutionMinutes: 120,
    ruleName: 'Antiga',
    ruleId: 'old',
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const rendered = renderHook(() => useSLARules(), { wrapper });
  return { ...rendered, queryClient, invalidateSpy };
}

async function expectApplicableSLACacheBusted(
  invalidateSpy: ReturnType<typeof vi.spyOn>,
  queryClient: QueryClient
) {
  await waitFor(() =>
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['applicable-sla'] })
  );
  expect(queryClient.getQueryState(APPLICABLE_KEY)?.isInvalidated).toBe(true);
}

describe('useSLARules — mutations invalidam o cache de applicable-sla (R2-SLA-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rules = [];
    h.insertResult = { error: null };
    h.writeResult = { error: null };
    h.inserted = [];
    h.updated = [];
    h.deleted = 0;
  });

  it('create bem-sucedido invalida applicable-sla além de sla-rules', async () => {
    const { result, queryClient, invalidateSpy } = setup();

    await act(async () => {
      result.current.createRule({
        name: 'Nova 2 min',
        first_response_minutes: 2,
        resolution_minutes: 10,
        priority: 5,
      });
    });

    await expectApplicableSLACacheBusted(invalidateSpy, queryClient);
    expect(h.inserted).toHaveLength(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sla-rules'] });
  });

  it('update bem-sucedido invalida applicable-sla', async () => {
    const { result, queryClient, invalidateSpy } = setup();

    await act(async () => {
      result.current.updateRule({
        id: 'r1',
        name: 'Editada 2 min',
        first_response_minutes: 2,
        resolution_minutes: 10,
        priority: 5,
      });
    });

    await expectApplicableSLACacheBusted(invalidateSpy, queryClient);
    expect(h.updated).toHaveLength(1);
  });

  it('delete bem-sucedido invalida applicable-sla', async () => {
    const { result, queryClient, invalidateSpy } = setup();

    await act(async () => {
      result.current.deleteRule('r1');
    });

    await expectApplicableSLACacheBusted(invalidateSpy, queryClient);
    expect(h.deleted).toBe(1);
  });

  it('toggle bem-sucedido invalida applicable-sla', async () => {
    const { result, queryClient, invalidateSpy } = setup();

    await act(async () => {
      result.current.toggleRule({ id: 'r1', is_active: false });
    });

    await expectApplicableSLACacheBusted(invalidateSpy, queryClient);
    expect(h.updated).toHaveLength(1);
  });

  it('erro na escrita NÃO invalida applicable-sla', async () => {
    h.insertResult = { error: { message: 'rls' } };
    const { result, invalidateSpy } = setup();

    await act(async () => {
      result.current.createRule({
        name: 'Falha',
        first_response_minutes: 2,
        resolution_minutes: 10,
        priority: 5,
      });
    });

    await waitFor(() => expect(result.current.isCreating).toBe(false));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['applicable-sla'] });
  });
});
