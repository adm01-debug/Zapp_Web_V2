/**
 * Configurações de SLA — `useSLAConfigurations`.
 *
 * O sujeito é o hook REAL; a dublagem é a fronteira de rede (`supabase.from`),
 * que grava operação/payload/filtros e responde o que o teste manda. O portão
 * (`abrirPortao`) segura a resposta de uma escrita para observar o estado
 * OTIMISTA — o que a tela mostra antes de o servidor responder — e depois solta
 * sucesso ou recusa de RLS.
 *
 * Regras provadas: ordenação por prioridade, erro de leitura que não trava a
 * tela, insert x update na gravação, fechamento/limpeza do formulário só no
 * sucesso, invalidação do cache, e o vai-e-volta otimista de alternar/excluir
 * (com devolução da linha quando o banco recusa).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; op: string; payload?: unknown; filters: unknown[][] }>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  writes: {} as Record<string, { error: unknown }>,
  gate: null as null | { promise: Promise<unknown> },
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
      builder.select = () => mesmo();
      builder.order = (...a: unknown[]) => {
        entry.filters.push(['order', ...a]);
        return mesmo();
      };
      builder.eq = (...a: unknown[]) => {
        entry.filters.push(['eq', ...a]);
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
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
        const portao = h.gate;
        const base =
          entry.op === 'select'
            ? (h.tables[table] ?? { data: [], error: null })
            : { data: null, error: (h.writes[entry.op] ?? { error: null }).error };
        const promessa = entry.op !== 'select' && portao ? portao.promise : Promise.resolve(base);
        return promessa.then(ok, falhou);
      };
      return builder;
    },
  },
}));

import { useSLAConfigurations, type SLAConfig } from '../useSLAConfigurations';
import { toast } from 'sonner';

const toastMock = toast as unknown as { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

const DEFAULT_FORM = {
  name: '',
  first_response_minutes: 15,
  resolution_minutes: 120,
  priority: 'medium',
  is_default: false,
};

function cfg(id: string, extra: Record<string, unknown> = {}) {
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

const selectsDe = (table: string) => h.ops.filter((o) => o.table === table && o.op === 'select');
const opsDe = (op: string) => h.ops.filter((o) => o.op === op);

/** Segura a resposta da PRÓXIMA escrita até o teste soltar (sucesso ou recusa). */
function abrirPortao() {
  let soltar!: (v: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    soltar = r;
  });
  h.gate = { promise };
  return (error: unknown = null) => {
    h.gate = null;
    soltar({ data: null, error });
  };
}

function setup() {
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

// O `as` é de propósito: se o cache estiver VAZIO, o teste tem de acusar (e não
// receber uma lista inventada), então nada de `?? []` aqui.
const cache = (queryClient: QueryClient) =>
  queryClient.getQueryData<SLAConfig[]>(['sla-configurations']) as SLAConfig[];

beforeEach(() => {
  h.ops = [];
  h.tables = {};
  h.writes = {};
  h.gate = null;
  vi.clearAllMocks();
});

describe('useSLAConfigurations — leitura', () => {
  it('carrega as configurações ordenando por prioridade crescente', async () => {
    h.tables.sla_configurations = {
      data: [cfg('s1', { priority: 'critical' }), cfg('s2', { priority: 'low' })],
      error: null,
    };
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.configs).toHaveLength(2);
    expect(selectsDe('sla_configurations')[0].filters).toContainEqual([
      'order',
      'priority',
      { ascending: true },
    ]);
  });

  it('leitura que volta nula sem erro deixa a lista vazia', async () => {
    h.tables.sla_configurations = { data: null, error: null };
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.configs).toEqual([]);
  });

  it('erro de RLS na leitura deixa a lista vazia sem travar a tela', async () => {
    h.tables.sla_configurations = {
      data: null,
      error: { message: 'permission denied for table sla_configurations', code: '42501' },
    };
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.configs).toEqual([]);
    expect(
      queryClient.getQueryCache().getAll().find((q) => q.queryKey[0] === 'sla-configurations')?.state.status,
    ).toBe('error');
  });
});

