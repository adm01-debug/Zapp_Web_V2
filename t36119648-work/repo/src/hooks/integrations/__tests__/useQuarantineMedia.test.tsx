/**
 * Comportamento de `useQuarantineMedia` (admin da quarentena ClamAV). A fronteira
 * mockada é a REDE (`queryExternalProxy`); o hook e o `quarantineStore` são os reais —
 * é o par que precisa continuar coerente (a bolha da mensagem lê o store).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryExternalProxy, logError } = vi.hoisted(() => ({
  queryExternalProxy: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/externalProxy', () => ({ queryExternalProxy }));
vi.mock('@/lib/logger', () => ({
  log: { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useQuarantineMedia, type QuarantineRecord } from '../useQuarantineMedia';
import { quarantineStore } from '@/lib/quarantineStore';

interface Params {
  table?: string;
  select?: string;
  filters?: { column: string; operator: string; value: unknown }[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  countMode?: string;
  action?: string;
  data?: Record<string, unknown>;
  match?: Record<string, unknown>;
}

const linha = (over: Partial<QuarantineRecord> = {}): QuarantineRecord => ({
  id: 'r1',
  message_id: 'msg-1',
  decision: 'pending',
  created_at: '2026-10-01T10:00:00.000Z',
  ...over,
});

/** Resposta padrão: lista principal + contagem de pendentes. */
function mockPadrao(principal: unknown, contagemPendentes = 0) {
  queryExternalProxy.mockImplementation((p: unknown) => {
    const params = p as Params;
    if (params.action === 'update') return Promise.resolve({ data: [] });
    if (params.select === 'id') return Promise.resolve({ data: [], count: contagemPendentes });
    return Promise.resolve(principal);
  });
}

const chamada = (i: number) => queryExternalProxy.mock.calls[i][0] as Params;

function deferido<T>() {
  let resolver!: (valor: T) => void;
  const promise = new Promise<T>((res) => {
    resolver = res;
  });
  return { promise, resolver };
}

let upsertMany: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  queryExternalProxy.mockReset();
  logError.mockReset();
  upsertMany = vi.spyOn(quarantineStore, 'upsertMany').mockImplementation(() => {});
});

afterEach(() => {
  upsertMany.mockRestore();
});

describe('carga inicial', () => {
  it('busca o filtro padrão (pending) e sincroniza o store global', async () => {
    mockPadrao({ data: [linha()], count: 7 }, 3);

    const { result } = renderHook(() => useQuarantineMedia());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.records).toHaveLength(1);
    expect(result.current.total).toBe(7);
    expect(result.current.pendingCount).toBe(3);
    expect(result.current.filter).toBe('pending');
    expect(result.current.error).toBeNull();
    expect(upsertMany).toHaveBeenCalledWith([linha()]);
    expect(chamada(0)).toMatchObject({
      table: 'media_quarantine',
      select: '*',
      filters: [{ column: 'decision', operator: 'eq', value: 'pending' }],
      order: { column: 'created_at', ascending: false },
      limit: 200,
      countMode: 'exact',
    });
    expect(chamada(1)).toMatchObject({
      table: 'media_quarantine',
      select: 'id',
      filters: [{ column: 'decision', operator: 'eq', value: 'pending' }],
      countMode: 'exact',
      limit: 1,
    });
  });

  it('no filtro "all" não manda filtro de decisão', async () => {
    mockPadrao({ data: [], count: 0 });
    const { result } = renderHook(() => useQuarantineMedia());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setFilter('all');
    });
    await waitFor(() => expect(result.current.filter).toBe('all'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(chamada(queryExternalProxy.mock.calls.length - 2).filters).toEqual([]);
  });

  it('trocar o filtro refaz a busca com o novo valor', async () => {
    mockPadrao({ data: [linha()], count: 1 }, 1);
    const { result } = renderHook(() => useQuarantineMedia());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockPadrao({ data: [linha({ decision: 'allowed' })], count: 1 }, 1);
    act(() => {
      result.current.setFilter('allowed');
    });
    await waitFor(() => expect(result.current.records[0]?.decision).toBe('allowed'));

    expect(chamada(queryExternalProxy.mock.calls.length - 2).filters).toEqual([
      { column: 'decision', operator: 'eq', value: 'allowed' },
    ]);
  });

  it('dado malformado (data não-lista) não quebra a tela', async () => {
    mockPadrao({ data: 'não é lista', count: undefined });
    const { result } = renderHook(() => useQuarantineMedia());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.records).toEqual([]);
    expect(upsertMany).toHaveBeenCalledWith([]);
  });

  it.fails('não usa o `length` de um payload que não é lista como total', async () => {
    // `main.count ?? main.data?.length ?? 0` lê `.length` de uma string quando o
    // proxy devolve algo que não é lista: o painel anuncia "11" registros.
    mockPadrao({ data: 'não é lista', count: undefined });
    const { result } = renderHook(() => useQuarantineMedia());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.total).toBe(0);
  });
});

