import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useQueuesComparison } from '@/hooks/business/useQueuesComparison';

interface Resposta {
  data: unknown;
  error: unknown;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (valor: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (valor: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Objeto que aceita qualquer método do PostgREST e termina (thenable) na resposta dada. */
function cadeia(resposta: Promise<Resposta>) {
  const node: Record<string, unknown> = {};
  const mesmo = () => node;
  for (const metodo of ['select', 'in', 'gte', 'lte', 'eq', 'not', 'order', 'limit', 'range']) {
    node[metodo] = vi.fn(mesmo);
  }
  node.then = (onFulfilled: unknown, onRejected: unknown) =>
    (resposta as Promise<Resposta>).then(onFulfilled as never, onRejected as never);
  return node;
}

const RANGE_ANTIGO = { from: new Date('2024-01-01'), to: new Date('2024-01-31') };
const RANGE_RECENTE = { from: new Date('2024-02-01'), to: new Date('2024-02-29') };

/** Uma resposta pendente de `messages` por consulta, na ordem em que as consultas são emitidas. */
let mensagensPendentes: Deferred<Resposta>[] = [];
let chamadasDeMensagens = 0;

function responderTabelasComuns() {
  mockFrom.mockImplementation((tabela: string) => {
    if (tabela === 'queues') {
      return cadeia(
        Promise.resolve({ data: [{ id: 'q1', name: 'Suporte', color: '#3B82F6' }], error: null }),
      );
    }
    if (tabela === 'contacts') {
      return cadeia(
        Promise.resolve({
          data: [{ id: 'c1', queue_id: 'q1', assigned_to: 'p1', created_at: '2024-01-15' }],
          error: null,
        }),
      );
    }
    if (tabela === 'queue_members') {
      return cadeia(
        Promise.resolve({ data: [{ queue_id: 'q1', profile_id: 'p1' }], error: null }),
      );
    }
    if (tabela === 'messages') {
      const pendente = mensagensPendentes[chamadasDeMensagens];
      chamadasDeMensagens += 1;
      if (!pendente) throw new Error('consulta a messages não esperada no teste');
      return cadeia(pendente.promise);
    }
    return cadeia(Promise.resolve({ data: [], error: null }));
  });
}

function totalMensagens(result: { current: { queuesPerformance: Array<{ totalMessages: number }> } }) {
  return result.current.queuesPerformance[0]?.totalMessages ?? 0;
}

function mensagensIguais(quantidade: number) {
  return Array.from({ length: quantidade }, () => ({ contact_id: 'c1' }));
}

describe('useQueuesComparison — troca de período (R2-QUE-010)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mensagensPendentes = [];
    chamadasDeMensagens = 0;
    responderTabelasComuns();
  });

  it('descarta a resposta do período antigo que chega depois da comparação recente', async () => {
    const antigo = deferred<Resposta>();
    const recente = deferred<Resposta>();
    mensagensPendentes = [antigo, recente];

    const { result, rerender } = renderHook(
      ({ faixa }: { faixa: { from: Date; to: Date } }) => useQueuesComparison(faixa),
      { initialProps: { faixa: RANGE_ANTIGO } },
    );

    await waitFor(() => expect(chamadasDeMensagens).toBe(1));

    // O usuário troca o período: nova comparação em voo enquanto a antiga ainda responde.
    rerender({ faixa: RANGE_RECENTE });
    await waitFor(() => expect(chamadasDeMensagens).toBe(2));

    // A resposta do período RECENTE chega primeiro (1 mensagem).
    await act(async () => {
      recente.resolve({ data: mensagensIguais(1), error: null });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(totalMensagens(result)).toBe(1);

    // A resposta do período ANTIGO chega depois (5 mensagens): não pode sobrescrever.
    await act(async () => {
      antigo.resolve({ data: mensagensIguais(5), error: null });
    });

    expect(totalMensagens(result)).toBe(1);
    expect(result.current.loading).toBe(false);
  });

  it('não publica o período antigo nem libera o carregamento enquanto a consulta recente está em voo', async () => {
    const antigo = deferred<Resposta>();
    const recente = deferred<Resposta>();
    mensagensPendentes = [antigo, recente];

    const { result, rerender } = renderHook(
      ({ faixa }: { faixa: { from: Date; to: Date } }) => useQueuesComparison(faixa),
      { initialProps: { faixa: RANGE_ANTIGO } },
    );

    await waitFor(() => expect(chamadasDeMensagens).toBe(1));

    rerender({ faixa: RANGE_RECENTE });
    await waitFor(() => expect(chamadasDeMensagens).toBe(2));

    // Ordem invertida: a resposta ANTIGA chega com a consulta recente ainda em voo.
    await act(async () => {
      antigo.resolve({ data: mensagensIguais(5), error: null });
    });

    expect(result.current.queuesPerformance).toEqual([]);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      recente.resolve({ data: mensagensIguais(1), error: null });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(totalMensagens(result)).toBe(1);
  });
});
