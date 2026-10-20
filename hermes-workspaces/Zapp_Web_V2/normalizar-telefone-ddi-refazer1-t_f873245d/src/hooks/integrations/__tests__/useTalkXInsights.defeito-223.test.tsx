/**
 * Cartão t_bb9a6ecd — prova comportamental do defeito #223 (origem R2-API-049)
 * "Insights Talk X escolhem engajamento por contagem e deixam concluídas fora do alerta".
 *
 * O teste roda pelo hook público (`useTalkXInsights()`), que existe ANTES e DEPOIS da
 * correção, e usa um duplo do PostgREST que RESPEITA os filtros, a ordenação e o teto que
 * o hook envia. Um duplo que devolvesse sempre a mesma resposta não provaria nenhuma das
 * duas faces do defeito:
 *  - eleição por contagem: o código anterior consultava por `replied_count desc`, pegava a
 *    PRIMEIRA linha e só então calculava a taxa — a campanha de maior volume vencia mesmo
 *    com taxa pior (Volume 200/1000 = 20% ganhava de Taxa 4/10 = 40%);
 *  - concluídas fora do alerta: a contagem de concluídas filtrava `status='finished'`,
 *    valor que o CHECK de `talkx_campaigns.status` não admite (o vigente é 'completed'),
 *    então a leitura voltava vazia e o alerta de baixo clique nunca saía.
 *
 * Com o mesmo teste: vermelho contra o código anterior (fb181319d^) e verde contra o
 * corrigido.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type Op = [string, ...unknown[]];

const h = vi.hoisted(() => {
  const state = {
    calls: [] as string[],
    tables: {} as Record<string, Row[]>,
  };

  /** -1/0/1 tolerante a número e a texto ISO (comparação estável para os filtros). */
  function cmp(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : a > b ? 1 : -1;
    const sa = String(a);
    const sb = String(b);
    return sa === sb ? 0 : sa > sb ? 1 : -1;
  }

  /** Executa, na ordem enviada, os filtros/ordenação/teto de uma consulta. */
  function run(table: string, ops: Op[]): { data: Row[]; count: number } {
    let out = (state.tables[table] ?? []).slice();
    for (const op of ops) {
      const method = op[0];
      const args = op.slice(1);
      const col = args[0] as string;
      if (method === 'eq') out = out.filter((r) => r[col] === args[1]);
      else if (method === 'gte') out = out.filter((r) => r[col] != null && cmp(r[col], args[1]) >= 0);
      else if (method === 'lt') out = out.filter((r) => r[col] != null && cmp(r[col], args[1]) < 0);
      else if (method === 'in') out = out.filter((r) => Array.isArray(args[1]) && (args[1] as unknown[]).includes(r[col]));
      else if (method === 'not') {
        // not(coluna, 'is', null): descarta nulos, como o PostgREST faz.
        if (args[1] === 'is' && args[2] === null) out = out.filter((r) => r[col] != null);
      } else if (method === 'order') {
        const asc = (args[1] as { ascending?: boolean } | undefined)?.ascending !== false;
        const dir = asc ? 1 : -1;
        out = out.slice().sort((x, y) => {
          const xv = x[col];
          const yv = y[col];
          if (xv == null && yv == null) return 0;
          if (xv == null) return 1;
          if (yv == null) return -1;
          return dir * cmp(xv, yv);
        });
      } else if (method === 'limit') out = out.slice(0, args[0] as number);
    }
    return { data: out, count: out.length };
  }

  function builder(table: string): Record<string, unknown> {
    const ops: Op[] = [];
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'gte', 'lt', 'eq', 'in', 'order', 'limit']) {
      q[m] = (...args: unknown[]) => {
        ops.push([m, ...args]);
        state.calls.push(`${table}.${m}=${JSON.stringify(args)}`);
        return q;
      };
    }
    q.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(run(table, ops)).then(onOk, onErr);
    return q;
  }

  return { state, client: { from: (t: string) => builder(t) } };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.client }));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: (t: string) => h.client.from(t) }));

import { useTalkXInsights, type TalkXInsight } from '@/hooks/integrations/useTalkXInsights';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

/**
 * Base mínima para as duas conclusões saírem: 3 concluídas com 100 envios e quase nenhum
 * clique (baixo clique POR CAMPANHA) e métricas em que a maior CONTAGEM de respostas tem a
 * pior TAXA.
 */
function seed(): void {
  h.state.tables = {
    talkx_recipients: Array.from({ length: 200 }, () => ({ sent_at: ago(1), replied_at: null })),
    talkx_link_clicks: [
      { id: 'k1', clicked_at: ago(1), link_id: 'l1', talkx_links: { campaign_id: 'c1' } },
      { id: 'k2', clicked_at: ago(1), link_id: 'l1', talkx_links: { campaign_id: 'c1' } },
    ],
    talkx_campaigns: [
      { id: 'c1', status: 'completed', sent_count: 100, created_at: ago(1) },
      { id: 'c2', status: 'completed', sent_count: 100, created_at: ago(1) },
      { id: 'c3', status: 'completed', sent_count: 100, created_at: ago(1) },
    ],
    talkx_campaign_metrics: [
      // Maior volume de respostas, taxa pior: 200/1000 = 20%.
      { id: 'volume', campaign_name: 'Volume', replied_count: 200, sent_count: 1000, reply_rate_pct: 20 },
      // Menor volume, taxa melhor: 4/10 = 40% — é ela que "maior engajamento" deve eleger.
      { id: 'taxa', campaign_name: 'Taxa', replied_count: 4, sent_count: 10, reply_rate_pct: 40 },
    ],
    contacts: [
      ...Array.from({ length: 50 }, (_, i) => ({ id: `inativo-${i}`, updated_at: ago(200) })),
      ...Array.from({ length: 50 }, (_, i) => ({ id: `ativo-${i}`, updated_at: ago(1) })),
    ],
  };
}

async function runHook(): Promise<TalkXInsight[]> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useTalkXInsights(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result.current.data as TalkXInsight[];
}

describe('#223 — insights elegem por taxa e contam as concluídas', () => {
  beforeEach(() => {
    h.state.calls = [];
    seed();
  });

  it('1) elege a campanha pela TAXA de resposta, não pela contagem absoluta', async () => {
    const insights = await runHook();
    const template = insights.find((i) => i.id === 'best-template');
    expect(template?.description).toContain('Taxa');
    expect(template?.description).toContain('40.0%');
    expect(template?.description).not.toContain('Volume');
  });

  it('2) consulta o status que a tabela admite ("completed"), nunca "finished"', async () => {
    await runHook();
    expect(h.state.calls).toContain('talkx_campaigns.eq=["status","completed"]');
    expect(h.state.calls).not.toContain('talkx_campaigns.eq=["status","finished"]');
  });

  it('3) as concluídas entram no alerta de baixo clique', async () => {
    const insights = await runHook();
    const lowClicks = insights.find((i) => i.id === 'low-clicks');
    expect(lowClicks).toBeDefined();
    expect(lowClicks?.description).toContain('Nas 3 campanhas concluídas');
    expect(lowClicks?.description).toContain('3 ficaram abaixo');
  });

  it('4) o alerta depende do filtro: campanha com o status antigo não conta como concluída', async () => {
    h.state.tables.talkx_campaigns = h.state.tables.talkx_campaigns.map((c) => ({ ...c, status: 'finished' }));
    const insights = await runHook();
    expect(insights.find((i) => i.id === 'low-clicks')).toBeUndefined();
  });
});
