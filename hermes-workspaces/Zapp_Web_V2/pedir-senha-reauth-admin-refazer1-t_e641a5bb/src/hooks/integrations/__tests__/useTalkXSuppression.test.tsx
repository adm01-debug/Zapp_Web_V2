import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Leitura da trilha de supressão (X184) — `useTalkXSuppressionActivity`.
 *
 * O hook NÃO lista `talkx_blacklist`: quem aplica `removed_at is null` na lista
 * é a tela (coberto em `TalkXSuppression.search.test.tsx`). Aqui o contrato é o
 * da trilha: vocabulário de `event_type`, ordem determinística com desempate por
 * `id`, página como fatia (`range`) e rótulo do contato resolvido sem esconder
 * entradas já removidas (o evento `suppression_remove` aponta para uma delas).
 */

type Call = { table: string; method: string; args: unknown[] };

const h = vi.hoisted(() => ({
  calls: [] as { table: string; method: string; args: unknown[] }[],
  events: [] as Record<string, unknown>[],
  entries: [] as Record<string, unknown>[],
  contacts: [] as Record<string, unknown>[],
  count: null as number | null,
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (table: string) => {
    const self: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'eq', 'is', 'order', 'range']) {
      self[method] = (...args: unknown[]) => {
        h.calls.push({ table, method, args });
        return self;
      };
    }
    self.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const data = table === 'talkx_campaign_events' ? h.events : table === 'talkx_blacklist' ? h.entries : h.contacts;
      return Promise.resolve({ data, error: null, count: table === 'talkx_campaign_events' ? h.count : null }).then(resolve, reject);
    };
    return self;
  },
}));

import {
  useTalkXSuppressionActivity, fetchTalkXSuppressionActivity, SUPPRESSION_ACTIVITY_EVENT_TYPES,
} from '../useTalkXSuppression';

const callsOf = (table: string, method: string): Call[] => h.calls.filter((c) => c.table === table && c.method === method);

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useTalkXSuppressionActivity · consulta da trilha', () => {
  beforeEach(() => {
    h.calls.length = 0;
    h.events = [];
    h.entries = [];
    h.contacts = [];
    h.count = null;
  });

  it('restringe aos tipos da trilha, ordena por created_at desc com desempate por id e pede a fatia', async () => {
    const { result } = renderHook(() => useTalkXSuppressionActivity({ limit: 5, page: 2 }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(callsOf('talkx_campaign_events', 'in')[0].args).toEqual(['event_type', SUPPRESSION_ACTIVITY_EVENT_TYPES]);
    expect(callsOf('talkx_campaign_events', 'order').map((c) => c.args)).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(callsOf('talkx_campaign_events', 'range')[0].args).toEqual([10, 14]);
    expect(callsOf('talkx_campaign_events', 'eq')).toHaveLength(0);
  });

  it('filtra por tipo só quando o tipo não é "all"', async () => {
    await fetchTalkXSuppressionActivity({ eventType: 'suppression_remove' });
    expect(callsOf('talkx_campaign_events', 'eq')[0].args).toEqual(['event_type', 'suppression_remove']);
  });

  it('não aplica removed_at ao rótulo do contato: o evento de remoção aponta para entrada já removida', async () => {
    h.events = [{ id: 'ev-1', event_type: 'suppression_remove', message: null, entity_id: 'bl-1', created_at: '2026-09-01T10:00:00Z', actor: { name: 'Ana' } }];
    h.entries = [{ id: 'bl-1', contact_id: 'c1', phone: null }];
    h.contacts = [{ id: 'c1', email: 'a@x.com', phone: '5511999990001' }];

    const page = await fetchTalkXSuppressionActivity();

    expect(callsOf('talkx_blacklist', 'is')).toHaveLength(0);
    expect(page.items[0]).toMatchObject({ id: 'ev-1', action: 'remove', contactLabel: 'a@x.com', actorName: 'Ana' });
  });

  it('usa a contagem exata do servidor e, sem ela, o que a página prova existir', async () => {
    h.events = [{ id: 'ev-1', event_type: 'suppression_add', message: null, entity_id: null, created_at: '2026-09-01T10:00:00Z', actor: null }];
    h.count = 87;
    expect((await fetchTalkXSuppressionActivity({ limit: 5, page: 1 })).total).toBe(87);

    h.count = null;
    expect((await fetchTalkXSuppressionActivity({ limit: 5, page: 1 })).total).toBe(6);
  });

  it('não consulta com enabled=false', async () => {
    renderHook(() => useTalkXSuppressionActivity({ enabled: false }), { wrapper: wrapper() });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.calls).toHaveLength(0);
  });
});