describe('VPS não configurada', () => {
  it('liga notConfigured, zera a tela e não mexe no store', async () => {
    mockPadrao({ data: [], count: 0, notConfigured: true }, 9);
    const { result } = renderHook(() => useQuarantineMedia());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notConfigured).toBe(true);
    expect(result.current.records).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.pendingCount).toBe(0);
    expect(upsertMany).not.toHaveBeenCalled();
  });
});

describe('erros', () => {
  it('erro de rede vira mensagem de erro e sai do loading', async () => {
    queryExternalProxy.mockRejectedValue(new Error('Failed to fetch'));
    const { result } = renderHook(() => useQuarantineMedia());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Failed to fetch');
    expect(result.current.records).toEqual([]);
    expect(logError).toHaveBeenCalled();
  });

  it('erro de RLS (objeto sem message) cai na mensagem genérica', async () => {
    queryExternalProxy.mockRejectedValue('permission denied for table media_quarantine');
    const { result } = renderHook(() => useQuarantineMedia());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Erro ao buscar quarentena');
  });
});

describe('decide', () => {
  it('aplica a decisão de forma otimista e persiste via proxy com reviewed_at', async () => {
    mockPadrao({ data: [linha()], count: 1 }, 1);
    const { result } = renderHook(() => useQuarantineMedia());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const lento = deferido<{ data: unknown[] }>();
    queryExternalProxy.mockImplementation((p: unknown) => {
      const params = p as Params;
      if (params.action === 'update') return lento.promise;
      return Promise.resolve({ data: [linha({ decision: 'deleted' })], count: 0 });
    });

    act(() => {
      void result.current.decide('r1', 'deleted');
    });
    // antes de a rede responder, a lista já mostra a decisão
    expect(result.current.records[0].decision).toBe('deleted');

    await act(async () => {
      lento.resolver({ data: [] });
    });

    const update = queryExternalProxy.mock.calls
      .map((c) => c[0] as Params)
      .find((p) => p.action === 'update');
    expect(update).toMatchObject({
      action: 'update',
      table: 'media_quarantine',
      data: { decision: 'deleted' },
      match: { id: 'r1' },
    });
    expect(update?.data?.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
  });

  it('quando o update falha, desfaz o otimista com a verdade do servidor e propaga o erro', async () => {
    mockPadrao({ data: [linha()], count: 1 }, 1);
    const { result } = renderHook(() => useQuarantineMedia());
    await waitFor(() => expect(result.current.loading).toBe(false));

    queryExternalProxy.mockImplementation((p: unknown) => {
      const params = p as Params;
      if (params.action === 'update') return Promise.reject(new Error('RLS negada'));
      return Promise.resolve({ data: [linha()], count: 1 });
    });

    await expect(
      act(async () => {
        await result.current.decide('r1', 'deleted');
      }),
    ).rejects.toThrow('RLS negada');

    expect(result.current.records[0].decision).toBe('pending');
    expect(logError).toHaveBeenCalled();
  });
});

describe('corrida entre filtros', () => {
  it.fails('descarta a resposta de um filtro antigo que resolve depois do atual', async () => {
    // Sem sequência de requisição, a resposta atrasada do filtro anterior sobrescreve
    // a lista do filtro atual: o admin vê "pending" com o filtro "allowed" selecionado.
    const principal = deferido<{ data: QuarantineRecord[]; count: number }>();
    let chamadas = 0;
    queryExternalProxy.mockImplementation(() => {
      chamadas += 1;
      if (chamadas === 1) return principal.promise;
      if (chamadas === 2) return Promise.resolve({ data: [], count: 0 });
      return Promise.resolve({ data: [linha({ decision: 'allowed' })], count: 1 });
    });

    const { result } = renderHook(() => useQuarantineMedia());
    act(() => {
      result.current.setFilter('allowed');
    });
    await waitFor(() => expect(result.current.records[0]?.decision).toBe('allowed'));

    await act(async () => {
      principal.resolver({ data: [linha({ decision: 'pending' })], count: 1 });
    });

    expect(result.current.records[0]?.decision).toBe('allowed');
  });

  it('não escreve no store global nem no estado depois do unmount', async () => {
    const principal = deferido<{ data: QuarantineRecord[]; count: number }>();
    let chamadas = 0;
    queryExternalProxy.mockImplementation(() => {
      chamadas += 1;
      if (chamadas === 1) return principal.promise;
      return Promise.resolve({ data: [], count: 0 });
    });

    const { result, unmount } = renderHook(() => useQuarantineMedia());
    unmount();
    await act(async () => {
      principal.resolver({ data: [linha()], count: 1 });
    });

    expect(upsertMany).not.toHaveBeenCalled();
    expect(result.current.records).toEqual([]);
    expect(logError).not.toHaveBeenCalled();
  });
});
