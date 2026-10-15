import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * PG-08 — playbooks para o atendente (`usePlaybooksAtivos`) e ativar/desativar
 * (`useSetPlaybookActive`).
 *
 * O stub do Supabase FILTRA e ORDENA de verdade pelos filtros que o hook envia:
 * leitura sem `is_active = true`, sem a categoria pedida ou fora da ordem fica
 * vermelha. O UPDATE imita o RLS real: admin/supervisor afeta a linha; agente
 * comum é filtrado SEM erro (`data: []`, `error: null`) — que é justamente o
 * caminho que não pode passar por sucesso.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  papel: 'agent' as 'agent' | 'admin' | 'supervisor',
  readError: null as { message: string; code?: string } | null,
  updateError: null as { message: string; code?: string } | null,
  consultas: [] as Array<{
    tabela: string;
    filtros: Array<[string, unknown]>;
    ordens: Array<[string, boolean]>;
  }>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (tabela: string) => {
    const filtros: Array<[string, unknown]> = [];
    const ordens: Array<[string, boolean]> = [];
    let payload: Record<string, unknown> | null = null;
    const registro = { tabela, filtros, ordens };
    h.consultas.push(registro);

    const linhas = () => {
      const casadas = h.rows.filter((r) => filtros.every(([col, val]) => r[col] === val));
      if (ordens.length === 0) return casadas;
      return [...casadas].sort((a, b) => {
        for (const [col, asc] of ordens) {
          const va = a[col] as string;
          const vb = b[col] as string;
          if (va < vb) return asc ? -1 : 1;
          if (va > vb) return asc ? 1 : -1;
        }
        return 0;
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filtros.push([col, val]);
        return b;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        ordens.push([col, opts?.ascending !== false]);
        return b;
      },
      update: (p: Record<string, unknown>) => {
        payload = p;
        h.updates.push(p);
        return b;
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (payload) {
          if (h.updateError) {
            return Promise.resolve({ data: null, error: h.updateError }).then(resolve);
          }
          // RLS: só admin/supervisor passa; agente comum devolve 0 linhas e nenhum erro.
          const afetadas = h.papel === 'agent' ? [] : linhas().map((r) => ({ id: r.id }));
          return Promise.resolve({ data: afetadas, error: null }).then(resolve);
        }
        if (h.readError) return Promise.resolve({ data: null, error: h.readError }).then(resolve);
        return Promise.resolve({ data: linhas(), error: null }).then(resolve);
      },
    };
    return b;
  };

  return { supabase: { from: (t: string) => builder(t) } };
});

import { usePlaybooksAtivos, useSetPlaybookActive } from '@/hooks/admin/usePlaybooksAtivos';
import { toast } from 'sonner';

function playbook(over: Record<string, unknown> = {}): Row {
  return {
    id: 'pb-1',
    name: 'Abertura',
    description: null,
    category: 'sales',
    steps: [{ order: 1, title: 'Passo um', description: '', tips: '' }],
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function cliente() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

function montar<T>(hook: () => T, client: QueryClient = cliente()) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(hook, { wrapper: Wrapper });
}

// Só leituras (as escritas não passam por `order`).
const leiturasDe = () => h.consultas.filter((c) => c.tabela === 'playbooks' && c.ordens.length > 0).length;

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [];
  h.papel = 'agent';
  h.readError = null;
  h.updateError = null;
  h.consultas = [];
  h.updates = [];
});

