/**
 * Cartão #223 (R2-API-049) — prova comportamental do defeito pelo hook público.
 *
 * Usa apenas `useTalkXInsights()` (exportado antes e depois da correção) para
 * que o MESMO teste fique vermelho no código antigo e verde no corrigido:
 *  - a recomendação "Mensagem com maior engajamento" escolhia a campanha por
 *    contagem de respostas (servidor ordenava por replied_count); com Volume
 *    5/100 e Taxa 4/10, o banco devolvia Volume primeiro e o insight recomendava
 *    5% em vez de 40%;
 *  - o ramo de cliques filtrava status='finished', que o CHECK vigente de
 *    talkx_campaigns.status não admite ('completed', ...), então nunca havia
 *    candidatos e o alerta de poucos cliques ficava mudo.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state: {
    calls: string[];
    queues: Record<string, Array<{ data?: unknown; count?: number | null; error?: unknown }>>;
  } = { calls: [], queues: {} };

  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      const rec = (method: string) => (...args: unknown[]) => {
        state.calls.push(`${table}.${method}=${JSON.stringify(args)}`);
        return q;
      };
      for (const m of ['select', 'not', 'gte', 'lt', 'eq', 'in', 'order', 'limit', 'single', 'maybeSingle']) {
        q[m] = rec(m);
      }
      q.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
        const next = (state.queues[table] ?? []).shift() ?? { data: null, count: null, error: null };
        return Promise.resolve(next).then(onFulfilled, onRejected);
      };
      return q;
    },
  };

  return { state, client };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.client }));

import { useTalkXInsights, type TalkXInsight } from '../useTalkXInsights';

function queueTable(
  table: string,
  results: Array<{ data?: unknown; count?: number | null; error?: unknown }>,
) {
  h.state.queues[table] = [...results];
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

async function runHook(): Promise<TalkXInsight[]> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useTalkXInsights(), { wrapper: wrapper(client) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result.current.data as TalkXInsight[];
}

beforeEach(() => {
  h.state.calls = [];
  h.state.queues = {};
});

// `sent_count` é o que dá amostra às concluídas: a taxa de clique do alerta é
// cliques/envios por campanha, então campanha sem envios não é elegível.
const THREE_COMPLETED = [
  { id: 'c1', sent_count: 100 },
  { id: 'c2', sent_count: 100 },
  { id: 'c3', sent_count: 100 },
];

describe('useTalkXInsights — recomendação e alerta (cartão #223)', () => {
  it('recomenda a campanha de MAIOR TAXA: 4/10 (40%) vence 5/100 (5%)', async () => {
    queueTable('talkx_recipients', [{ data: [] }]);
    // O banco ordenava por replied_count: Volume (5) vem antes de Taxa (4).
    queueTable('talkx_campaign_metrics', [
      {
        data: [
          { id: 'volume', campaign_name: 'Volume', replied_count: 5, sent_count: 100 },
          { id: 'taxa', campaign_name: 'Taxa', replied_count: 4, sent_count: 10 },
        ],
      },
    ]);
    queueTable('contacts', [{ count: 100 }, { count: 10 }]);
    queueTable('talkx_campaigns', [{ data: [] }]);

    const insights = await runHook();
    const template = insights.find((i) => i.id === 'best-template');

    expect(template).toBeTruthy();
    expect(template!.description).toContain('"Taxa"');
    expect(template!.description).toContain('40.0%');
    expect(template!.description).not.toContain('"Volume"');
  });

  it('três campanhas concluídas sem cliques alcançam o alerta de poucos cliques', async () => {
    queueTable('talkx_recipients', [{ data: [] }, { count: 30 }]);
    queueTable('talkx_campaign_metrics', [{ data: [] }]);
    queueTable('contacts', [{ count: 100 }, { count: 10 }]);
    queueTable('talkx_campaigns', [{ data: THREE_COMPLETED }]);
    queueTable('talkx_links', [{ data: [] }]);

    const insights = await runHook();

    expect(insights.some((i) => i.id === 'low-clicks')).toBe(true);
  });

  it('filtra o status vigente "completed" e nunca o inválido "finished"', async () => {
    queueTable('talkx_recipients', [{ data: [] }]);
    queueTable('talkx_campaign_metrics', [{ data: [] }]);
    queueTable('contacts', [{ count: 100 }, { count: 10 }]);
    queueTable('talkx_campaigns', [{ data: THREE_COMPLETED }]);
    queueTable('talkx_links', [{ data: [] }]);

    await runHook();

    const statusCalls = h.state.calls.filter((c) => c.startsWith('talkx_campaigns.eq='));
    expect(statusCalls.some((c) => c.includes('"completed"'))).toBe(true);
    expect(h.state.calls.some((c) => c.includes('"finished"'))).toBe(false);
  });
});
