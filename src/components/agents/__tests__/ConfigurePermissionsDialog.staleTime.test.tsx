/**
 * HZ3-003 — o diálogo de permissões reabria com DUAS consultas novas toda vez
 * (`user_roles` e `permissions`), sem `staleTime`. Cargos e permissões mudam em
 * raríssimas ocasiões, então reabrir o diálogo dentro da janela de 5 min não pode
 * gerar nova request.
 *
 * Como é provado: o cliente Supabase mockado conta as tabelas pedidas. Abrir,
 * fechar e reabrir tem de continuar em duas consultas (uma por tabela) — sem o
 * `staleTime` o cache fica `stale` e o React Query refaz as duas na reabertura.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ tabelas: [] as string[] }));

vi.mock('@/integrations/supabase/client', () => {
  const makeQuery = () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    // A consulta é aguardada pelo `queryFn`: precisa ser "thenable".
    q.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    return q;
  };
  return {
    supabase: {
      from: (tabela: string) => {
        h.tabelas.push(tabela);
        return makeQuery();
      },
    },
  };
});

vi.mock('@/hooks/crm/useTeamProfiles', () => ({
  useTeamProfiles: () => ({ data: [] }),
}));

import { ConfigurePermissionsDialog } from '@/components/agents/ConfigurePermissionsDialog';

const renderDialog = (client: QueryClient) => (
  <QueryClientProvider client={client}>
    <ConfigurePermissionsDialog open onOpenChange={() => {}} />
  </QueryClientProvider>
);

const renderDialogFechado = (client: QueryClient) => (
  <QueryClientProvider client={client}>
    <ConfigurePermissionsDialog open={false} onOpenChange={() => {}} />
  </QueryClientProvider>
);

describe('ConfigurePermissionsDialog — cache das consultas do diálogo (HZ3-003)', () => {
  beforeEach(() => {
    h.tabelas = [];
  });

  it('reabrir o diálogo dentro de 5 min não repete as consultas', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { rerender } = render(renderDialogFechado(client));

    rerender(renderDialog(client));

    // Duas tabelas consultadas: user_roles e permissions.
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.tabelas).toEqual(['user_roles', 'permissions']);

    // Fecha e reabre: com `staleTime`, o cache está fresco e nada é reconsultado.
    rerender(renderDialogFechado(client));
    rerender(renderDialog(client));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(h.tabelas).toEqual(['user_roles', 'permissions']);
  });
});
