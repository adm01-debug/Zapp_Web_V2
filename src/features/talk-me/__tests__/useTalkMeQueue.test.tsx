import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const useSupabaseRealtime = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({ useSupabaseRealtime }));

import { TalkMeConflictError } from '../types';
import { useTalkMeQueue } from '../useTalkMeQueue';

const queueRows = [{
  queue_id: 'queue-1',
  queue_name: 'Comercial',
  queue_color: '#2563eb',
  waiting_count: 1,
  oldest_waiting_at: '2026-09-30T12:00:00.000Z',
}];

const waitingRows = [{
  contact_id: 'contact-1',
  contact_name: 'Ana',
  avatar_url: null,
  company: 'Acme',
  job_title: 'Compradora',
  queue_id: 'queue-1',
  queue_name: 'Comercial',
  queue_color: '#2563eb',
  waiting_since: '2026-09-30T12:00:00.000Z',
  pending_message_count: 2,
  last_message_id: 'message-1',
  last_message_content: 'Olá',
  last_message_type: 'text',
  last_message_media_url: null,
  last_message_caption: null,
  last_message_at: '2026-09-30T12:05:00.000Z',
  total_count: 1,
  queue_position: 1,
}];

const claimRows = [{
  contact_id: 'contact-1',
  queue_id: 'queue-1',
  assigned_to: 'profile-1',
  conversation_status: 'open',
  claimed_at: '2026-09-30T12:10:00.000Z',
}];

const rpcNames = {
  queues: 'talk_me_list_queues',
  waiting: 'talk_me_list_waiting',
  claim: 'talk_me_claim',
} as const;

type RpcHandler = () => unknown;
type RpcHandlers = Partial<Record<keyof typeof rpcNames, RpcHandler>>;

function waitingRequest(data = waitingRows) {
  return {
    abortSignal: vi.fn(async () => ({ data, error: null })),
  };
}

function installRpcHandlers(overrides: RpcHandlers = {}) {
  const handlers: Record<keyof typeof rpcNames, RpcHandler> = {
    queues: () => Promise.resolve({ data: queueRows, error: null }),
    waiting: () => waitingRequest(),
    claim: () => Promise.resolve({ data: claimRows, error: null }),
    ...overrides,
  };

  rpc.mockImplementation((name: string) => {
    const entry = Object.entries(rpcNames).find(([, rpcName]) => rpcName === name);
    if (!entry) throw new Error(`RPC inesperada: ${name}`);
    return handlers[entry[0] as keyof typeof rpcNames]();
  });
}

function rpcCallCount(name: typeof rpcNames[keyof typeof rpcNames]) {
  return rpc.mock.calls.filter(([calledName]) => calledName === name).length;
}

function expectQueueAndWaitingCalls(queueCount: number, waitingCount: number) {
  expect(rpcCallCount(rpcNames.queues)).toBe(queueCount);
  expect(rpcCallCount(rpcNames.waiting)).toBe(waitingCount);
}

