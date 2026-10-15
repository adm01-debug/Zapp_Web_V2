import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// O defeito: a leitura de histórico NÃO filtrava por perfil. A policy de SELECT
// de performance_snapshots libera admin/supervisor para ver TODOS os snapshots
// (migration 20260403143300), então o gráfico do PerformanceMonitor mostrava
// medições de outras pessoas como se fossem do navegador atual.
// Este teste prova o filtro por perfil e o opt-in explícito de 'todos'.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  perfilId: 'perfil-1' as string | null,
  isSupervisor: false,
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  // Filtros .eq() aplicados na leitura (o defeito é justamente não aplicar nenhum).
  eqLeitura: [] as Array<[string, unknown]>,
  linhas: [] as Array<{ id: string; profile_id: string }>,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: h.perfilId ? { id: h.perfilId } : null }),
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

vi.mock('@/lib/logger', () => ({ getLogger: () => h.log }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const b: Record<string, unknown> = {};
        b.eq = (col: string, val: unknown) => {
          h.eqLeitura.push([col, val]);
          return b;
        };
        b.gte = () => b;
        b.order = () => b;
        b.limit = () => b;
        b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: h.linhas, error: null }).then(resolve, reject);
        return b;
      },
    }),
  },
}));

import { usePerformanceSnapshots } from '@/hooks/analytics/usePerformanceSnapshots';

describe('usePerformanceSnapshots — escopo do histórico', () => {
  beforeEach(() => {
    h.perfilId = 'perfil-1';
    h.isSupervisor = false;
    h.eqLeitura = [];
    h.linhas = [
      { id: 'snap-1', profile_id: 'perfil-1' },
      { id: 'snap-2', profile_id: 'perfil-1' },
    ];
  });

  it('por padrão lê só os snapshots do perfil atual', async () => {
    const { result } = renderHook(() => usePerformanceSnapshots());

    await act(async () => {
      await result.current.loadHistory(24);
    });

    expect(h.eqLeitura).toContainEqual(['profile_id', 'perfil-1']);
    expect(result.current.history).toHaveLength(2);
  });

  it("pedir 'todos' sem papel de admin/supervisor continua restrito ao próprio perfil", async () => {
    const { result } = renderHook(() => usePerformanceSnapshots());

    await act(async () => {
      await result.current.loadHistory(24, 'todos');
    });

    expect(h.eqLeitura).toContainEqual(['profile_id', 'perfil-1']);
  });

  it("admin/supervisor pode pedir 'todos' explicitamente (sem filtro de perfil)", async () => {
    h.isSupervisor = true;
    const { result } = renderHook(() => usePerformanceSnapshots());

    await act(async () => {
      await result.current.loadHistory(24, 'todos');
    });

    expect(h.eqLeitura).toHaveLength(0);
  });
});
