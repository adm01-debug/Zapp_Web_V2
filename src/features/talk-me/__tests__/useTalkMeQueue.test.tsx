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

function waitingRequest(data = waitingRows) {
  return {
    abortSignal: vi.fn(async () => ({ data, error: null })),
  };
}

describe('useTalkMeQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    rpc.mockImplementation((name: string) => {
      if (name === 'talk_me_list_queues') return Promise.resolve({ data: queueRows, error: null });
      if (name === 'talk_me_list_waiting') return waitingRequest();
      if (name === 'talk_me_claim') return Promise.resolve({
        data: [{
          contact_id: 'contact-1',
          queue_id: 'queue-1',
          assigned_to: 'profile-1',
          conversation_status: 'open',
          claimed_at: '2026-09-30T12:10:00.000Z',
        }],
        error: null,
      });
      throw new Error(`RPC inesperada: ${name}`);
    });
  });

  it('não consulta as RPCs enquanto a feature flag está desabilitada', async () => {
    const { result } = renderHook(() => useTalkMeQueue(false, false));

    await waitFor(() => expect(result.current.queuesLoading).toBe(false));
    expect(result.current.queues).toEqual([]);
    expect(result.current.items).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    expect(useSupabaseRealtime.mock.calls.length).toBeGreaterThanOrEqual(2);
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
    rpc.mockImplementation((name: string) => {
      if (name === 'talk_me_list_queues') return Promise.resolve({ data: queueRows, error: null });
      if (name === 'talk_me_list_waiting') return waitingRequest();
      if (name === 'talk_me_claim') return deferred;
      throw new Error(`RPC inesperada: ${name}`);
    });
    const { result } = renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let firstClaim!: Promise<unknown>;
    act(() => { firstClaim = result.current.claim('contact-1'); });
    await expect(result.current.claim('contact-1')).rejects.toBeInstanceOf(TalkMeConflictError);

    resolveClaim({
      data: [{
        contact_id: 'contact-1',
        queue_id: 'queue-1',
        assigned_to: 'profile-1',
        conversation_status: 'open',
        claimed_at: '2026-09-30T12:10:00.000Z',
      }],
      error: null,
    });
    await act(async () => { await firstClaim; });
    expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_claim')).toHaveLength(1);
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

  it('remove resultados antigos imediatamente ao alterar a busca', async () => {
    const { result } = renderHook(() => useTalkMeQueue(true));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.setSearch('Beta'));

    expect(result.current.items).toEqual([]);
    expect(result.current.searchPending).toBe(true);
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

  it('atualiza em até dois segundos mesmo sob uma rajada contínua do realtime', async () => {
    renderHook(() => useTalkMeQueue(false));
    await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === 'talk_me_list_queues')).toHaveLength(1));
    const contactsSubscription = useSupabaseRealtime.mock.calls
      .map(([options]) => options)
      .find((options) => options.channelName === 'talk-me-contacts');
    expect(contactsSubscription?.onAll).toBeTypeOf('function');

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
    expect(result.current.items).toEqual([]);

    resolveAppend({ data: [{ ...waitingRows[0], contact_id: 'stale-contact' }], error: null });
    await act(async () => { await firstLoad; });
    expect(result.current.items).toEqual([]);
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