describe('useSLAConfigurations — gravação', () => {
  it('salvar sem id insere, e no sucesso fecha o diálogo, limpa o formulário e revalida o cache', async () => {
    h.tables.sla_configurations = { data: [], error: null };
    const { result, queryClient, invalidateSpy } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const valores = {
      name: 'SLA Ouro',
      first_response_minutes: 5,
      resolution_minutes: 60,
      priority: 'high',
      is_default: true,
    };
    act(() => {
      result.current.setShowDialog(true);
      result.current.setForm(valores);
    });
    await act(async () => {
      await result.current.saveMutation.mutateAsync(valores);
    });

    expect(opsDe('insert')[0].table).toBe('sla_configurations');
    expect(opsDe('insert')[0].payload).toEqual(valores);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sla-configurations'] });
    expect(result.current.showDialog).toBe(false);
    expect(result.current.editingId).toBeNull();
    expect(result.current.form).toEqual(DEFAULT_FORM);
    expect(toastMock.success).toHaveBeenCalledWith('SLA criado');

    await waitFor(() => expect(selectsDe('sla_configurations').length).toBeGreaterThanOrEqual(2));
  });

  it('salvar a partir da edição atualiza a linha certa e avisa "SLA atualizado"', async () => {
    const original = cfg('s1', { name: 'Antigo', priority: 'medium' });
    h.tables.sla_configurations = { data: [original], error: null };
    const { result } = setup();
    await waitFor(() => expect(result.current.configs).toHaveLength(1));

    act(() => result.current.openEdit(original));
    expect(result.current.editingId).toBe('s1');

    await act(async () => {
      await result.current.saveMutation.mutateAsync({
        name: 'Novo',
        first_response_minutes: 3,
        resolution_minutes: 30,
        priority: 'critical',
        is_default: true,
        id: 's1',
      });
    });

    expect(opsDe('update')[0].payload).toEqual({
      name: 'Novo',
      first_response_minutes: 3,
      resolution_minutes: 30,
      priority: 'critical',
      is_default: true,
    });
    expect(opsDe('update')[0].filters).toContainEqual(['eq', 'id', 's1']);
    expect(opsDe('insert')).toHaveLength(0);
    expect(toastMock.success).toHaveBeenCalledWith('SLA atualizado');
    expect(result.current.showDialog).toBe(false);
  });

  it('RLS no insert: mostra o motivo, mantém o diálogo e o formulário, sem revalidar', async () => {
    h.tables.sla_configurations = { data: [], error: null };
    h.writes.insert = {
      error: { message: 'permission denied for table sla_configurations', code: '42501' },
    };
    const { result, invalidateSpy } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const valores = {
      name: 'SLA Ouro',
      first_response_minutes: 5,
      resolution_minutes: 60,
      priority: 'high',
      is_default: false,
    };
    act(() => {
      result.current.setShowDialog(true);
      result.current.setForm(valores);
    });
    await act(async () => {
      await result.current.saveMutation.mutateAsync(valores).catch(() => undefined);
    });

    expect(toastMock.error).toHaveBeenCalledWith('permission denied for table sla_configurations');
    expect(result.current.showDialog).toBe(true);
    expect(result.current.form).toEqual(valores);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useSLAConfigurations — alternar ativa (otimista com devolução)', () => {
  it('muda a tela antes do servidor responder e revalida quando ele confirma', async () => {
    h.tables.sla_configurations = { data: [cfg('s1')], error: null };
    const { result, queryClient, invalidateSpy } = setup();
    await waitFor(() => expect(result.current.configs).toHaveLength(1));

    const soltar = abrirPortao();
    let pendente!: Promise<unknown>;
    await act(async () => {
      pendente = result.current.toggleMutation.mutateAsync({ id: 's1', is_active: false }).catch(() => undefined);
      await Promise.resolve();
    });

    await waitFor(() => expect(cache(queryClient)[0].is_active).toBe(false));
    expect(opsDe('update')[0].payload).toEqual({ is_active: false });
    expect(opsDe('update')[0].filters).toContainEqual(['eq', 'id', 's1']);

    h.tables.sla_configurations = { data: [cfg('s1', { is_active: false })], error: null };
    await act(async () => {
      soltar(null);
      await pendente;
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sla-configurations'] }));
    await waitFor(() => expect(cache(queryClient)[0].is_active).toBe(false));
    expect(selectsDe('sla_configurations').length).toBeGreaterThanOrEqual(2);
  });

  it('recusa do RLS devolve o valor anterior na tela (mesmo com a releitura também falhando)', async () => {
    h.tables.sla_configurations = { data: [cfg('s1')], error: null };
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.configs).toHaveLength(1));

    const soltar = abrirPortao();
    let pendente!: Promise<unknown>;
    await act(async () => {
      pendente = result.current.toggleMutation.mutateAsync({ id: 's1', is_active: false }).catch(() => undefined);
      await Promise.resolve();
    });
    await waitFor(() => expect(cache(queryClient)[0].is_active).toBe(false));

    // A releitura da lista TAMBÉM cai: sobra na tela só o que o rollback escreveu.
    h.tables.sla_configurations = {
      data: null,
      error: { message: 'permission denied', code: '42501' },
    };
    await act(async () => {
      soltar({ message: 'permission denied', code: '42501' });
      await pendente;
    });

    await waitFor(() =>
      expect(
        queryClient.getQueryCache().getAll().find((q) => q.queryKey[0] === 'sla-configurations')?.state.status,
      ).toBe('error'),
    );
    expect(cache(queryClient)[0].is_active).toBe(true);
  });
});

describe('useSLAConfigurations — excluir (otimista com devolução)', () => {
  it('tira a linha da tela antes do servidor responder e, no sucesso, revalida e avisa', async () => {
    h.tables.sla_configurations = { data: [cfg('s1'), cfg('s2')], error: null };
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.configs).toHaveLength(2));

    const soltar = abrirPortao();
    let pendente!: Promise<unknown>;
    await act(async () => {
      pendente = result.current.deleteMutation.mutateAsync('s1').catch(() => undefined);
      await Promise.resolve();
    });

    await waitFor(() => expect(cache(queryClient).map((c) => c.id)).toEqual(['s2']));
    expect(opsDe('delete')[0].table).toBe('sla_configurations');
    expect(opsDe('delete')[0].filters).toContainEqual(['eq', 'id', 's1']);

    h.tables.sla_configurations = { data: [cfg('s2')], error: null };
    await act(async () => {
      soltar(null);
      await pendente;
    });

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('SLA removido'));
    await waitFor(() => expect(cache(queryClient).map((c) => c.id)).toEqual(['s2']));
    expect(selectsDe('sla_configurations').length).toBeGreaterThanOrEqual(2);
  });

  it('exclusão negada pelo RLS devolve a linha à lista e avisa o motivo', async () => {
    h.tables.sla_configurations = { data: [cfg('s1'), cfg('s2')], error: null };
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.configs).toHaveLength(2));

    const soltar = abrirPortao();
    let pendente!: Promise<unknown>;
    await act(async () => {
      pendente = result.current.deleteMutation.mutateAsync('s1').catch(() => undefined);
      await Promise.resolve();
    });
    await waitFor(() => expect(cache(queryClient).map((c) => c.id)).toEqual(['s2']));

    // No erro não há releitura (a invalidação vive no onSuccess): o que voltar
    // para a tela só pode ter vindo do rollback.
    await act(async () => {
      soltar({ message: 'permission denied', code: '42501' });
      await pendente;
    });

    expect(selectsDe('sla_configurations')).toHaveLength(1);
    expect(cache(queryClient).map((c) => c.id)).toEqual(['s1', 's2']);
    expect(toastMock.error).toHaveBeenCalledWith('permission denied');
  });
});

