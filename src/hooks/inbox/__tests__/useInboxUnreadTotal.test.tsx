/**
 * PE-30 — o selo de não lidas do Chat (barra lateral, barra inferior do celular e
 * título da aba) vivia fixo em 0.
 *
 * O que este teste prova (e por que cada asserção existe):
 *  - o número sai da RPC `inbox_unread_total()` — uma chamada leve, em vez de
 *    baixar a lista de conversas (`get_inbox_contact_summaries` por contato) só
 *    para somar;
 *  - a RPC é chamada SEM parâmetro (Args: never em `types.ts`): argumento indo
 *    `undefined` some do JSON e vira erro de assinatura no PostgREST;
 *  - erro da RPC NÃO lança: vira `isError` com `count: 0`, para a barra lateral
 *    não quebrar nem mostrar selo errado;
 *  - OS DOIS canais revalidam: `messages` (chegou mensagem / foi lida) e
 *    `contacts` (o recorte de contatos visíveis mudou) — um escopo que valesse
 *    só para a leitura inicial deixaria o selo velho na tela;
 *  - rajada de eventos vira UMA recontagem (debounce), não uma por evento;
 *  - reconexão: a PRIMEIRA inscrição não dispara consulta nova (a consulta
 *    inicial já cobre), mas a VOLTA do canal depois de uma queda revalida — os
 *    eventos que passaram enquanto o canal estava fora do ar não se recuperam
 *    sozinhos;
 *  - desabilitado não consulta nem assina;
 *  - tópico exclusivo por instância (dois consumidores simultâneos não podem
 *    dividir `supabase.channel` — ver src/lib/realtimeTopic.ts) e canal limpo ao
 *    desmontar;
 *  - o total do Teams é exposto pelo MESMO hook via `useTeamUnreadTotal` (lido do
 *    cache do inbox, sem consulta nova);
 *  - o título da aba ganha o prefixo "(n)" com não lidas e volta ao normal
 *    quando zera.
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    channel: (...args: unknown[]) => mocks.channel(...args),
    removeChannel: (...args: unknown[]) => mocks.removeChannel(...args),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

import { useInboxUnreadTotal } from '../useInboxUnreadTotal';
import { teamUnreadTotalQueryKey } from '@/hooks/team-chat/useTeamUnreadTotal';

/** Canal de realtime falso: guarda o callback de status e os handlers por tabela. */
function mockChannel() {
  const handlers = new Map<string, () => void>();
  let subscribeCb: ((status: string) => void) | undefined;
  const channel = {
    on: vi.fn((_event: string, filter: { table: string }, callback: () => void) => {
      handlers.set(filter.table, callback);
      return channel;
    }),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      subscribeCb = cb;
      return channel;
    }),
  };
  mocks.channel.mockReturnValue(channel);
  return {
    channel,
    emitirTabela: (table: string) => handlers.get(table)?.(),
    emitirStatus: (status: string) => subscribeCb?.(status),
    tabelas: () => Array.from(handlers.keys()),
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function mockTotal(valor: number | null, error: { message: string } | null = null) {
  mocks.rpc.mockResolvedValue({ data: valor, error });
}

function esconderAba() {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
}

beforeEach(() => {
  vi.clearAllMocks();
  document.title = 'Zapp Web';
  mockTotal(0);
  mockChannel();
});

afterEach(() => {
  Reflect.deleteProperty(document, 'hidden');
  document.title = 'Zapp Web';
});

describe('useInboxUnreadTotal — selo do Chat, título da aba e total do Teams', () => {
  it('conta as conversas não lidas com a RPC inbox_unread_total, sem parâmetro', async () => {
    mockTotal(7);
    const { result } = renderHook(() => useInboxUnreadTotal(), { wrapper: createWrapper().wrapper });

    expect(result.current.count).toBe(0);
    await waitFor(() => expect(result.current.count).toBe(7));

    // Args: never — qualquer argumento mudaria a assinatura resolvida pelo PostgREST.
    expect(mocks.rpc.mock.calls).toEqual([['inbox_unread_total']]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('não lança e zera o selo quando a RPC falha (a barra lateral não pode quebrar)', async () => {
    mockTotal(null, { message: 'permission denied' });
    const { result } = renderHook(() => useInboxUnreadTotal(), { wrapper: createWrapper().wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.count).toBe(0);
  });

  it('revalida por realtime nos DOIS canais: messages e contacts', async () => {
    const { emitirTabela, tabelas } = mockChannel();
    const { result } = renderHook(() => useInboxUnreadTotal(), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(result.current.count).toBe(0));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(tabelas().sort()).toEqual(['contacts', 'messages']);

    // mensagem do contato chegou / foi lida
    mockTotal(3);
    await act(async () => { emitirTabela('messages'); });
    await waitFor(() => expect(result.current.count).toBe(3), { timeout: 2000 });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);

    // o recorte de contatos visíveis ao usuário mudou
    mockTotal(4);
    await act(async () => { emitirTabela('contacts'); });
    await waitFor(() => expect(result.current.count).toBe(4), { timeout: 2000 });
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
  });

  it('rajada de eventos vira UMA recontagem (debounce), não uma por evento', async () => {
    const { emitirTabela } = mockChannel();
    const { result } = renderHook(() => useInboxUnreadTotal(), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(result.current.count).toBe(0));

    mockTotal(9);
    await act(async () => {
      emitirTabela('messages');
      emitirTabela('messages');
      emitirTabela('messages');
    });

    await waitFor(() => expect(result.current.count).toBe(9), { timeout: 2000 });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('reconexão: a primeira inscrição não consulta de novo; a volta do canal revalida', async () => {
    const { emitirStatus } = mockChannel();
    const { result } = renderHook(() => useInboxUnreadTotal(), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(result.current.count).toBe(0));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    // primeira inscrição: a consulta inicial já cobre, nada de consulta extra
    act(() => { emitirStatus('SUBSCRIBED'); });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    // caiu: os eventos desta janela se perdem
    act(() => { emitirStatus('CHANNEL_ERROR'); });

    mockTotal(5);
    act(() => { emitirStatus('SUBSCRIBED'); });

    await waitFor(() => expect(result.current.count).toBe(5));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('desabilitado não consulta nem assina e fica sem selo', async () => {
    const { result } = renderHook(
      () => useInboxUnreadTotal(false),
      { wrapper: createWrapper().wrapper },
    );

    expect(result.current.count).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it('tópico exclusivo por instância e canal limpo ao desmontar', async () => {
    const { channel } = mockChannel();
    const { result, unmount } = renderHook(
      () => useInboxUnreadTotal(),
      { wrapper: createWrapper().wrapper },
    );
    await waitFor(() => expect(result.current.count).toBe(0));

    // segundo consumidor simultâneo (barra lateral + barra do celular)
    renderHook(() => useInboxUnreadTotal(), { wrapper: createWrapper().wrapper });

    const nomes = mocks.channel.mock.calls.map(call => call[0] as string);
    expect(nomes).toHaveLength(2);
    expect(nomes[0]).not.toBe(nomes[1]);
    expect(nomes[0].startsWith('inbox-unread-total')).toBe(true);

    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('expõe o total do Teams lido do cache do inbox, sem consulta nova', async () => {
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(teamUnreadTotalQueryKey('profile-1'), [
      { id: 'c1', unread_count: 3 },
      { id: 'c2', unread_count: 5 },
    ]);
    mockTotal(2);

    const { result } = renderHook(() => useInboxUnreadTotal(), { wrapper });

    await waitFor(() => expect(result.current.count).toBe(2));
    expect(result.current.teams).toBe(8);
    // uma consulta só: a RPC do Chat. O Teams vem do cache do inbox.
    expect(mocks.rpc.mock.calls).toEqual([['inbox_unread_total']]);
  });

  it('título da aba: "(n)" com a aba em segundo plano e sem prefixo quando zera', async () => {
    esconderAba();
    mockTotal(3);

    const { result } = renderHook(() => useInboxUnreadTotal(), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(document.title).toBe('(3) Zapp Web'));

    // abriu a aba: prefixo sai sem perder a contagem
    Reflect.deleteProperty(document, 'hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(document.title).toBe('Zapp Web'));
    expect(result.current.count).toBe(3);

    // zerou: continua sem prefixo
    mockTotal(0);
    await act(async () => { result.current.refetch(); });
    await waitFor(() => expect(result.current.count).toBe(0));
    expect(document.title).toBe('Zapp Web');
  });

  it('resposta atrasada depois do desmonte não quebra nem escreve no título', async () => {
    esconderAba();
    let responder: (valor: { data: number | null; error: null }) => void = () => {};
    mocks.rpc.mockReturnValue(new Promise(resolve => { responder = resolve; }));

    const { result, unmount } = renderHook(() => useInboxUnreadTotal(), { wrapper: createWrapper().wrapper });
    expect(result.current.count).toBe(0);

    unmount();
    await act(async () => { responder({ data: 3, error: null }); });

    // a tela já saiu: nem contagem nova nem "(3)" pendurado no título
    expect(document.title).toBe('Zapp Web');
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
  });
});
