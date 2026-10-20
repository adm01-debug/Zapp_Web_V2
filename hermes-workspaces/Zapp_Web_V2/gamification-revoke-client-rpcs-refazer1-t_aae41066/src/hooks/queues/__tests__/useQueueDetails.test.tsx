import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * useQueueDetails (R2-QUE-004).
 *
 * Três comportamentos sob teste:
 *  1. enriquecimento AGREGADO — `messages` e `profiles` são lidas UMA vez por `in(...)`,
 *     independentemente do número de contatos da página;
 *  2. id inexistente (`maybeSingle` devolve `null`) → `notFound`, sem erro;
 *  3. falha de leitura (erro na consulta da fila) → `error`, sem `notFound`.
 *  A tela usa os dois últimos para escolher entre "Fila não encontrada" e "Erro ao carregar".
 */

const h = vi.hoisted(() => ({
  tables: [] as string[],
  queue: null as unknown,
  queueError: null as { message: string } | null,
  contacts: [] as Array<Record<string, unknown>>,
  messages: [] as Array<{ contact_id: string; created_at: string }>,
  messagesError: null as { message: string } | null,
  agents: [] as Array<{ id: string; name: string | null; avatar_url: string | null }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      h.tables.push(tabela);
      if (tabela === 'queues') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: h.queue, error: h.queueError }) }) }) };
      }
      if (tabela === 'queue_members') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      if (tabela === 'contacts') {
        return {
          select: (_c?: string, opts?: { count?: string; head?: boolean }) =>
            opts?.head
              ? {
                  eq: () => {
                    const node: Record<string, unknown> = {};
                    node.eq = () => node;
                    node.not = () => node;
                    node.gte = () => node;
                    node.lt = () => node;
                    node.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: null, count: 0, error: null }).then(f);
                    return node;
                  },
                }
              : { eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: h.contacts, error: null }) }) }) },
        };
      }
      if (tabela === 'messages') {
        return {
          select: () => ({
            in: () => ({ order: () => ({ range: () => Promise.resolve({ data: h.messages, error: h.messagesError }) }) }),
          }),
        };
      }
      if (tabela === 'profiles') {
        return { select: () => ({ in: () => Promise.resolve({ data: h.agents, error: null }) }) };
      }
      if (tabela === 'conversation_sla') {
        return { select: () => ({ eq: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }) }) };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
  },
}));

import { useQueueDetails } from '@/hooks/queues/useQueueDetails';

const QUEUE = {
  id: 'q-1', name: 'Fila Comercial', description: null, color: '#3B82F6',
  max_wait_time_minutes: 30, created_at: '2026-01-01T00:00:00Z',
};

const CONTACTS = [
  { id: 'c-1', name: 'Bia', phone: '5511999990001', avatar_url: null, assigned_to: 'p-1', created_at: '2026-10-05T10:00:00Z' },
  { id: 'c-2', name: 'Caio', phone: '5511999990002', avatar_url: null, assigned_to: null, created_at: '2026-10-04T10:00:00Z' },
  { id: 'c-3', name: 'Dora', phone: '5511999990003', avatar_url: null, assigned_to: 'p-1', created_at: '2026-10-03T10:00:00Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.tables.length = 0;
  h.queue = QUEUE;
  h.queueError = null;
  h.contacts = CONTACTS;
  h.messages = [];
  h.messagesError = null;
  h.agents = [{ id: 'p-1', name: 'Ana', avatar_url: null }];
});

describe('useQueueDetails — enriquecimento agregado (R2-QUE-004)', () => {
  it('conta e ordena mensagens e resolve o atendente de cada contato', async () => {
    h.messages = [
      { contact_id: 'c-1', created_at: '2026-10-05T11:00:00Z' },
      { contact_id: 'c-1', created_at: '2026-10-05T13:00:00Z' },
      { contact_id: 'c-3', created_at: '2026-10-03T09:00:00Z' },
    ];

    const { result } = renderHook(() => useQueueDetails('q-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const byId = new Map(result.current.contacts.map((c) => [c.id, c]));
    expect(byId.get('c-1')).toMatchObject({
      messages_count: 2, // não a última mensagem só: a contagem das DUAS
      last_message_at: '2026-10-05T13:00:00Z', // a mais recente, não a primeira lida
      assigned_agent: { name: 'Ana', avatar_url: null },
    });
    expect(byId.get('c-2')).toMatchObject({ messages_count: 0, last_message_at: null, assigned_agent: null });
    expect(byId.get('c-3')).toMatchObject({ messages_count: 1, last_message_at: '2026-10-03T09:00:00Z' });
  });

  it('lê `messages` e `profiles` uma vez cada, sem consulta por contato', async () => {
    const { result } = renderHook(() => useQueueDetails('q-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(h.tables.filter((t) => t === 'messages')).toHaveLength(1);
    expect(h.tables.filter((t) => t === 'profiles')).toHaveLength(1);
    // 3 contatos, 2 com atendente: mesmo assim, uma única consulta de perfis (por `in`).
    expect(h.tables).toHaveLength(9); // queues + members + contacts(página) + 3 contagens + messages + profiles + sla
  });


  it('expõe erro quando a leitura agregada de mensagens fica incompleta', async () => {
    h.messages = [
      { contact_id: 'c-1', created_at: '2026-10-05T11:00:00Z' },
    ];
    h.messagesError = { message: 'messages timeout' };

    const { result } = renderHook(() => useQueueDetails('q-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toContain('messages timeout');
    expect(result.current.contacts[0]).toMatchObject({ messages_count: 0, last_message_at: null });
  });
});

describe('useQueueDetails — erro e não encontrada são estados distintos (R2-QUE-004)', () => {
  it('id inexistente (data null) vira `notFound`, sem erro', async () => {
    h.queue = null;
    h.queueError = null;

    const { result } = renderHook(() => useQueueDetails('q-inexistente'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.queue).toBeNull();
  });

  it('falha de leitura vira `error`, sem `notFound`', async () => {
    h.queue = null;
    h.queueError = { message: 'network error' };

    const { result } = renderHook(() => useQueueDetails('q-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('network error');
    expect(result.current.notFound).toBe(false);
  });
});
