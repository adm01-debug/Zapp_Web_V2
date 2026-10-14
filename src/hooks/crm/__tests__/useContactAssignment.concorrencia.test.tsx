/**
 * `useContactAssignment` — guarda anti-concorrência por contato.
 *
 * Dois toques rápidos (A, depois B) no mesmo contato disparam dois UPDATEs. A fila
 * por contato do hook executa um de cada vez, na ordem dos cliques: o segundo UPDATE
 * só vai ao banco depois que o primeiro assenta. O que se prova aqui, com o banco
 * dublado por promessas controladas:
 * 1. mesmo contato, resolução fora de ordem — B só é enviado depois de A assentar;
 *    os dois avisos saem na ordem dos cliques e cada aceite invalida o cache (nada
 *    some, nada stale);
 * 2. contatos diferentes não se bloqueiam — cada um tem sua fila.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type Resposta = { error: null | { message: string } };

const h = vi.hoisted(() => ({
  payloads: [] as Record<string, unknown>[],
  pendentes: [] as Array<(r: Resposta) => void>,
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        h.payloads.push(payload);
        return {
          eq: () =>
            new Promise<Resposta>((resolver) => {
              h.pendentes.push(resolver);
            }),
        };
      },
    }),
  },
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { useContactAssignment } from '../useContactAssignment';

const CONTATO_A = '11111111-2222-4333-8444-555555555555';
const CONTATO_B = '22222222-3333-4444-8555-666666666666';

function montar(qc: QueryClient, contato: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useContactAssignment(contato), { wrapper });
}

function novoQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

/** Deixa as promessas da fila do hook andarem sem assentar nenhum UPDATE. */
const girarFila = () => act(async () => {});

describe('useContactAssignment — fila por contato', () => {
  beforeEach(() => {
    h.payloads = [];
    h.pendentes = [];
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  it('mesmo contato com resolução fora de ordem: B espera A; avisos e invalidações saem em ordem', async () => {
    const qc = novoQueryClient();
    const espiao = vi.spyOn(qc, 'invalidateQueries');
    const { result } = montar(qc, CONTATO_A);

    let promessaA!: Promise<void>;
    let promessaB!: Promise<void>;
    act(() => {
      promessaA = result.current.assignAgent('ag-A');
      promessaB = result.current.assignAgent('ag-B');
    });
    await girarFila();

    // B ainda NÃO foi ao banco: está na fila atrás de A.
    await waitFor(() => expect(h.payloads).toHaveLength(1));
    expect(h.payloads).toEqual([{ assigned_to: 'ag-A' }]);

    // O banco resolve FORA de ordem (só A está pendente; resolve A)...
    await act(async () => {
      h.pendentes[0]({ error: null });
      await promessaA;
    });
    // ...e só então B é enviado (a fila anda em microtarefas: espera assentar).
    await waitFor(() => expect(h.payloads).toEqual([{ assigned_to: 'ag-A' }, { assigned_to: 'ag-B' }]));

    await act(async () => {
      h.pendentes[h.pendentes.length - 1]({ error: null });
      await promessaB;
    });

    // Cada aceite avisou e invalidou, na ordem dos cliques: a mais nova não sumiu
    // e nenhuma resposta obsoleta apagou o estado da outra.
    expect(toastMock.success.mock.calls.map(([m]) => m)).toEqual([
      'Atendente atribuído',
      'Atendente atribuído',
    ]);
    const chaves = espiao.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey);
    expect(chaves.filter((k) => JSON.stringify(k) === JSON.stringify(['contact-enriched', CONTATO_A]))).toHaveLength(2);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('contatos diferentes andam em paralelo: um não espera o outro', async () => {
    const qc = novoQueryClient();
    const { result: ganchoA } = montar(qc, CONTATO_A);
    const { result: ganchoB } = montar(qc, CONTATO_B);

    let promessaA!: Promise<void>;
    let promessaB!: Promise<void>;
    act(() => {
      promessaA = ganchoA.current.assignAgent('ag-A');
      promessaB = ganchoB.current.assignQueue('fila-B');
    });
    await girarFila();

    // Filas separadas: os dois UPDATEs já foram ao banco.
    await waitFor(() => expect(h.payloads).toEqual([{ assigned_to: 'ag-A' }, { queue_id: 'fila-B' }]));

    await act(async () => {
      h.pendentes[0]({ error: null });
      h.pendentes[1]({ error: null });
      await promessaA;
      await promessaB;
    });

    expect(toastMock.success.mock.calls.map(([m]) => m)).toEqual([
      'Atendente atribuído',
      'Fila atribuída',
    ]);
  });
});
