import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  R2SLA001,
  slaFixtureDenominadores,
  slaFixtureSoPendentes,
  slaFixtureComRespostaNoPrazo,
} from './helpers/slaDenominadorFixture';

/**
 * Dublê do PostgREST para os DOIS consumidores do SLA (#458).
 *
 * Registra os filtros aplicados e — o que importa aqui — PROJETA a linha pelas colunas pedidas no
 * `select`, como o servidor faz: se a leitura do histórico não pedir o desfecho da 1ª resposta, o
 * hook não tem como distinguir "no prazo" de "pendente" e o teste morde.
 */
const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
  selects: [] as Array<{ table: string; columns: string }>,
  gte: [] as Array<{ table: string; column: string; value: string }>,
  ranges: [] as Array<{ table: string; from: number; to: number }>,
}));

/** Teto de linhas do PostgREST no projeto (achado A6/A11). */
const TETO_POSTGREST = 1000;

/** Projeta a linha como o PostgREST: só as colunas pedidas (sem `*`). */
function projetar(row: Record<string, unknown>, columns: string): Record<string, unknown> {
  if (columns.includes('*')) return row;
  const nomes = columns
    .split(',')
    .map((c) => c.trim().split('(')[0].trim())
    .filter(Boolean);
  return Object.fromEntries(nomes.map((n) => [n, row[n]]));
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      // As colunas são DO builder (cada `.from()` cria o seu), não da tabela: os dois hooks leem
      // `conversation_sla` ao mesmo tempo e cada um pede o seu recorte.
      let colunasDoBuilder = '*';
      builder.select = vi.fn((columns: string) => {
        colunasDoBuilder = columns;
        h.selects.push({ table, columns });
        return builder;
      });
      builder.gte = vi.fn((column: string, value: string) => {
        h.gte.push({ table, column, value });
        return builder;
      });
      builder.order = vi.fn(chain);
      builder.range = vi.fn((from: number, to: number) => {
        h.ranges.push({ table, from, to });
        return builder;
      });
      builder.then = (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) => {
        if (h.error) {
          return Promise.resolve({ data: null, error: h.error }).then(onFulfilled, onRejected);
        }
        const base = table === 'conversation_sla' ? h.rows : h.profiles;
        const filtros = h.gte.filter((f) => f.table === table);
        const filtradas = base
          .map((row) => projetar(row, colunasDoBuilder))
          .filter((row) =>
            filtros.every((f) => {
              const valor = row[f.column];
              return typeof valor === 'string' && valor >= f.value;
            })
          );
        const range = [...h.ranges].reverse().find((r) => r.table === table);
        const pagina = range ? filtradas.slice(range.from, range.to + 1) : filtradas.slice(0, TETO_POSTGREST);
        return Promise.resolve({ data: pagina, error: null }).then(onFulfilled, onRejected);
      };
      return builder;
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useSLAMetrics } from '@/hooks/sla/useSLAMetrics';
import { useSLAHistory } from '@/hooks/sla/useSLAHistory';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

/**
 * Os DOIS consumidores lendo a MESMA lista: é o teste central do achado (critério de aceite
 * "provar ambos consumidores com a mesma fixture").
 */
function renderAmbos() {
  return renderHook(
    () => ({ painel: useSLAMetrics('today'), historico: useSLAHistory('7d') }),
    { wrapper: createWrapper() }
  );
}

