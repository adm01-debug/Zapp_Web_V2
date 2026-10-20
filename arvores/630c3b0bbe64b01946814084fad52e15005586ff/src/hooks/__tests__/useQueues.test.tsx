/**
 * R2-QUE-002 (item 106 / P1): useQueues sobrescrevia `waiting_count` com 0 e
 * QueuesView usa esse valor nos alertas configurados de fila — a tela mostrava
 * "0 aguardando" e nenhum alerta de espera/atribuição disparava.
 *
 * O teste abaixo fixa a contagem real por fila: o PostgREST devolve
 * `count: 'exact'` (head) para os contatos da fila sem responsável. No código
 * anterior (waiting_count hardcoded 0) o primeiro caso falha (0 ≠ 2).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockQueues = [
  { id: 'q1', name: 'Suporte', color: '#blue', is_active: true, max_wait_time_minutes: 30, priority: 1, description: null, created_at: '', updated_at: '' },
  { id: 'q2', name: 'Vendas', color: '#green', is_active: true, max_wait_time_minutes: 15, priority: 2, description: null, created_at: '', updated_at: '' },
];

const mockMembers = [
  { id: 'm1', queue_id: 'q1', profile_id: 'p1', is_active: true, created_at: '', profile: { id: 'p1', name: 'Agent 1', avatar_url: null, is_active: true } },
];

// Contagem real devolvida pelo PostgREST por fila (count exact + head).
const mockWaitingCounts: Record<string, number> = { q1: 2, q2: 0 };

function contactsCountBuilder(queueIdRef: { id: string }) {
  return {
    eq: vi.fn((column: string, value: unknown) => {
      if (column === 'queue_id') queueIdRef.id = String(value);
      return contactsCountBuilder(queueIdRef);
    }),
    is: vi.fn(() => contactsCountBuilder(queueIdRef)),
    not: vi.fn(() =>
      Promise.resolve({ count: mockWaitingCounts[queueIdRef.id] ?? 0, error: null }),
    ),
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'queues') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockQueues, error: null }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'q3', name: 'New' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'queue_members') {
        return {
          select: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
          insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      if (table === 'contacts') {
        return {
          select: vi.fn(() => contactsCountBuilder({ id: '' })),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useQueues } from '@/hooks/business/useQueues';

describe('useQueues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches queues with members and waiting counts', async () => {
    const { result } = renderHook(() => useQueues());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.queues).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('maps members to correct queues', async () => {
    const { result } = renderHook(() => useQueues());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const suporteQueue = result.current.queues.find(q => q.name === 'Suporte');
    expect(suporteQueue?.members).toHaveLength(1);
    expect(suporteQueue?.members[0].profile?.name).toBe('Agent 1');
  });

  it('exposes the real waiting count per queue (R2-QUE-002)', async () => {
    const { result } = renderHook(() => useQueues());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.queues.find(q => q.name === 'Suporte')?.waiting_count).toBe(2);
    expect(result.current.queues.find(q => q.name === 'Vendas')?.waiting_count).toBe(0);
  });

  it('returns loading=true initially', () => {
    const { result } = renderHook(() => useQueues());
    expect(result.current.loading).toBe(true);
  });
});
