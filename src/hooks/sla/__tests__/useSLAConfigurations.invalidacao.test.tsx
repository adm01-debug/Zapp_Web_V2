/**
 * `useSLAConfigurations` — o que a gravação tem de acertar com o RESTO do sistema.
 *
 * O sujeito é o hook REAL; a dublagem é a fronteira de rede (`supabase.from`), que
 * registra operação/payload/filtros e responde o que o teste manda. Fica provado que:
 * gravar/alternar/excluir invalida `applicable-sla` e `sla-configurations-default`
 * (sem isso o cartão e o badge seguem mostrando o prazo antigo) e que só existe UM
 * padrão no sistema — a gravação de `is_default` desmarca as outras linhas, antes do
 * insert (não há id para excluir) e depois do update com `neq` no próprio id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; op: string; payload?: unknown; filters: unknown[][] }>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const entry: { table: string; op: string; payload?: unknown; filters: unknown[][] } = {
        table,
        op: 'select',
        filters: [],
      };
      h.ops.push(entry);

      const builder: Record<string, unknown> = {};
      const mesmo = () => builder;
      builder.select = (...a: unknown[]) => {
        entry.filters.push(['select', ...a]);
        return mesmo();
      };
      builder.order = (...a: unknown[]) => {
        entry.filters.push(['order', ...a]);
        return mesmo();
      };
      builder.eq = (...a: unknown[]) => {
        entry.filters.push(['eq', ...a]);
        return mesmo();
      };
      builder.neq = (...a: unknown[]) => {
        entry.filters.push(['neq', ...a]);
        return mesmo();
      };
      builder.insert = (payload: unknown) => {
        entry.op = 'insert';
        entry.payload = payload;
        return mesmo();
      };
      builder.update = (payload: unknown) => {
        entry.op = 'update';
        entry.payload = payload;
        return mesmo();
      };
      builder.delete = () => {
        entry.op = 'delete';
        return mesmo();
      };
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
        Promise.resolve(
          entry.op === 'select' ? (h.tables[table] ?? { data: [], error: null }) : { data: null, error: null },
        ).then(ok, falhou);
      return builder;
    },
  },
}));

import { useSLAConfigurations, type SLAConfig } from '../useSLAConfigurations';

function cfg(id: string, extra: Partial<SLAConfig> = {}): SLAConfig {
  return {
    id,
    name: `SLA ${id}`,
    first_response_minutes: 15,
    resolution_minutes: 120,
    priority: 'medium',
    is_default: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

const opsDe = (op: string) => h.ops.filter((o) => o.op === op);

const valores = (extra: Record<string, unknown> = {}) => ({
  name: 'SLA Ouro',
  first_response_minutes: 5,
  resolution_minutes: 60,
  priority: 'high',
  is_default: false,
  ...extra,
});

function setup(lista: SLAConfig[] = []) {
  h.tables.sla_configurations = { data: lista, error: null };
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const rendered = renderHook(() => useSLAConfigurations(), { wrapper });
  return { ...rendered, queryClient, invalidateSpy };
}

beforeEach(() => {
  h.ops = [];
  h.tables = {};
  vi.clearAllMocks();
});

describe('useSLAConfigurations — invalidação do prazo aplicável', () => {
  it('salvar invalida a lista, o prazo aplicável e o padrão em cache', async () => {
    const { result, invalidateSpy } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.saveMutation.mutateAsync(valores());
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sla-configurations'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['applicable-sla'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sla-configurations-default'] });
  });

  it('alternar ativa invalida o prazo aplicável quando a escrita assenta', async () => {
    const { result, invalidateSpy } = setup([cfg('s1')]);
    await waitFor(() => expect(result.current.configs).toHaveLength(1));

    await act(async () => {
      await result.current.toggleMutation.mutateAsync({ id: 's1', is_active: false });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['applicable-sla'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sla-configurations-default'] });
  });

  it('excluir invalida o prazo aplicável quando a escrita confirma', async () => {
    const { result, invalidateSpy } = setup([cfg('s1')]);
    await waitFor(() => expect(result.current.configs).toHaveLength(1));

    await act(async () => {
      await result.current.deleteMutation.mutateAsync('s1');
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['applicable-sla'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sla-configurations-default'] });
  });
});

describe('useSLAConfigurations — um único padrão no sistema', () => {
  it('insert como padrão desmarca os padrões existentes ANTES de gravar (sem id para excluir)', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    h.ops = [];

    await act(async () => {
      await result.current.saveMutation.mutateAsync(valores({ is_default: true }));
    });

    const atualizacoes = opsDe('update');
    expect(atualizacoes).toHaveLength(1);
    expect(atualizacoes[0].payload).toEqual({ is_default: false });
    expect(atualizacoes[0].filters).toContainEqual(['eq', 'is_default', true]);
    expect(atualizacoes[0].filters.some((f) => f[0] === 'neq')).toBe(false);

    expect(opsDe('insert')).toHaveLength(1);
    expect(opsDe('insert')[0].payload).toEqual(valores({ is_default: true }));
  });

  it('insert sem padrão não mexe nas outras linhas', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    h.ops = [];

    await act(async () => {
      await result.current.saveMutation.mutateAsync(valores({ is_default: false }));
    });

    expect(opsDe('update')).toHaveLength(0);
    expect(opsDe('insert')).toHaveLength(1);
  });

  it('update como padrão grava a linha e desmarca as OUTRAS (neq no próprio id)', async () => {
    const { result } = setup([cfg('s1')]);
    await waitFor(() => expect(result.current.configs).toHaveLength(1));
    h.ops = [];

    await act(async () => {
      await result.current.saveMutation.mutateAsync(valores({ is_default: true, id: 's1' }));
    });

    const atualizacoes = opsDe('update');
    expect(atualizacoes).toHaveLength(2);
    expect(atualizacoes[0].filters).toContainEqual(['eq', 'id', 's1']);
    expect(atualizacoes[1].payload).toEqual({ is_default: false });
    expect(atualizacoes[1].filters).toContainEqual(['eq', 'is_default', true]);
    expect(atualizacoes[1].filters).toContainEqual(['neq', 'id', 's1']);
    expect(opsDe('insert')).toHaveLength(0);
  });
});