describe('R2-SLA-001 — painel e histórico usam o MESMO denominador de 1ª resposta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rows = [];
    h.profiles = [];
    h.error = null;
    h.selects = [];
    h.gte = [];
    h.ranges = [];
  });

  it('a mesma fixture dá a mesma taxa nos dois consumidores (0%, não 90%)', async () => {
    h.rows = slaFixtureDenominadores(new Date());

    const { result } = renderAmbos();
    await waitFor(() => {
      expect(result.current.painel.loading).toBe(false);
      expect(result.current.historico.loading).toBe(false);
    });

    const painel = result.current.painel.data!;
    const historico = result.current.historico.data!;

    // Vermelho antes: o painel deixava os nove pendentes FORA do denominador (0/1 = 0%) e o
    // histórico os contava como "no prazo" ((10-1)/10 = 90%) — o mesmo dado, dois números.
    expect(painel.overall.firstResponse.rate).toBe(R2SLA001.taxaEsperada);
    expect(historico.totals.overallSLARate).toBe(R2SLA001.taxaEsperada);
    expect(painel.overall.overallRate).toBe(historico.totals.overallSLARate);

    // Denominador = conversas com desfecho; a pendente não é sucesso nem entra na conta.
    expect(painel.overall.firstResponse.total).toBe(R2SLA001.respondidaForaDoPrazo);
    expect(painel.overall.firstResponse.onTime).toBe(0);
    expect(painel.overall.firstResponse.breached).toBe(R2SLA001.respondidaForaDoPrazo);
    expect(painel.overall.firstResponse.pending).toBe(R2SLA001.pendentes);
    expect(historico.totals.evaluatedConversations).toBe(R2SLA001.respondidaForaDoPrazo);
    expect(historico.totals.pendingConversations).toBe(R2SLA001.pendentes);
    expect(historico.totals.firstResponseBreaches).toBe(R2SLA001.respondidaForaDoPrazo);

    // O total anunciado continua sendo TODAS as conversas com SLA no período (avaliadas + pendentes).
    expect(painel.overall.totalConversations).toBe(R2SLA001.total);
    expect(historico.totals.totalConversations).toBe(R2SLA001.total);

    // A série diária e o quadro por agente seguem a mesma regra do resumo.
    const dia = historico.dailyData[historico.dailyData.length - 1];
    expect(dia.slaRate).toBe(R2SLA001.taxaEsperada);
    expect(dia.evaluatedConversations).toBe(R2SLA001.respondidaForaDoPrazo);
    expect(dia.pendingConversations).toBe(R2SLA001.pendentes);

    const agente = painel.byAgent[0];
    expect(agente.overallRate).toBe(R2SLA001.taxaEsperada);
    expect(agente.firstResponse.total).toBe(R2SLA001.respondidaForaDoPrazo);
    expect(agente.firstResponse.pending).toBe(R2SLA001.pendentes);
  });

  it('resposta DENTRO do prazo conta como atendida nos dois (1 no prazo + 1 pendente ⇒ 100%)', async () => {
    h.rows = slaFixtureComRespostaNoPrazo(new Date());

    const { result } = renderAmbos();
    await waitFor(() => {
      expect(result.current.painel.loading).toBe(false);
      expect(result.current.historico.loading).toBe(false);
    });

    const painel = result.current.painel.data!;
    const historico = result.current.historico.data!;

    // Se a leitura do histórico deixar de pedir `first_response_at` no select, a linha "no prazo"
    // cai como pendente e este par de números se separa (100% no painel, 0% no histórico).
    expect(painel.overall.firstResponse.rate).toBe(100);
    expect(historico.totals.overallSLARate).toBe(100);
    expect(painel.overall.firstResponse.pending).toBe(1);
    expect(historico.totals.pendingConversations).toBe(1);
    expect(historico.totals.evaluatedConversations).toBe(1);
  });

  it.each([
    ['só pendentes (nove conversas sem nenhuma resposta avaliada)', () => slaFixtureSoPendentes(new Date())],
    ['nenhum registro no período', () => []],
  ])('sem conversa avaliada não afirma 100%% em nenhum dos dois: %s', async (_nome, montar) => {
    h.rows = montar();

    const { result } = renderAmbos();
    await waitFor(() => {
      expect(result.current.painel.loading).toBe(false);
      expect(result.current.historico.loading).toBe(false);
    });

    const painel = result.current.painel.data!;
    const historico = result.current.historico.data!;

    // Vermelho antes: sem amostra os dois lados devolviam 100% — desempenho perfeito sem nenhuma
    // resposta avaliada. Agora o caso é distinguível por `hasSample`/`evaluated`/`pending`.
    expect(painel.overall.firstResponse.rate).not.toBe(100);
    expect(historico.totals.overallSLARate).not.toBe(100);
    expect(painel.overall.firstResponse.rate).toBe(0);
    expect(historico.totals.overallSLARate).toBe(0);
    expect(painel.overall.firstResponse.total).toBe(0);
    expect(historico.totals.evaluatedConversations).toBe(0);
    expect(painel.overall.hasSample).toBe(false);
    expect(historico.totals.hasSample).toBe(false);
  });

  it('a leitura do histórico pede o desfecho da 1ª resposta (coluna que decide elegibilidade)', async () => {
    h.rows = slaFixtureDenominadores(new Date());

    const { result } = renderAmbos();
    await waitFor(() => expect(result.current.historico.loading).toBe(false));

    const colunas = h.selects.filter((s) => s.table === 'conversation_sla').map((s) => s.columns);
    expect(colunas.some((c) => c.includes('first_response_at'))).toBe(true);
    expect(colunas.some((c) => c.includes('first_response_breached'))).toBe(true);
  });
});