async function advanceTimers(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

async function renderLoadedQueue() {
  const rendered = renderHook(() => useTalkMeQueue(true));
  await waitFor(() => expect(rendered.result.current.items).toHaveLength(1));
  return rendered;
}

function latestRealtimeSubscription(channelName: string) {
  const subscriptions = useSupabaseRealtime.mock.calls
    .map(([options]) => options)
    .filter((options) => options.channelName === channelName);
  return subscriptions[subscriptions.length - 1];
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
}

describe('useTalkMeQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    setDocumentHidden(false);
    installRpcHandlers();
  });

  it('não consulta as RPCs enquanto a feature flag está desabilitada', async () => {
    const { result } = renderHook(() => useTalkMeQueue(false, false));

    await waitFor(() => expect(result.current.queuesLoading).toBe(false));
    expect(result.current.queues).toEqual([]);
    expect(result.current.items).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    expect(useSupabaseRealtime.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(useSupabaseRealtime.mock.calls.every(([options]) => options.enabled === false)).toBe(true);
  });

  it('carrega apenas a fila autorizada, normaliza os dados e remove o contato após o aceite', async () => {
    const { result } = renderHook(() => useTalkMeQueue(true));

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.selectedQueue?.name).toBe('Comercial');
    expect(result.current.items[0]).toMatchObject({
      contactId: 'contact-1',
      pendingMessageCount: 2,
      position: 1,
    });

    await act(async () => {
      await result.current.claim('contact-1');
    });
    expect(result.current.items).toHaveLength(0);
    expect(rpc).toHaveBeenCalledWith('talk_me_claim', { p_contact_id: 'contact-1' });
  });

  it('bloqueia duplo clique local enquanto o primeiro aceite aguarda o servidor', async () => {
    let resolveClaim!: (value: unknown) => void;
    const deferred = new Promise((resolve) => { resolveClaim = resolve; });
    installRpcHandlers({ claim: () => deferred });
    const { result } = await renderLoadedQueue();

    let firstClaim!: Promise<unknown>;
    act(() => { firstClaim = result.current.claim('contact-1'); });
    await expect(result.current.claim('contact-1')).rejects.toBeInstanceOf(TalkMeConflictError);

    resolveClaim({ data: claimRows, error: null });
    await act(async () => { await firstClaim; });
    expect(rpcCallCount(rpcNames.claim)).toBe(1);
  });

  it('libera a conversa assim que o aceite confirma sem aguardar a atualização secundária do badge', async () => {
    let resolveQueueRefresh!: (value: unknown) => void;
    const queueRefresh = new Promise((resolve) => { resolveQueueRefresh = resolve; });
    let queueCall = 0;
    installRpcHandlers({
      queues: () => {
        queueCall += 1;
        return queueCall === 1 ? Promise.resolve({ data: queueRows, error: null }) : queueRefresh;
      },
    });
    const { result } = await renderLoadedQueue();

    let claimResult;
    await act(async () => { claimResult = await result.current.claim('contact-1'); });

    expect(claimResult).toMatchObject({ contactId: 'contact-1', assignedTo: 'profile-1' });
    expect(result.current.claimingContactId).toBeNull();
    expect(result.current.items).toEqual([]);
    resolveQueueRefresh({ data: [{ ...queueRows[0], waiting_count: 0 }], error: null });
    await act(async () => { await queueRefresh; });
  });

  it('mantém o aceite confirmado mesmo se a atualização secundária do badge falhar', async () => {
    let queueCall = 0;
    installRpcHandlers({
      queues: () => {
        queueCall += 1;
        return queueCall === 1
          ? Promise.resolve({ data: queueRows, error: null })
          : Promise.reject(new Error('rede indisponível'));
      },
    });
    const { result } = await renderLoadedQueue();

    let claimResult;
    await act(async () => { claimResult = await result.current.claim('contact-1'); });

    expect(claimResult).toMatchObject({ contactId: 'contact-1' });
    await waitFor(() => expect(result.current.queuesError).toBe('Não foi possível atualizar as filas.'));
  });

  it('traduz conflito do banco em erro de domínio sem abrir conversa incorreta', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'talk_me_list_queues') return Promise.resolve({ data: queueRows, error: null });
      if (name === 'talk_me_list_waiting') return waitingRequest();
      if (name === 'talk_me_claim') return Promise.resolve({ data: null, error: { message: 'talk_me_unavailable' } });
      throw new Error(`RPC inesperada: ${name}`);
    });
    const { result } = renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await expect(result.current.claim('contact-1')).rejects.toBeInstanceOf(TalkMeConflictError);
    });
    expect(result.current.items).toHaveLength(1);
  });

  it('mantém os resultados protegidos enquanto a nova busca aguarda o debounce', async () => {
    const { result } = renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.setSearch('Beta'));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.searchPending).toBe(true);
  });

  it('não perde a fila quando o usuário digita e apaga antes do debounce', async () => {
    const { result } = renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const waitingCallsBefore = rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting').length;

    vi.useFakeTimers();
    try {
      act(() => result.current.setSearch('termo temporário'));
      expect(result.current.searchPending).toBe(true);
      act(() => result.current.setSearch(''));
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });

      expect(result.current.searchPending).toBe(false);
      expect(result.current.items).toHaveLength(1);
      expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting')).toHaveLength(waitingCallsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignora uma resposta antiga de filas que termina depois da atualização mais nova', async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    let queueCall = 0;
    rpc.mockImplementation((name: string) => {
      if (name === 'talk_me_list_queues') {
        queueCall += 1;
        if (queueCall === 1) return first;
        return Promise.resolve({ data: [{ ...queueRows[0], queue_name: 'Fila atual' }], error: null });
      }
      if (name === 'talk_me_list_waiting') return waitingRequest();
      throw new Error(`RPC inesperada: ${name}`);
    });
    const { result } = renderHook(() => useTalkMeQueue(false));

    await act(async () => { await result.current.refresh(); });
    expect(result.current.queues[0]?.name).toBe('Fila atual');

    resolveFirst({ data: [{ ...queueRows[0], queue_name: 'Fila antiga' }], error: null });
    await act(async () => { await first; });
    expect(result.current.queues[0]?.name).toBe('Fila atual');
  });

  it('atualiza em até dois segundos mesmo sob uma rajada contínua do realtime com a tela aberta', async () => {
    renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_queues')).toHaveLength(1));
    await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting')).toHaveLength(1));
    const contactsSubscription = latestRealtimeSubscription('talk-me-contacts');
    expect(contactsSubscription?.onAll).toBeTypeOf('function');
    expect(contactsSubscription?.enabled).toBe(true);

    vi.useFakeTimers();
    try {
      act(() => contactsSubscription.onAll());
      for (let elapsed = 300; elapsed <= 1_800; elapsed += 300) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(300);
          contactsSubscription.onAll();
        });
      }
      expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_queues')).toHaveLength(1);

      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_queues')).toHaveLength(2);
      expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('escuta todas as entidades publicadas que alteram a elegibilidade enquanto a tela está aberta', async () => {
    renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(latestRealtimeSubscription('talk-me-queue-members')?.enabled).toBe(true));

    expect(latestRealtimeSubscription('talk-me-contacts')).toMatchObject({ table: 'contacts', enabled: true });
    expect(latestRealtimeSubscription('talk-me-messages')).toMatchObject({ table: 'messages', enabled: true });
    expect(latestRealtimeSubscription('talk-me-messages')?.onAll).toBeTypeOf('function');
    expect(latestRealtimeSubscription('talk-me-queues')).toMatchObject({ table: 'queues', enabled: true });
    expect(latestRealtimeSubscription('talk-me-queue-members')).toMatchObject({ table: 'queue_members', enabled: true });
    expect(latestRealtimeSubscription('talk-me-profiles')).toBeUndefined();
    expect(latestRealtimeSubscription('talk-me-feature-flag')).toBeUndefined();
    expect(latestRealtimeSubscription('talk-me-whatsapp-groups')).toBeUndefined();
  });

  it.each([
    'talk-me-queues',
    'talk-me-queue-members',
  ])('reconcilia filas e lista após mudança de elegibilidade em %s', async (channelName) => {
    renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(rpcCallCount(rpcNames.waiting)).toBe(1));
    const queueCallsBefore = rpcCallCount(rpcNames.queues);
    const waitingCallsBefore = rpcCallCount(rpcNames.waiting);

    vi.useFakeTimers();
    try {
      act(() => latestRealtimeSubscription(channelName)?.onAll());
      await advanceTimers(350);
      expectQueueAndWaitingCalls(queueCallsBefore + 1, waitingCallsBefore + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconcilia mudanças raras de elegibilidade a cada 60 segundos enquanto aberto e visível', async () => {
    const { rerender } = renderHook(({ open }) => useTalkMeQueue(open), { initialProps: { open: true } });
    await waitFor(() => expect(rpcCallCount(rpcNames.waiting)).toBe(1));

    rerender({ open: false });
    vi.useFakeTimers();
    try {
      rerender({ open: true });
      await advanceTimers(0);
      const queueCallsBefore = rpcCallCount(rpcNames.queues);
      const waitingCallsBefore = rpcCallCount(rpcNames.waiting);

      await advanceTimers(59_999);
      expectQueueAndWaitingCalls(queueCallsBefore, waitingCallsBefore);

      await advanceTimers(1);
      expectQueueAndWaitingCalls(queueCallsBefore + 1, waitingCallsBefore + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pausa a reconciliação periódica quando oculto ou fechado e atualiza ao voltar a ficar visível', async () => {
    const { rerender } = renderHook(({ open }) => useTalkMeQueue(open), { initialProps: { open: true } });
    await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting')).toHaveLength(1));

    rerender({ open: false });
    setDocumentHidden(true);
    vi.useFakeTimers();
    try {
      rerender({ open: true });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      const hiddenQueueCalls = rpc.mock.calls.filter(([name]) => name === 'talk_me_list_queues').length;
      const hiddenWaitingCalls = rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting').length;

      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_queues')).toHaveLength(hiddenQueueCalls);
      expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting')).toHaveLength(hiddenWaitingCalls);

      setDocumentHidden(false);
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_queues')).toHaveLength(hiddenQueueCalls + 1);
      expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting')).toHaveLength(hiddenWaitingCalls + 1);

      rerender({ open: false });
      const closedCalls = rpc.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(rpc.mock.calls).toHaveLength(closedCalls);
    } finally {
      setDocumentHidden(false);
      vi.useRealTimers();
    }
  });

  it('remove intervalo e listener de visibilidade ao desmontar', async () => {
    const { rerender, unmount } = renderHook(({ open }) => useTalkMeQueue(open), { initialProps: { open: true } });
    await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting')).toHaveLength(1));

    rerender({ open: false });
    vi.useFakeTimers();
    try {
      rerender({ open: true });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      unmount();
      const callsBeforeCleanupCheck = rpc.mock.calls.length;

      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(rpc.mock.calls).toHaveLength(callsBeforeCleanupCheck);
    } finally {
      vi.useRealTimers();
    }
  });

  it('não faz fan-out fechado, preserva o badge e reconcilia filas e itens ao abrir', async () => {
    let queueCall = 0;
    rpc.mockImplementation((name: string) => {
      if (name === 'talk_me_list_queues') {
        queueCall += 1;
        return Promise.resolve({ data: [{ ...queueRows[0], waiting_count: queueCall }], error: null });
      }
      if (name === 'talk_me_list_waiting') return waitingRequest();
      throw new Error(`RPC inesperada: ${name}`);
    });
    const { result, rerender } = renderHook(({ open }) => useTalkMeQueue(open), { initialProps: { open: false } });
    await waitFor(() => expect(result.current.selectedQueue?.waitingCount).toBe(1));

    expect(latestRealtimeSubscription('talk-me-contacts')?.enabled).toBe(false);
    expect(latestRealtimeSubscription('talk-me-messages')?.enabled).toBe(false);
    const queueCallsClosed = rpc.mock.calls.filter(([name]) => name === 'talk_me_list_queues').length;
    const closedCallback = latestRealtimeSubscription('talk-me-contacts')?.onAll;
    vi.useFakeTimers();
    try {
      act(() => closedCallback?.());
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_queues')).toHaveLength(queueCallsClosed);
      expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting')).toHaveLength(0);
      expect(result.current.selectedQueue?.waitingCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }

    rerender({ open: true });
    await waitFor(() => expect(result.current.selectedQueue?.waitingCount).toBe(2));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(latestRealtimeSubscription('talk-me-contacts')?.enabled).toBe(true);
  });

  it('cancela refresh realtime agendado se a tela fechar antes do debounce', async () => {
    const { rerender } = renderHook(({ open }) => useTalkMeQueue(open), { initialProps: { open: true } });
    await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting')).toHaveLength(1));

    vi.useFakeTimers();
    try {
      act(() => latestRealtimeSubscription('talk-me-contacts')?.onAll());
      const callsBeforeClose = rpc.mock.calls.length;
      rerender({ open: false });
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      expect(rpc.mock.calls).toHaveLength(callsBeforeClose);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserva os cartões existentes quando apenas o carregamento adicional falha', async () => {
    let waitingCall = 0;
    rpc.mockImplementation((name: string) => {
      if (name === 'talk_me_list_queues') return Promise.resolve({ data: queueRows, error: null });
      if (name === 'talk_me_list_waiting') {
        waitingCall += 1;
        if (waitingCall === 1) return waitingRequest([{ ...waitingRows[0], total_count: 51 }]);
        return { abortSignal: vi.fn(async () => ({ data: null, error: { message: 'falha de rede' } })) };
      }
      throw new Error(`RPC inesperada: ${name}`);
    });
    const { result } = renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => { await result.current.loadMore(); });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.itemsError).toBeNull();
    expect(result.current.loadMoreError).toBe('Não foi possível carregar mais atendimentos.');
  });

  it('impede paginações simultâneas e descarta a resposta ao trocar a busca', async () => {
    let resolveAppend!: (value: unknown) => void;
    const appendResponse = new Promise((resolve) => { resolveAppend = resolve; });
    let waitingCall = 0;
    rpc.mockImplementation((name: string) => {
      if (name === 'talk_me_list_queues') return Promise.resolve({ data: queueRows, error: null });
      if (name === 'talk_me_list_waiting') {
        waitingCall += 1;
        if (waitingCall === 1) return waitingRequest([{ ...waitingRows[0], total_count: 51 }]);
        return { abortSignal: vi.fn(() => appendResponse) };
      }
      throw new Error(`RPC inesperada: ${name}`);
    });
    const { result } = renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let firstLoad!: Promise<boolean>;
    act(() => { firstLoad = result.current.loadMore(); });
    await waitFor(() => expect(result.current.loadingMore).toBe(true));
    await expect(result.current.loadMore()).resolves.toBe(false);
    expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_waiting')).toHaveLength(2);

    act(() => result.current.setSearch('nova busca'));
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.items).toHaveLength(1);

    resolveAppend({ data: [{ ...waitingRows[0], contact_id: 'stale-contact' }], error: null });
    await act(async () => { await firstLoad; });
    expect(result.current.items.map((item) => item.contactId)).toEqual(['contact-1']);
  });

  it('aborta a consulta da lista ao desmontar sem reaplicar a resposta tardia', async () => {
    let resolveWaiting!: (value: unknown) => void;
    const waiting = new Promise((resolve) => { resolveWaiting = resolve; });
    const abortSignal = vi.fn((_signal: AbortSignal) => waiting);
    rpc.mockImplementation((name: string) => {
      if (name === 'talk_me_list_queues') return Promise.resolve({ data: queueRows, error: null });
      if (name === 'talk_me_list_waiting') return { abortSignal };
      throw new Error(`RPC inesperada: ${name}`);
    });
    const { unmount } = renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(abortSignal).toHaveBeenCalled());
    const signal = abortSignal.mock.calls[0]?.[0];

    unmount();
    expect(signal?.aborted).toBe(true);
    resolveWaiting({ data: waitingRows, error: null });
    await waiting;
  });

  it('restaura a profundidade já carregada ao atualizar uma fila paginada', async () => {
    const makeRow = (index: number) => ({
      ...waitingRows[0],
      contact_id: `contact-${index}`,
      contact_name: `Contato ${index}`,
      last_message_id: `message-${index}`,
      total_count: 51,
      queue_position: index,
    });
    const firstPage = Array.from({ length: 50 }, (_, index) => makeRow(index + 1));
    const secondPage = [makeRow(51)];
    let waitingCall = 0;
    rpc.mockImplementation((name: string) => {
      if (name === 'talk_me_list_queues') return Promise.resolve({ data: [{ ...queueRows[0], waiting_count: 51 }], error: null });
      if (name === 'talk_me_list_waiting') {
        waitingCall += 1;
        return waitingRequest(waitingCall % 2 === 1 ? firstPage : secondPage);
      }
      throw new Error(`RPC inesperada: ${name}`);
    });
    const { result } = renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.items).toHaveLength(51);

    await act(async () => { await result.current.refresh(); });

    expect(result.current.items).toHaveLength(51);
    expect(result.current.items[result.current.items.length - 1]?.contactId).toBe('contact-51');
    expect(result.current.reconciling).toBe(false);
  });

  it('alcança o último atendimento de uma fila com 500 itens sem duplicar identidades', async () => {
    const makeRow = (index: number) => ({
      ...waitingRows[0],
      contact_id: `contact-${index}`,
      contact_name: `Contato ${index}`,
      last_message_id: `message-${index}`,
      total_count: 500,
      queue_position: index,
    });
    const pages = Array.from({ length: 10 }, (_, page) => (
      Array.from({ length: 50 }, (_, index) => makeRow(page * 50 + index + 1))
    ));
    let waitingCall = 0;
    rpc.mockImplementation((name: string) => {
      if (name === 'talk_me_list_queues') return Promise.resolve({ data: [{ ...queueRows[0], waiting_count: 500 }], error: null });
      if (name === 'talk_me_list_waiting') {
        const page = pages[waitingCall] ?? [];
        waitingCall += 1;
        return waitingRequest(page);
      }
      throw new Error(`RPC inesperada: ${name}`);
    });
    const { result } = renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(result.current.items).toHaveLength(50));

    for (let page = 1; page < pages.length; page += 1) {
      await act(async () => { await result.current.loadMore(); });
    }

    expect(result.current.items).toHaveLength(500);
    expect(new Set(result.current.items.map((item) => item.contactId))).toHaveProperty('size', 500);
    expect(result.current.items[499]?.contactId).toBe('contact-500');
    expect(result.current.hasMore).toBe(false);
  });
});
