import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * IA-SENTIMENT-001 — consumidores do Dashboard no vocabulário canônico PT-BR.
 *
 * O vocabulário canônico (`src/lib/ai-vocabulary.ts`, reexport do módulo do
 * edge) define positivo/neutro/negativo/critico e traduz o legado EN
 * (positive/negative/neutral/critical) na LEITURA. Estes dois consumidores do
 * Dashboard liam o dado CRU: `useAIStats` comparava com literais EN (toda classe
 * canônica zerava) e `useRecentSentimentAlerts` filtrava só pt-BR (legado EN e
 * `critico` desapareciam e o `else` final jogava tudo em 'neutro').
 *
 * Prova exigida: um MESMO conjunto com pt-BR, legado EN, crítico, desconhecido e
 * ausente produz os mesmos totais nos dois widgets, e nada disso vira 'neutro'.
 */

const filaAnalises: { data: unknown[] | null; error: unknown }[] = [];
const filaMensagens: number[] = [];
let alertasAudit: unknown[] = [];

vi.mock('@/integrations/supabase/client', () => {
  // Construtor de query PostgREST: qualquer encadeamento devolve ele mesmo e,
  // ao ser aguardado (`then`), resolve pelo próximo resultado da fila.
  const construtor = (resolver: () => unknown) => {
    const b: Record<string, unknown> = {};
    for (const metodo of ['select', 'gte', 'lt', 'lte', 'not', 'eq', 'order', 'limit']) {
      b[metodo] = () => b;
    }
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve().then(resolver).then(res, rej);
    return b;
  };
  return {
    supabase: {
      from: (tabela: string) => {
        if (tabela === 'conversation_analyses') {
          return construtor(() => filaAnalises.shift() ?? { data: [], error: null });
        }
        if (tabela === 'messages') {
          return construtor(() => ({ count: filaMensagens.shift() ?? 0, error: null }));
        }
        return construtor(() => ({ data: alertasAudit, error: null }));
      },
    },
  };
});

import { useAIStats } from '@/hooks/analytics/useAIStats';
import { useRecentSentimentAlerts } from '@/hooks/analytics/useRecentSentimentAlerts';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) },
    children,
  );

const criadoAgora = (min = 1) => new Date(Date.now() - min * 60_000).toISOString();
const analise = (sentiment: unknown) => ({ sentiment, sentiment_score: null, created_at: criadoAgora() });

/** pt-BR (positivo), legado EN (negative/neutral), crítico, desconhecido e ausente. */
const CONJUNTO = [
  analise('positivo'),
  analise('negative'),
  analise('neutral'),
  analise('critico'),
  analise('very_positive'),
  analise(null),
];

describe('useAIStats — agregado do Dashboard no vocabulário canônico (IA-SENTIMENT-001)', () => {
  beforeEach(() => {
    filaAnalises.length = 0;
    filaMensagens.length = 0;
    alertasAudit = [];
  });

  it('conta pt-BR, traduz o legado EN, soma o crítico ao negativo e não inventa neutro', async () => {
    filaAnalises.push({ data: CONJUNTO, error: null }, { data: [], error: null });
    filaMensagens.push(0, 0);

    const { result } = renderHook(() => useAIStats(7), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const stats = result.current.data!;

    // positivo=1 · negativo=2 (negativo legado + critico) · neutro=1 (só o 'neutral')
    expect({
      positivo: stats.positiveSentiment,
      negativo: stats.negativeSentiment,
      neutro: stats.neutralSentiment,
    }).toEqual({ positivo: 1, negativo: 2, neutro: 1 });
    expect(stats.totalAnalyses).toBe(6);

    // A série diária não pode jogar crítico/desconhecido/ausente no balde 'neutro'.
    const hoje = stats.sentimentTrend[stats.sentimentTrend.length - 1];
    expect({ positivo: hoje.positive, negativo: hoje.negative, neutro: hoje.neutral }).toEqual({
      positivo: 1,
      negativo: 2,
      neutro: 1,
    });
  });

  it('classe canônica não é zerada: dois positivos pt-BR contam dois', async () => {
    filaAnalises.push({ data: [analise('positivo'), analise('positivo')], error: null }, { data: [], error: null });
    filaMensagens.push(0, 0);

    const { result } = renderHook(() => useAIStats(7), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.positiveSentiment).toBe(2);
  });
});

describe('useRecentSentimentAlerts — alertas no vocabulário canônico (IA-SENTIMENT-001)', () => {
  beforeEach(() => {
    filaAnalises.length = 0;
    alertasAudit = [];
  });

  const linha = (over: Record<string, unknown>) => ({
    id: 'a', contact_id: 'c', department: 'Comercial', sentiment: 'neutro', summary: 's',
    created_at: criadoAgora(), contacts: { name: 'Ana' }, ...over,
  });

  it('inclui legado EN e crítico, mantém o significado e não conta desconhecido como negativo', async () => {
    filaAnalises.push({
      data: [
        linha({ id: 'a1', sentiment: 'negativo', created_at: criadoAgora(1) }),
        linha({ id: 'a2', sentiment: 'negative', created_at: criadoAgora(2) }),
        linha({ id: 'a3', sentiment: 'neutro', department: null, created_at: criadoAgora(3) }),
        linha({ id: 'a4', sentiment: 'critico', created_at: criadoAgora(4) }),
        linha({ id: 'a5', sentiment: 'very_positive', department: null, created_at: criadoAgora(5) }),
        linha({ id: 'a6', sentiment: 'positivo', department: null, created_at: criadoAgora(6) }),
      ],
      error: null,
    });

    const { result } = renderHook(() => useRecentSentimentAlerts(7), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const dados = result.current.data!;

    // Legado EN ('negative') entra como negativo; 'critico' entra como alerta; positivo e desconhecido não.
    expect(dados.alerts.map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(dados.alerts.map((a) => a.sentiment)).toEqual(['negativo', 'negativo', 'neutro', 'critico']);
    expect(dados.totalNegative).toBe(3);

    const comercial = dados.departments.find((d) => d.department === 'Comercial')!;
    expect(comercial).toMatchObject({ negative: 3, total: 3, pct: 100 });
    // Desconhecido não vira negativo nem neutro: a fila sem negativo fica em 0%.
    const semFila = dados.departments.find((d) => d.department === 'Sem fila')!;
    expect(semFila).toMatchObject({ negative: 0, total: 3, pct: 0 });
  });
});