describe('useSLAConfigurations — escrita sem lista carregada', () => {
  const RLS = { message: 'permission denied', code: '42501' };

  it('alternar sem lista no cache não inventa estado quando o banco recusa', async () => {
    // A leitura inicial caiu (RLS): tela sem lista e cache sem dado.
    h.tables.sla_configurations = { data: null, error: RLS };
    h.writes.update = { error: RLS };
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(queryClient.getQueryData(['sla-configurations'])).toBeUndefined();

    await act(async () => {
      await result.current.toggleMutation.mutateAsync({ id: 's1', is_active: false }).catch(() => undefined);
    });

    expect(opsDe('update')[0].payload).toEqual({ is_active: false });
    expect(cache(queryClient)).toEqual([]);
  });

  it('excluir sem lista no cache não inventa linha quando o banco recusa', async () => {
    h.tables.sla_configurations = { data: null, error: RLS };
    h.writes.delete = { error: RLS };
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(queryClient.getQueryData(['sla-configurations'])).toBeUndefined();

    await act(async () => {
      await result.current.deleteMutation.mutateAsync('s1').catch(() => undefined);
    });

    expect(cache(queryClient)).toEqual([]);
    expect(toastMock.error).toHaveBeenCalledWith('permission denied');
  });
});

describe('useSLAConfigurations — diálogo e formulário', () => {
  it('openEdit preenche todos os campos da configuração; openCreate volta ao padrão', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() =>
      result.current.openEdit(
        cfg('s7', { name: 'Ouro', first_response_minutes: 5, resolution_minutes: 60, priority: 'high', is_default: true }),
      ),
    );
    expect(result.current.editingId).toBe('s7');
    expect(result.current.form).toEqual({
      name: 'Ouro',
      first_response_minutes: 5,
      resolution_minutes: 60,
      priority: 'high',
      is_default: true,
    });
    expect(result.current.showDialog).toBe(true);

    act(() => result.current.openCreate());
    expect(result.current.editingId).toBeNull();
    expect(result.current.form).toEqual(DEFAULT_FORM);
    expect(result.current.showDialog).toBe(true);
  });
});
