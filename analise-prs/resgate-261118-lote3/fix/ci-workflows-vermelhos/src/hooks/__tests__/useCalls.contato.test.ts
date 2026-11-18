import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// `calls.contact_id` é uuid: a guarda existe para o id vindo do roteador (JID
// de link direto) não virar um 400 do PostgREST e sim lista vazia.
const UUID_VALIDO = '11111111-1111-4111-8111-111111111111';

type Resposta = { data: unknown[]; error: unknown };

const estado = vi.hoisted(() => ({
  from: vi.fn(),
  idsConsultados: [] as string[],
  sinais: [] as AbortSignal[],
  resposta: { data: [] as unknown[], error: null as unknown } as Resposta,
  // Quando ligado, a consulta só resolve quando o teste chamar `solte`.
  modoPendente: false,
  controlada: null as null | Promise<Resposta>,
  solte: null as null | ((v: Resposta) => void),
}));

vi.mock('@/integrations/supabase/client', () => {
  interface Busca {
    abortSignal: (s: AbortSignal) => Busca;
    order: () => Busca;
    then: (res: (v: Resposta) => unknown, rej?: (e: unknown) => unknown) => unknown;
  }

  function criarBusca(contactId: string): Busca {
    estado.idsConsultados.push(contactId);
    if (estado.modoPendente) {
      estado.controlada = new Promise<Resposta>((resolve) => {
        estado.solte = resolve;
      });
    }
    const busca: Busca = {
      abortSignal: (s: AbortSignal) => {
        estado.sinais.push(s);
        return busca;
      },
      order: () => busca,
      then: (res, rej) => (estado.controlada ?? Promise.resolve(estado.resposta)).then(res, rej),
    };
    return busca;
  }

  estado.from.mockImplementation((_tabela: string) => ({
    select: () => ({
      eq: (_coluna: string, id: string) => criarBusca(id),
    }),
  }));

  return {
    supabase: { from: estado.from, rpc: vi.fn(), auth: { getUser: vi.fn() } },
  };
});

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { useCalls, isValidUUID } from '../communication/useCalls';

describe('useCalls.getContactCalls — guarda de uuid e cancelamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.idsConsultados = [];
    estado.sinais = [];
    estado.modoPendente = false;
    estado.controlada = null;
    estado.solte = null;
    estado.resposta = { data: [], error: null };
  });

  it('id que não é uuid não chega ao banco', async () => {
    const { result } = renderHook(() => useCalls());
    let calls: unknown = ['ainda-nao'];
    await act(async () => {
      calls = await result.current.getContactCalls('contact-1');
    });
    expect(calls).toEqual([]);
    expect(estado.from).not.toHaveBeenCalled();
    expect(estado.idsConsultados).toEqual([]);
  });

  it('id válido consulta a tabela calls e devolve as linhas', async () => {
    estado.resposta = { data: [{ id: 'call-1', contact_id: UUID_VALIDO }], error: null };
    const { result } = renderHook(() => useCalls());
    let calls: unknown = [];
    await act(async () => {
      calls = await result.current.getContactCalls(UUID_VALIDO);
    });
    expect(estado.from).toHaveBeenCalledWith('calls');
    expect(estado.idsConsultados).toEqual([UUID_VALIDO]);
    expect(calls).toEqual([{ id: 'call-1', contact_id: UUID_VALIDO }]);
  });

  it('liga o AbortSignal do chamador à consulta', async () => {
    const controller = new AbortController();
    const { result } = renderHook(() => useCalls());
    await act(async () => {
      await result.current.getContactCalls(UUID_VALIDO, controller.signal);
    });
    expect(estado.sinais).toEqual([controller.signal]);
  });

  it('busca cancelada não devolve a resposta atrasada', async () => {
    estado.modoPendente = true;
    const controller = new AbortController();
    const { result } = renderHook(() => useCalls());

    let promessa: Promise<unknown> | undefined;
    act(() => {
      promessa = result.current.getContactCalls(UUID_VALIDO, controller.signal);
    });

    // O id válido montou a consulta: o sinal já foi ligado e a resposta está presa.
    expect(estado.sinais).toEqual([controller.signal]);
    controller.abort();
    estado.solte?.({ data: [{ id: 'atrasada' }], error: null });

    let calls: unknown = ['ainda-nao'];
    await act(async () => {
      calls = await promessa!;
    });
    expect(calls).toEqual([]);
  });

  it('signal já abortado nem chega a consultar', async () => {
    const controller = new AbortController();
    controller.abort();
    const { result } = renderHook(() => useCalls());
    let calls: unknown = ['ainda-nao'];
    await act(async () => {
      calls = await result.current.getContactCalls(UUID_VALIDO, controller.signal);
    });
    expect(calls).toEqual([]);
    expect(estado.from).not.toHaveBeenCalled();
  });

  it('isValidUUID reconhece uuid e recusa o resto', () => {
    expect(isValidUUID(UUID_VALIDO)).toBe(true);
    expect(isValidUUID('contact-1')).toBe(false);
    expect(isValidUUID('')).toBe(false);
    expect(isValidUUID(null)).toBe(false);
  });
});
