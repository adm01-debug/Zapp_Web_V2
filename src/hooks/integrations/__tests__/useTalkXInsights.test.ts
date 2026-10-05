/**
 * Cartão #223 (R2-API-049) — unidade da métrica de engajamento e propagação de erro.
 * A prova comportamental (vermelho no código antigo) está em
 * useTalkXInsights.engajamento.test.tsx, que usa só o hook público.
 */
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

import {
  fetchInsightData,
  pickBestTemplate,
  MIN_SENT_SAMPLE,
  TALKX_COMPLETED_STATUS,
} from '../useTalkXInsights';

function queueTable(
  table: string,
  results: Array<{ data?: unknown; count?: number | null; error?: unknown }>,
) {
  h.state.queues[table] = [...results];
}

beforeEach(() => {
  h.state.calls = [];
  h.state.queues = {};
});

describe('pickBestTemplate — métrica de engajamento e desempate', () => {
  it('4/10 (40%) vence 5/100 (5%) mesmo com menos respostas', () => {
    expect(
      pickBestTemplate([
        { id: 'volume', campaign_name: 'Volume', replied_count: 5, sent_count: 100 },
        { id: 'taxa', campaign_name: 'Taxa', replied_count: 4, sent_count: 10 },
      ]),
    ).toEqual({ name: 'Taxa', replyRate: 0.4, campaignId: 'taxa' });
  });

  it('respeita a amostra mínima de envios', () => {
    expect(MIN_SENT_SAMPLE).toBe(10);
    expect(
      pickBestTemplate([{ id: 'a', campaign_name: 'A', replied_count: 9, sent_count: 9 }]),
    ).toBeNull();
    expect(
      pickBestTemplate([{ id: 'a', campaign_name: 'A', replied_count: 1, sent_count: 10 }]),
    ).toEqual({ name: 'A', replyRate: 0.1, campaignId: 'a' });
  });

  it('desempata por nº de respostas e depois por nº de envios (determinístico)', () => {
    expect(
      pickBestTemplate([
        { id: 'poucos', campaign_name: 'Poucos', replied_count: 5, sent_count: 10 },
        { id: 'muitos', campaign_name: 'Muitos', replied_count: 10, sent_count: 20 },
      ]),
    ).toEqual({ name: 'Muitos', replyRate: 0.5, campaignId: 'muitos' });
  });

  it('é determinístico para taxas iguais e mesmo tamanho (nome/id)', () => {
    const rows = [
      { id: 'z', campaign_name: 'Zeta', replied_count: 5, sent_count: 10 },
      { id: 'a', campaign_name: 'Alfa', replied_count: 5, sent_count: 10 },
    ];
    expect(pickBestTemplate(rows)?.campaignId).toBe('a');
    expect(pickBestTemplate([...rows].reverse())?.campaignId).toBe('a');
  });

  it('sem candidatos elegíveis devolve null (ausência real de dado)', () => {
    expect(pickBestTemplate([])).toBeNull();
    expect(
      pickBestTemplate([{ id: 'a', campaign_name: 'A', replied_count: 0, sent_count: 50 }]),
    ).toBeNull();
  });
});

describe('fetchInsightData — conjunto coerente (cliques/enviados/campanhas)', () => {
  it('cliques e enviados ficam restritos às campanhas concluídas da janela', async () => {
    queueTable('talkx_recipients', [{ data: [] }, { count: 40 }]);
    queueTable('talkx_campaign_metrics', [{ data: [] }]);
    queueTable('contacts', [{ count: 100 }, { count: 10 }]);
    queueTable('talkx_campaigns', [{ data: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] }]);
    queueTable('talkx_links', [{ data: [{ id: 'l1' }, { id: 'l2' }] }]);
    queueTable('talkx_link_clicks', [{ count: 4 }]);

    const raw = await fetchInsightData();

    expect(TALKX_COMPLETED_STATUS).toBe('completed');
    expect(raw.lowClickCampaigns).toBe(3);
    expect(raw.avgClickRate).toBeCloseTo(4 / 40, 10);

    const campaignsIn = h.state.calls.find((c) => c.startsWith('talkx_links.in='));
    expect(campaignsIn).toContain('"c1"');
    const clicksIn = h.state.calls.find((c) => c.startsWith('talkx_link_clicks.in='));
    expect(clicksIn).toContain('"l1"');
    expect(clicksIn).toContain('"l2"');
    const sentIn = h.state.calls.find(
      (c) => c.startsWith('talkx_recipients.in=') && c.includes('"c1"'),
    );
    expect(sentIn).toBeTruthy();
  });
});

describe('fetchInsightData — erro de leitura não vira ausência de recomendação', () => {
  it('propaga o erro em vez de devolver "sem dado"', async () => {
    queueTable('talkx_recipients', [{ data: [] }]);
    queueTable('talkx_campaign_metrics', [
      { data: null, error: { message: 'relation does not exist' } },
    ]);

    await expect(fetchInsightData()).rejects.toThrow(/talkx_campaign_metrics/);
  });

  it('propaga erro também na leitura das campanhas concluídas', async () => {
    queueTable('talkx_recipients', [{ data: [] }]);
    queueTable('talkx_campaign_metrics', [{ data: [] }]);
    queueTable('contacts', [{ count: 100 }, { count: 10 }]);
    queueTable('talkx_campaigns', [{ data: null, error: { message: 'permission denied' } }]);

    await expect(fetchInsightData()).rejects.toThrow(/concluídas/);
  });
});