describe('usePlaybooksAtivos (PG-08)', () => {
  it('não devolve playbook desativado para o atendente', async () => {
    h.rows = [
      playbook({ id: 'pb-ativo', name: 'Abertura', is_active: true }),
      playbook({ id: 'pb-inativo', name: 'Encerramento', is_active: false }),
    ];

    const { result } = montar(() => usePlaybooksAtivos());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((p) => p.id)).toEqual(['pb-ativo']);
  });

  it('sem categoria, traz todos os ativos na ordem categoria → nome → id', async () => {
    h.rows = [
      playbook({ id: 'pb-3', name: 'Zebra', category: 'support', is_active: true }),
      playbook({ id: 'pb-2', name: 'Abertura', category: 'support', is_active: true }),
      playbook({ id: 'pb-1', name: 'Abertura', category: 'billing', is_active: true }),
      playbook({ id: 'pb-9', name: 'Antigo', category: 'billing', is_active: false }),
    ];

    const { result } = montar(() => usePlaybooksAtivos());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((p) => p.id)).toEqual(['pb-1', 'pb-2', 'pb-3']);
  });

  it('filtra pela categoria pedida e nunca sai do recorte de ativos', async () => {
    h.rows = [
      playbook({ id: 'pb-sales', name: 'Abertura', category: 'sales', is_active: true }),
      playbook({ id: 'pb-sales-off', name: 'Desativado', category: 'sales', is_active: false }),
      playbook({ id: 'pb-support', name: 'Abertura', category: 'support', is_active: true }),
    ];

    const { result } = montar(() => usePlaybooksAtivos('sales'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((p) => p.id)).toEqual(['pb-sales']);
    const consulta = h.consultas[0];
    expect(consulta.filtros).toContainEqual(['is_active', true]);
    expect(consulta.filtros).toContainEqual(['category', 'sales']);
  });

  it('erro de leitura vira erro, não lista vazia', async () => {
    h.readError = { message: 'permission denied', code: '42501' };

    const { result } = montar(() => usePlaybooksAtivos());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect((result.current.error as Error).message).toBe('permission denied');
  });

  it('normaliza steps que não vieram como lista', async () => {
    h.rows = [playbook({ id: 'pb-x', steps: null })];

    const { result } = montar(() => usePlaybooksAtivos());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].steps).toEqual([]);
  });
});

describe('useSetPlaybookActive (PG-08)', () => {
  it('agente comum: update filtrado pela RLS (0 linhas) é erro visível, não sucesso', async () => {
    h.rows = [playbook({ id: 'pb-1', is_active: true })];
    h.papel = 'agent';

    const client = cliente();
    const { result } = montar(() => useSetPlaybookActive(), client);

    await act(async () => {
      await result.current.mutateAsync({ id: 'pb-1', ativo: false }).catch(() => undefined);
    });

    expect(h.updates).toEqual([{ is_active: false }]);
    expect(h.consultas[0].filtros).toContainEqual(['id', 'pb-1']);
    expect(toast.error).toHaveBeenCalledWith(
      'Playbook não alterado — nenhuma linha mudou (permissão de admin/supervisor ou playbook removido).',
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('admin: 1 linha afetada é sucesso e revalida a leitura', async () => {
    h.rows = [playbook({ id: 'pb-1', is_active: true })];
    h.papel = 'admin';

    const client = cliente();
    const { result } = montar(() => useSetPlaybookActive(), client);

    // ativa a leitura antes: a invalidação só refaz consulta se houver observador
    const leitura = montar(() => usePlaybooksAtivos(), client);
    await waitFor(() => expect(leitura.result.current.isSuccess).toBe(true));
    const antes = leiturasDe();

    await act(async () => {
      await result.current.mutateAsync({ id: 'pb-1', ativo: false });
    });

    expect(h.updates).toEqual([{ is_active: false }]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Playbook atualizado'));
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => expect(leiturasDe()).toBeGreaterThan(antes));
  });

  it('erro do PostgREST: mensagem visível e nenhuma revalidação', async () => {
    h.rows = [playbook({ id: 'pb-1', is_active: true })];
    h.papel = 'admin';
    h.updateError = { message: 'boom', code: '500' };

    const client = cliente();
    const { result } = montar(() => useSetPlaybookActive(), client);
    const leitura = montar(() => usePlaybooksAtivos(), client);
    await waitFor(() => expect(leitura.result.current.isSuccess).toBe(true));
    const antes = leiturasDe();

    await act(async () => {
      await result.current.mutateAsync({ id: 'pb-1', ativo: false }).catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalledWith('Não foi possível alterar o playbook. Tente novamente.');
    expect(toast.success).not.toHaveBeenCalled();
    // nada mudou no banco: revalidar seria trabalho à toa
    expect(leiturasDe()).toBe(antes);
  });
});
