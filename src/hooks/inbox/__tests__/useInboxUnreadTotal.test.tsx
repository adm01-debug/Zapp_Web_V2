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
 *  - recibo de mensagem NOSSA (UPDATE sent→delivered→read) NÃO recalcula o
 *    selo (P1-9): só mensagem do contato com `is_read` mudando;
 *  - rajada de eventos vira UMA recontagem (debounce), não uma por evento;
 *  - reconexão: a VOLTA do canal depois de uma queda revalida (o
 *    `onReconnect` do canal compartilhado) — os eventos que passaram enquanto o
 *    canal estava fora do ar não se recuperam sozinhos;
 *  - desabilitado não consulta nem assina;
 *  - os canais são os GLOBAIS compartilhados (`global-messages-realtime` e
 *    `global-contacts-realtime`): a aba mantém uma assinatura por tabela;
 *  - o total do Teams é exposto pelo MESMO hook via `useTeamUnreadTotal` (lido do
 *    cache do inbox, sem consulta nova);
 *  - o título da aba ganha o prefixo "(n)" com não lidas e volta ao normal
 *    quando zera.
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface RealtimeConfigMock {
  channelName: string;
  table: string;
  enabled?: boolean;
  onInsert?: (p: unknown) => void;
  onUpdate?: (p: unknown) => void;
  onDelete?: (p: unknown) => void;
  onAll?: (p: unknown) => void;
  onReconnect?: () => void;
}

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  realtime: [] as RealtimeConfigMock[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  },
}));

// O canal real (compartilhado por nome, com contagem de donos) é coberto nos
// testes de useSupabaseRealtime; aqui interessa o que o selo assina e faz.
vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: RealtimeConfigMock) => {
    if (config.enabled === false) return;
    const i = mocks.realtime.findIndex((c) => c.table === config.table);
    if (i >= 0) mocks.realtime[i] = config; else mocks.realtime.push(config);
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

import { useInboxUnreadTotal } from '../useInboxUnreadTotal';
import { teamUnreadTotalQueryKey } from '@/hooks/team-chat/useTeamUnreadTotal';

/** Dispara um evento no canal compartilhado da tabela. */
function emitir(table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE' = 'INSERT', payload: Record<string, unknown> = {}) {
  const cfg = mocks.realtime.find((c) => c.table === table);
  const full = { eventType, new: {}, old: {}, ...payload };
  cfg?.onAll?.(full);
  if (eventType === 'INSERT') cfg?.onInsert?.(full);
  if (eventType === 'UPDATE') cfg?.onUpdate?.(full);
  if (eventType === 'DELETE') cfg?.onDelete?.(full);
}

function mockChannel() {
  return {
    emitirTabela: (table: string) => emitir(table),
    // O limite de reconexão do useSupabaseRealtime é por identidade do callback:
    // os dois canais usam o MESMO callback, então a queda vira uma recontagem só.
    reconectar: () => mocks.realtime.find((c) => c.table === 'messages')?.onReconnect?.(),
    mesmoCallbackDeReconexao: () => new Set(mocks.realtime.map((c) => c.onReconnect)).size === 1,
    tabelas: () => mocks.realtime.map((c) => c.table),
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
  mocks.realtime = [];
  document.title = 'Zapp Web';
  mockTotal(0);
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

  it('recibo de mensagem nossa não recalcula o selo; is_read do contato mudando recalcula', async () => {
    const { result } = renderHook(() => useInboxUnreadTotal(), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(result.current.count).toBe(0));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    // recibo (delivered/read) de mensagem do agente: não é "não lida do contato"
    await act(async () => {
      emitir('messages', 'UPDATE', { new: { sender: 'agent', status: 'read' }, old: { id: 'm1' } });
    });
    await new Promise((r) => setTimeout(r, 700));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    // UPDATE do contato sem mudar is_read (ex.: transcrição): também não
    await act(async () => {
      emitir('messages', 'UPDATE', { new: { sender: 'contact', is_read: false }, old: { is_read: false } });
    });
    await new Promise((r) => setTimeout(r, 700));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    // a conversa foi lida: recalcula
    mockTotal(2);
    await act(async () => {
      emitir('messages', 'UPDATE', { new: { sender: 'contact', is_read: true }, old: { is_read: false } });
    });
    await waitFor(() => expect(result.current.count).toBe(2), { timeout: 2000 });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('reconexão: a volta do canal revalida na hora', async () => {
    const { reconectar, mesmoCallbackDeReconexao } = mockChannel();
    const { result } = renderHook(() => useInboxUnreadTotal(), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(result.current.count).toBe(0));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    expect(mesmoCallbackDeReconexao()).toBe(true);
    mockTotal(5);
    act(() => { reconectar(); });

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
    expect(mocks.realtime).toHaveLength(0);
  });

  it('assina os canais GLOBAIS compartilhados, não um canal exclusivo do selo', async () => {
    const { result } = renderHook(() => useInboxUnreadTotal(), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(result.current.count).toBe(0));

    expect(mocks.realtime.map((c) => [c.table, c.channelName]).sort()).toEqual([
      ['contacts', 'global-contacts-realtime'],
      ['messages', 'global-messages-realtime'],
    ]);
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
  });
});
