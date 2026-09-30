import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({ useSupabaseRealtime: vi.fn() }));

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

    await expect(result.current.claim('contact-1')).rejects.toBeInstanceOf(TalkMeConflictError);
    expect(result.current.items).toHaveLength(1);
  });
});
