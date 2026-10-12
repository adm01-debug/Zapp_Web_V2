/**
 * `useContactAssignment` — troca de atendente/fila de um contato.
 *
 * Antes o hook gravava no banco e não avisava o cache: a lista de Contatos, os KPIs, o
 * Crm360 e os contadores da aba de conversa continuavam mostrando o responsável antigo
 * até um reload. O que se prova aqui: o UPDATE leva o payload certo e, ao dar certo, as
 * queries de contato/conversa são invalidadas; ao dar errado, nada é invalidado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  updatePayloads: [] as Record<string, unknown>[],
  error: null as null | { message: string },
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        h.updatePayloads.push(payload);
        return { eq: () => Promise.resolve({ error: h.error }) };
      },
    }),
  },
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { useContactAssignment } from '../useContactAssignment';

const CONTATO = '11111111-2222-4333-8444-555555555555';

function montar(qc: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useContactAssignment(CONTATO), { wrapper });
}

function chavesInvalidadas(qc: QueryClient) {
  const espiao = vi.spyOn(qc, 'invalidateQueries');
  return espiao;
}

describe('useContactAssignment — invalida o cache depois de gravar', () => {
  beforeEach(() => {
    h.updatePayloads = [];
    h.error = null;
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  it('assignAgent grava assigned_to e invalida as queries de contato', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const espiao = chavesInvalidadas(qc);
    const { result } = montar(qc);

    await act(async () => {
      await result.current.assignAgent('ag-1');
    });

    expect(h.updatePayloads).toEqual([{ assigned_to: 'ag-1' }]);
    expect(toastMock.success).toHaveBeenCalled();

    const chaves = espiao.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey);
    expect(chaves).toContainEqual(['contacts-kpi']);
    expect(chaves).toContainEqual(['contacts-type-counts']);
    expect(chaves).toContainEqual(['contacts-search']);
    expect(chaves).toContainEqual(['contact-enriched', CONTATO]);
    expect(chaves).toContainEqual(['contact-crm-360', CONTATO]);
    expect(chaves).toContainEqual(['conversation-tab-counts', CONTATO]);
  });

  it('assignQueue grava queue_id e remove o atendente da fila no cache (queue_id null)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const espiao = chavesInvalidadas(qc);
    const { result } = montar(qc);

    await act(async () => {
      await result.current.assignQueue(null);
    });

    expect(h.updatePayloads).toEqual([{ queue_id: null }]);
    expect(toastMock.success).toHaveBeenCalledWith('Fila removida');
    const chaves = espiao.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey);
    expect(chaves).toContainEqual(['contacts-search']);
  });

  it('erro no UPDATE avisa o usuário e não invalida nada', async () => {
    h.error = { message: 'RLS' };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const espiao = chavesInvalidadas(qc);
    const { result } = montar(qc);

    await act(async () => {
      await result.current.assignAgent('ag-1');
    });

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(espiao).not.toHaveBeenCalled();
  });
});
