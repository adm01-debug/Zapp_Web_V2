import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Estado compartilhado com as fábricas de vi.mock (hoisted: os mocks são
// elevados acima dos imports e não podem capturar consts do corpo do arquivo).
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  modos: { delete: 'ok' as 'ok' | 'zero-linhas' | 'envelope-erro' | 'rejeicao' },
  // Linhas devolvidas pela LEITURA (loadHistory e a conferência de existência).
  antigos: [] as Array<{ id: string }>,
  isSupervisor: false,
  chamadas: { delete: 0, select: 0, cutoff: [] as string[], eq: [] as Array<[string, unknown]> },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'perfil-1' } }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    isSupervisor: h.isSupervisor,
    isAdmin: h.isSupervisor,
    roles: h.isSupervisor ? ['admin'] : [],
    loading: false,
    hasRole: () => h.isSupervisor,
  }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => h.log,
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => h.toastSuccess(...args),
    error: (...args: unknown[]) => h.toastError(...args),
  },
}));

// O cliente Supabase real devolve envelope `{ data, error }` (a Promise
// resolve MESMO com erro) — nunca lança para erro de PostgREST/RLS. O mock
// reproduz esse contrato, o que é a precondição do defeito.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'performance_snapshots') throw new Error(`tabela inesperada: ${table}`);

      // Builder de LEITURA (loadHistory: select/gte/order/limit e a conferência
      // de existência: select('id')/lt/limit) — thenable, como o PostgrestBuilder.
      const leitura = () => {
        const b: Record<string, unknown> = {};
        b.eq = (col: string, val: unknown) => {
          h.chamadas.eq.push([col, val]);
          return b;
        };
        b.gte = (_coluna: string, corte: string) => {
          h.chamadas.cutoff.push(corte);
          return b;
        };
        b.lt = () => b;
        b.order = () => b;
        b.limit = () => b;
        b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: h.antigos, error: null }).then(resolve, reject);
        return b;
      };

      return {
        delete: () => {
          const d: Record<string, unknown> = {};
          d.lt = () => d;
          d.eq = (col: string, val: unknown) => {
            h.chamadas.eq.push([col, val]);
            return d;
          };
          // A correção pede as linhas removidas para distinguir "removi" de
          // "nada a remover" (RLS pode descartar sem erro).
          d.select = (_colunas: string) => {
            h.chamadas.delete += 1;
            if (h.modos.delete === 'rejeicao') {
              return Promise.reject(new Error('falha de transporte simulada'));
            }
            if (h.modos.delete === 'envelope-erro') {
              return Promise.resolve({ data: null, error: { message: 'DELETE recusado pelo RLS' } });
            }
            if (h.modos.delete === 'zero-linhas') {
              return Promise.resolve({ data: [], error: null });
            }
            return Promise.resolve({ data: [{ id: 'snap-1' }, { id: 'snap-2' }], error: null });
          };
          return d;
        },
        select: () => {
          h.chamadas.select += 1;
          return leitura();
        },
      };
    },
  },
}));

import { usePerformanceSnapshots } from '@/hooks/analytics/usePerformanceSnapshots';

describe('usePerformanceSnapshots — limpar snapshots antigos', () => {
  beforeEach(() => {
    h.toastSuccess.mockClear();
    h.toastError.mockClear();
    h.log.warn.mockClear();
    h.modos.delete = 'ok';
    h.antigos = [];
    h.isSupervisor = false;
    h.chamadas.delete = 0;
    h.chamadas.select = 0;
    h.chamadas.cutoff = [];
    h.chamadas.eq = [];
  });

  async function limpar() {
    const { result } = renderHook(() => usePerformanceSnapshots());
    await act(async () => {
      await result.current.clearOldSnapshots();
    });
  }

  it('não anuncia remoção quando o DELETE resolve com { error } (envelope do SDK)', async () => {
    h.modos.delete = 'envelope-erro';

    await limpar();

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledTimes(1);
    // Não recarrega o histórico: a recarga não é prova de remoção.
    expect(h.chamadas.select).toBe(0);
  });

  it('não anuncia remoção quando o DELETE rejeita a Promise', async () => {
    h.modos.delete = 'rejeicao';

    await limpar();

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledTimes(1);
    expect(h.chamadas.select).toBe(0);
    // A causa é registrada para diagnóstico.
    expect(h.log.warn).toHaveBeenCalled();
  });

  it('controle: com DELETE sem erro anuncia remoção e recarrega o histórico', async () => {
    await limpar();

    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.toastSuccess).toHaveBeenCalledTimes(1);
    expect(h.toastSuccess).toHaveBeenCalledWith('Dados antigos removidos');
    expect(h.chamadas.delete).toBe(1);
    expect(h.chamadas.select).toBe(1);
  });

  it('zero linhas removidas não é anunciado como remoção (RLS pode descartar sem erro)', async () => {
    h.modos.delete = 'zero-linhas';

    await limpar();

    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.toastSuccess).toHaveBeenCalledTimes(1);
    expect(h.toastSuccess).toHaveBeenCalledWith('Nenhum snapshot antigo para remover');
  });

  it('DELETE negado (0 linhas) com snapshots antigos existentes avisa falta de permissão', async () => {
    // Agente: a policy de DELETE é só admin/supervisor, então a RLS descarta as
    // linhas sem erro. Havendo snapshots antigos, 0 removidos = negado.
    h.modos.delete = 'zero-linhas';
    h.antigos = [{ id: 'antigo-1' }];

    await limpar();

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith('Sem permissão para limpar estes snapshots');
  });

  it('a limpeza no escopo padrão apaga só os snapshots do próprio perfil', async () => {
    await limpar();

    expect(h.chamadas.eq).toContainEqual(['profile_id', 'perfil-1']);
  });

  it("admin no escopo 'todos' limpa sem filtro de perfil (todos os usuários)", async () => {
    h.isSupervisor = true;
    const { result } = renderHook(() => usePerformanceSnapshots());

    await act(async () => {
      await result.current.loadHistory(24, 'todos');
    });
    await act(async () => {
      await result.current.clearOldSnapshots();
    });

    expect(h.chamadas.delete).toBe(1);
    expect(h.chamadas.eq).toHaveLength(0);
  });

  it('mantém o período selecionado ao recarregar após a limpeza', async () => {
    const { result } = renderHook(() => usePerformanceSnapshots());

    // Usuário escolheu 7 dias (168h) no seletor -> loadHistory(168).
    await act(async () => {
      await result.current.loadHistory(168);
    });
    expect(h.chamadas.cutoff).toHaveLength(1);

    await act(async () => {
      await result.current.clearOldSnapshots();
    });

    expect(h.chamadas.cutoff).toHaveLength(2);
    const [primeiro, segundo] = h.chamadas.cutoff.map(c => Date.parse(c));
    // Mesma janela de 168h (tolerância só para o tempo decorrido entre as chamadas);
    // antes da correção a recarga voltava ao padrão de 24h (~144h de diferença).
    expect(Math.abs(segundo - primeiro)).toBeLessThan(5000);
    expect(Math.abs(Date.now() - 168 * 3600 * 1000 - primeiro)).toBeLessThan(5000);
  });
});
