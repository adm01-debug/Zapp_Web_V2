import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';

/**
 * E71 — entregues/lidas saem dos RECIBOS (`team_message_receipts`), um por
 * destinatário, e não da coluna `team_messages.status` (uma só por mensagem).
 * E78 — as duas leituras são paginadas em janelas de 1000 (`.range()`): sem
 * teto a conversa longa transfere tudo de uma vez. A contagem é POR RECIBO
 * (total de recibos por status), não por mensagem distinta.
 */
const h = vi.hoisted(() => ({
  selects: [] as Array<{ table: string; select: string }>,
  eqs: [] as Array<[string, string, unknown]>,
  limits: [] as Array<[string, unknown]>,
  ranges: [] as Array<[string, number, number]>,
  result: {} as Record<string, { data: unknown[] | null; error: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const b = {
      select: (select: string) => {
        h.selects.push({ table, select });
        return b;
      },
      eq: (column: string, value: unknown) => {
        h.eqs.push([table, column, value]);
        return b;
      },
      order: () => b,
      limit: (...args: unknown[]) => {
        h.limits.push([table, args[0]]);
        return Promise.resolve(h.result[table] ?? { data: [], error: null });
      },
      range: (from: number, to: number) => {
        h.ranges.push([table, from, to]);
        const stored = h.result[table] ?? { data: [], error: null };
        if (stored.error) return Promise.resolve({ data: null, error: stored.error });
        const rows = stored.data ?? [];
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      },
      // PostgREST builder é "thenable"; fallback para código sem `.range()`.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(h.result[table] ?? { data: [], error: null }).then(resolve),
    };
    return b;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

import { useParticipantStats } from '../useParticipantStats';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );

describe('useParticipantStats — recibos por destinatário (E71)', () => {
  beforeEach(() => {
    h.selects.length = 0;
    h.eqs.length = 0;
    h.limits.length = 0;
    h.ranges.length = 0;
    h.result = { team_messages: { data: [], error: null }, team_message_receipts: { data: [], error: null } };
  });

  it('conta entregues/lidas pelos recibos e ignora o status da mensagem', async () => {
    h.result.team_messages = {
      data: [
        // `status` continua vindo no payload, mas não pode mais decidir a conta.
        { id: 'm1', sender_id: 'u1', status: 'sent', profiles: { name: 'Ana' } },
        { id: 'm2', sender_id: 'u1', status: 'sent', profiles: { name: 'Ana' } },
        { id: 'm3', sender_id: 'u2', status: 'sent', profiles: { name: 'Bruno' } },
      ],
      error: null,
    };
    h.result.team_message_receipts = {
      data: [
        { message_id: 'm1', status: 'read' },
        { message_id: 'm2', status: 'delivered' },
      ],
      error: null,
    };

    const { result } = renderHook(() => useParticipantStats('conv-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { senderId: 'u1', senderName: 'Ana', sent: 2, delivered: 2, read: 1 },
      { senderId: 'u2', senderName: 'Bruno', sent: 1, delivered: 0, read: 0 },
    ]);

    // O recibo é lido da conversa (RLS `is_team_conversation_member`).
    expect(h.eqs).toContainEqual(['team_message_receipts', 'conversation_id', 'conv-1']);
    expect(h.selects.map((s) => s.table)).toEqual(['team_messages', 'team_message_receipts']);
  });

  it('não corta a conversa em 500 mensagens', async () => {
    const mensagens = Array.from({ length: 600 }, (_, i) => ({
      id: `m${i}`,
      sender_id: i % 2 === 0 ? 'u1' : 'u2',
      profiles: { name: i % 2 === 0 ? 'Ana' : 'Bruno' },
    }));
    h.result.team_messages = { data: mensagens, error: null };
    h.result.team_message_receipts = {
      data: mensagens.slice(0, 10).map((m) => ({ message_id: m.id, status: 'read' })),
      error: null,
    };

    const { result } = renderHook(() => useParticipantStats('conv-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((p) => p.sent)).toEqual([300, 300]);
    expect(result.current.data?.reduce((acc, p) => acc + p.sent, 0)).toBe(600);
    expect(h.limits).toEqual([]);
  });

  it('propaga o erro da consulta de recibos como erro da query', async () => {
    h.result.team_messages = { data: [{ id: 'm1', sender_id: 'u1', profiles: null }], error: null };
    h.result.team_message_receipts = { data: null, error: { message: 'receipts off' } };

    const { result } = renderHook(() => useParticipantStats('conv-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('mensagem sem recibo não conta como entregue nem lida', async () => {
    h.result.team_messages = {
      data: [{ id: 'm1', sender_id: 'u1', profiles: { name: 'Ana' } }],
      error: null,
    };
    h.result.team_message_receipts = { data: [], error: null };

    const { result } = renderHook(() => useParticipantStats('conv-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { senderId: 'u1', senderName: 'Ana', sent: 1, delivered: 0, read: 0 },
    ]);
  });

  it('E78 — pagina as duas consultas em janelas de no máximo 1000', async () => {
    const mensagens = Array.from({ length: 2500 }, (_, i) => ({
      id: `m${i}`,
      sender_id: i % 2 === 0 ? 'u1' : 'u2',
      profiles: { name: i % 2 === 0 ? 'Ana' : 'Bruno' },
    }));
    h.result.team_messages = { data: mensagens, error: null };
    // Mais de 1000 recibos também: 1500 recibos 'read', um por mensagem.
    h.result.team_message_receipts = {
      data: mensagens.slice(0, 1500).map((m) => ({ message_id: m.id, status: 'read' })),
      error: null,
    };

    const { result } = renderHook(() => useParticipantStats('conv-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.reduce((acc, p) => acc + p.sent, 0)).toBe(2500);
    expect(result.current.data?.reduce((acc, p) => acc + p.delivered, 0)).toBe(1500);
    expect(result.current.data?.reduce((acc, p) => acc + p.read, 0)).toBe(1500);

    const msgRanges = h.ranges.filter(([t]) => t === 'team_messages');
    // 2500 linhas em páginas de 1000: 3 requisições, nenhuma janela maior que 1000.
    expect(msgRanges).toEqual([
      ['team_messages', 0, 999],
      ['team_messages', 1000, 1999],
      ['team_messages', 2000, 2999],
    ]);
    const receiptRanges = h.ranges.filter(([t]) => t === 'team_message_receipts');
    // 1500 recibos: 2 requisições, contados por inteiro.
    expect(receiptRanges).toEqual([
      ['team_message_receipts', 0, 999],
      ['team_message_receipts', 1000, 1999],
    ]);
    for (const [, from, to] of h.ranges) {
      expect(to - from + 1).toBeLessThanOrEqual(1000);
    }
    expect(h.limits).toEqual([]);
  });

  it('E78 — conta entregues por RECIBO: 1 recibo entre 20 ≠ 20 recibos', async () => {
    h.result.team_messages = {
      data: [
        { id: 'm1', sender_id: 'u1', profiles: { name: 'Ana' } },
        { id: 'm2', sender_id: 'u2', profiles: { name: 'Bruno' } },
      ],
      error: null,
    };
    h.result.team_message_receipts = {
      data: [
        // m1: 1 entregue entre 20 destinatários (os demais ainda 'sent'/sem recibo).
        { message_id: 'm1', status: 'delivered' },
        // m2: 20 recibos entregues.
        ...Array.from({ length: 20 }, () => ({ message_id: 'm2', status: 'delivered' })),
      ],
      error: null,
    };

    const { result } = renderHook(() => useParticipantStats('conv-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Por mensagem (Set<message_id>) daria delivered 1 × 1; por recibo dá 1 × 20.
    expect(result.current.data).toEqual([
      { senderId: 'u1', senderName: 'Ana', sent: 1, delivered: 1, read: 0 },
      { senderId: 'u2', senderName: 'Bruno', sent: 1, delivered: 20, read: 0 },
    ]);
  });
});
