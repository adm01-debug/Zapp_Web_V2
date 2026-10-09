import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { format, subDays } from 'date-fns';
import { appDayKeyLabel } from '@/lib/localDay';

/**
 * Y07 — estatísticas de IA do Dashboard (`useAIStats`). O fuso do processo é
 * fixado no fuso do app (America/Sao_Paulo) para os rótulos da série serem
 * determinísticos: é assim que os defeitos de fuso aparecem (em UTC não
 * aparecem). Quem responde é um stub de PostgREST que filtra como o backend.
 */
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Sao_Paulo';
afterAll(() => {
  if (TZ_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_ORIGINAL;
});

type Row = Record<string, unknown>;
interface TableState {
  rows: Row[];
  callErrors?: Array<{ message: string; code?: string } | null>;
}

const h = vi.hoisted(() => ({
  tables: {} as Record<string, TableState>,
  calls: {} as Record<string, number>,
  queries: [] as Array<{ table: string; filters: Array<{ op: string; col: string; val: unknown }> }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  type Construtor = {
    select: (cols?: unknown, opts?: { count?: string; head?: boolean }) => Construtor;
    eq: (col: string, val: unknown) => Construtor;
    gte: (col: string, val: unknown) => Construtor;
    lt: (col: string, val: unknown) => Construtor;
    not: (col: string, op: string, val: unknown) => Construtor;
    order: (...a: unknown[]) => Construtor;
    limit: (n: number) => Construtor;
    then: (resolve: (v: unknown) => unknown) => unknown;
  };

  const builder = (table: string) => {
    const cfg: TableState = h.tables[table] ?? { rows: [] };
    const indice = h.calls[table] ?? 0;
    h.calls[table] = indice + 1;
    const erroDaChamada = cfg.callErrors?.[indice] ?? null;

    const filters: Array<{ op: string; col: string; val: unknown }> = [];
    h.queries.push({ table, filters });
    let modoContagem = false;

    const matching = () =>
      cfg.rows.filter((row) =>
        filters.every((f) => {
          const v = row[f.col];
          if (f.op === 'eq') return v === f.val;
          if (f.op === 'gte') return String(v) >= String(f.val);
          if (f.op === 'lt') return String(v) < String(f.val);
          if (f.op === 'notnull') return v !== null && v !== undefined;
          return true;
        }),
      );

    const result = () => {
      if (erroDaChamada) return { data: null, count: null, error: erroDaChamada };
      return modoContagem
        ? { data: null, count: matching().length, error: null }
        : { data: matching(), count: matching().length, error: null };
    };

    const b: Construtor = {
      select: (_cols: unknown, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count) modoContagem = true;
        return b;
      },
      eq: (col: string, val: unknown) => { filters.push({ op: 'eq', col, val }); return b; },
      gte: (col: string, val: unknown) => { filters.push({ op: 'gte', col, val }); return b; },
      lt: (col: string, val: unknown) => { filters.push({ op: 'lt', col, val }); return b; },
      not: (col: string, op: string, val: unknown) => {
        if (op === 'is' && val === null) filters.push({ op: 'notnull', col, val });
        return b;
      },
      order: () => b,
      limit: (n: number) => { filters.push({ op: 'limit', col: '', val: n }); return b; },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return b;
  };

  return { supabase: { from: (table: string) => builder(table) } };
});

import { useAIStats, calculateTrend, type PeriodOption } from '@/hooks/analytics/useAIStats';

let agora = new Date();

function instante(diasAtras: number, hora = 10, minuto = 0) {
  const d = new Date(agora);
  d.setDate(d.getDate() - diasAtras);
  d.setHours(hora, minuto, 0, 0);
  return d.toISOString();
}

function tabelas(rows: Partial<Record<string, Row[]>> = {}, errors: Partial<Record<string, TableState['callErrors']>> = {}) {
  agora = new Date();
  h.tables = {
    conversation_analyses: { rows: rows.conversation_analyses ?? [], callErrors: errors.conversation_analyses },
    messages: { rows: rows.messages ?? [], callErrors: errors.messages },
    audit_logs: { rows: rows.audit_logs ?? [], callErrors: errors.audit_logs },
  };
  h.calls = {};
  h.queries = [];
}

function renderStats(period: PeriodOption = 7) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useAIStats(period), { wrapper: Wrapper });
}

async function esperarStats(period: PeriodOption = 7) {
  const hook = renderStats(period);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

function pertoDe(isoEsperado: string, isoReal: unknown, toleranciaMs = 5000) {
  const a = new Date(isoEsperado).getTime();
  const b = new Date(String(isoReal)).getTime();
  expect(Math.abs(a - b)).toBeLessThan(toleranciaMs);
}

describe('calculateTrend — variação entre janelas', () => {
  it.each([
    [null, 5, 'stable', 0, 0],
    [5, null, 'stable', 0, 0],
    [null, null, 'stable', 0, 0],
    [0, 0, 'stable', 0, 0],
    [10, 5, 'up', 5, 100],
    [0, 5, 'down', -5, -100],
    [20, 10, 'up', 10, 100],
    [10, 20, 'down', -10, -50],
    [5, 5, 'stable', 0, 0],
    [100, 100.5, 'stable', 0, 0],
    [101, 100, 'up', 1, 1],
    [99, 100, 'down', -1, -1],
  ])('(%s -> %s) = %s/change %s/%% %s', (atual, anterior, direcao, variacao, porcentagem) => {
    expect(calculateTrend(atual as number | null, anterior as number | null)).toEqual({
      direction: direcao,
      change: variacao,
      percentage: porcentagem,
    });
  });

  it('variação abaixo de 1% é reportada como estável, sem número inventado', () => {
    const t = calculateTrend(100.4, 100);
    expect(t.direction).toBe('stable');
    expect(t.change).toBe(0);
    expect(t.percentage).toBe(0);
  });

  it('anterior zero com atual positivo é alta de 100% (não divisão por zero)', () => {
    expect(calculateTrend(3, 0)).toEqual({ direction: 'up', change: 3, percentage: 100 });
  });
});

describe('useAIStats — janela de leitura', () => {
  beforeEach(() => tabelas());

  it('a janela atual começa em "hoje - período" e a anterior termina exatamente onde ela começa', async () => {
    await esperarStats(7);

    const leituras = h.queries.filter((q) => q.table === 'conversation_analyses');
    expect(leituras).toHaveLength(2);

    const atual = leituras[0].filters.find((f) => f.op === 'gte');
    const anteriorInicio = leituras[1].filters.find((f) => f.op === 'gte');
    const anteriorFim = leituras[1].filters.find((f) => f.op === 'lt');

    pertoDe(subDays(agora, 7).toISOString(), atual?.val);
    pertoDe(subDays(agora, 14).toISOString(), anteriorInicio?.val);
    pertoDe(subDays(agora, 7).toISOString(), anteriorFim?.val);
    expect(leituras[0].filters.some((f) => f.op === 'lt')).toBe(false);
  });

  it('período de 30 dias muda a janela e o tamanho da série', async () => {
    const { result } = await esperarStats(30);

    pertoDe(subDays(agora, 30).toISOString(), h.queries[0].filters.find((f) => f.op === 'gte')?.val);
    expect(result.current.data?.sentimentTrend).toHaveLength(30);
  });

  it('conta apenas as análises da janela atual (as do período anterior não entram)', async () => {
    tabelas({
      conversation_analyses: [
        { id: 'a1', sentiment: 'positivo', sentiment_score: 80, created_at: instante(0) },
        { id: 'a2', sentiment: 'neutro', sentiment_score: 60, created_at: instante(1) },
        { id: 'a3', sentiment: 'negativo', sentiment_score: 30, created_at: instante(6) },
        // A janela atual é pedida como `gte(created_at, hoje - 7 dias)` SEM teto
        // superior (useAIStats.ts:73), e o início do período mantém a hora de
        // QUEM LÊ. Uma linha cravada no limite de 7 dias (hora fixa 10:00) cai
        // DENTRO da janela sempre que a suíte roda antes das 10:00 — foi o que
        // derrubou este teste na integração (contagem 4). 8 dias atrás é
        // anterior ao início da janela em qualquer horário.
        { id: 'a4', sentiment: 'positivo', sentiment_score: 90, created_at: instante(8) },
        { id: 'a5', sentiment: 'positivo', sentiment_score: 95, created_at: instante(13) },
        { id: 'a6', sentiment: 'positivo', sentiment_score: 99, created_at: instante(20) },
      ],
    });

    const { result } = await esperarStats(7);
    expect(result.current.data?.totalAnalyses).toBe(3);
  });

  it('sem nenhuma análise na janela o widget não inventa número', async () => {
    const { result } = await esperarStats(7);
    expect(result.current.data?.totalAnalyses).toBe(0);
    expect(result.current.data?.avgSentimentScore).toBeNull();
    expect(result.current.data?.positiveSentiment).toBe(0);
    expect(result.current.data?.negativeSentiment).toBe(0);
    expect(result.current.data?.neutralSentiment).toBe(0);
    expect(result.current.data?.sentimentTrend.every((d) => d.score === null)).toBe(true);
  });

  it('erro na leitura da janela atual vira erro da consulta (não vira zero)', async () => {
    tabelas({}, { conversation_analyses: [{ message: 'permission denied', code: '42501' }] });
    const hook = renderStats(7);

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
  });

  it.fails('erro na leitura da janela ANTERIOR não pode virar "alta de 100%"', async () => {
    // O hook ignora o erro da janela anterior: a falha vira "crescimento".
    tabelas(
      { conversation_analyses: [{ id: 'a1', sentiment: 'positivo', sentiment_score: 80, created_at: instante(0) }] },
      { conversation_analyses: [null, { message: 'timeout' }] },
    );

    const { result } = await esperarStats(7);
    expect(result.current.data?.trends.analyses.direction).not.toBe('up');
  });
});

describe('useAIStats — média e classes de sentimento', () => {
  beforeEach(() => tabelas());

  it('a média exclui amostra ausente em vez de tratá-la como 0 ou 50', async () => {
    tabelas({
      conversation_analyses: [
        { id: 'a1', sentiment: 'positivo', sentiment_score: 70, created_at: instante(0) },
        { id: 'a2', sentiment: 'neutro', sentiment_score: null, created_at: instante(1) },
        { id: 'a3', sentiment: 'negativo', sentiment_score: 80, created_at: instante(2) },
      ],
    });

    const { result } = await esperarStats(7);
    expect(result.current.data?.avgSentimentScore).toBe(75);
  });

  it('a média é arredondada em duas casas', async () => {
    tabelas({
      conversation_analyses: [
        { id: 'a1', sentiment: 'neutro', sentiment_score: 1, created_at: instante(0) },
        { id: 'a2', sentiment: 'neutro', sentiment_score: 2, created_at: instante(1) },
        { id: 'a3', sentiment: 'neutro', sentiment_score: 2, created_at: instante(2) },
      ],
    });

    const { result } = await esperarStats(7);
    expect(result.current.data?.avgSentimentScore).toBe(1.67);
  });

  it('sem nenhuma amostra válida a média é null (nunca 0 nem 50)', async () => {
    tabelas({
      conversation_analyses: [
        { id: 'a1', sentiment: 'positivo', sentiment_score: null, created_at: instante(0) },
        { id: 'a2', sentiment: 'positivo', sentiment_score: null, created_at: instante(1) },
      ],
    });

    const { result } = await esperarStats(7);
    expect(result.current.data?.avgSentimentScore).toBeNull();
  });

  it('conta pelo vocabulário canônico: pt-BR, legado EN e "critico" no negativo', async () => {
    tabelas({
      conversation_analyses: [
        { id: 'a1', sentiment: 'positivo', sentiment_score: 80, created_at: instante(0) },
        { id: 'a2', sentiment: 'positive', sentiment_score: 80, created_at: instante(0) },
        { id: 'a3', sentiment: 'neutro', sentiment_score: 50, created_at: instante(1) },
        { id: 'a4', sentiment: 'neutral', sentiment_score: 50, created_at: instante(1) },
        { id: 'a5', sentiment: 'negativo', sentiment_score: 20, created_at: instante(2) },
        { id: 'a6', sentiment: 'negative', sentiment_score: 20, created_at: instante(2) },
        { id: 'a7', sentiment: 'critical', sentiment_score: 5, created_at: instante(3) },
        { id: 'a8', sentiment: 'critico', sentiment_score: 5, created_at: instante(3) },
      ],
    });

    const { result } = await esperarStats(7);
    expect(result.current.data?.positiveSentiment).toBe(2);
    expect(result.current.data?.neutralSentiment).toBe(2);
    expect(result.current.data?.negativeSentiment).toBe(4);
  });

  it('sentimento desconhecido ou ausente não entra em balde nenhum', async () => {
    tabelas({
      conversation_analyses: [
        { id: 'a1', sentiment: 'muito_contente', sentiment_score: 80, created_at: instante(0) },
        { id: 'a2', sentiment: null, sentiment_score: 80, created_at: instante(1) },
        { id: 'a3', sentiment: '', sentiment_score: 80, created_at: instante(2) },
        { id: 'a4', sentiment: 'positivo', sentiment_score: 80, created_at: instante(3) },
      ],
    });

    const { result } = await esperarStats(7);
    expect(result.current.data?.totalAnalyses).toBe(4);
    expect(result.current.data?.positiveSentiment).toBe(1);
    expect(result.current.data?.neutralSentiment).toBe(0);
    expect(result.current.data?.negativeSentiment).toBe(0);
  });

  it('as tendências comparam a janela atual com a anterior', async () => {
    tabelas({
      conversation_analyses: [
        { id: 'a1', sentiment: 'positivo', sentiment_score: 80, created_at: instante(0) },
        { id: 'a2', sentiment: 'negativo', sentiment_score: 80, created_at: instante(1) },
        { id: 'a3', sentiment: 'positivo', sentiment_score: 40, created_at: instante(8) },
      ],
    });

    const { result } = await esperarStats(7);
    const t = result.current.data?.trends;
    expect(t?.analyses).toEqual({ direction: 'up', change: 1, percentage: 100 });
    expect(t?.sentiment).toEqual({ direction: 'up', change: 40, percentage: 100 });
    expect(t?.negative.direction).toBe('up');
    expect(t?.negative.change).toBe(1);
  });
});

describe('useAIStats — série por dia', () => {
  beforeEach(() => tabelas());

  it('a série cobre exatamente os dias do período, do mais antigo ao mais recente', async () => {
    const { result } = await esperarStats(7);
    const serie = result.current.data?.sentimentTrend ?? [];

    expect(serie).toHaveLength(7);
    expect(serie.every((d) => /^\d{2}\/\d{2}$/.test(d.date))).toBe(true);
    expect(new Set(serie.map((d) => d.date)).size).toBe(7);
    expect(serie[0].date).not.toBe(serie[1].date);
  });

  it.fails('o rótulo do dia é o dia local da análise (não o dia anterior)', async () => {
    // `new Date(chave)` lê `yyyy-MM-dd` como meia-noite UTC: em UTC-3 o rótulo sai
    // com o dia ANTERIOR (defeito que src/lib/localDay.ts documenta e corrige).
    const { result } = await esperarStats(7);
    const serie = result.current.data?.sentimentTrend ?? [];

    expect(serie).toHaveLength(7);
    expect(serie[6].date).toBe(format(agora, 'dd/MM'));
    expect(serie[6].date).toBe(appDayKeyLabel(format(agora, 'yyyy-MM-dd')));
    expect(serie[0].date).toBe(format(subDays(agora, 6), 'dd/MM'));
  });

  it('cada dia traz a média das amostras válidas do dia e a quebra por classe', async () => {
    tabelas({
      conversation_analyses: [
        { id: 'a1', sentiment: 'positivo', sentiment_score: 80, created_at: instante(1, 9) },
        { id: 'a2', sentiment: 'positivo', sentiment_score: 60, created_at: instante(1, 14) },
        { id: 'a3', sentiment: 'negativo', sentiment_score: 40, created_at: instante(1, 16) },
        { id: 'a4', sentiment: 'neutro', sentiment_score: null, created_at: instante(2, 9) },
      ],
    });

    const { result } = await esperarStats(7);
    const serie = result.current.data?.sentimentTrend ?? [];
    const ontem = serie[5];
    const anteontem = serie[4];

    expect(ontem.score).toBe(60); // (80 + 60 + 40) / 3
    expect(ontem.positive).toBe(2);
    expect(ontem.negative).toBe(1);
    expect(ontem.neutral).toBe(0);

    expect(anteontem.score).toBeNull();
    expect(anteontem.neutral).toBe(1);
  });

  it('análise fora do período não aparece na série', async () => {
    tabelas({
      conversation_analyses: [
        { id: 'a1', sentiment: 'positivo', sentiment_score: 80, created_at: instante(20, 10) },
      ],
    });

    const { result } = await esperarStats(7);
    const serie = result.current.data?.sentimentTrend ?? [];
    expect(serie.every((d) => d.positive === 0 && d.score === null)).toBe(true);
    expect(result.current.data?.totalAnalyses).toBe(0);
  });
});

describe('useAIStats — transcrições e alertas', () => {
  beforeEach(() => tabelas());

  it('conta transcrições só do período, na janela atual e na anterior', async () => {
    tabelas({
      messages: [
        { id: 'm1', transcription: 'bom dia', created_at: instante(0) },
        { id: 'm2', transcription: 'tudo certo', created_at: instante(2) },
        { id: 'm3', transcription: null, created_at: instante(1) },
        { id: 'm4', transcription: 'anterior', created_at: instante(9) },
      ],
    });

    const { result } = await esperarStats(7);
    expect(result.current.data?.transcriptionsCount).toBe(2);
    expect(result.current.data?.trends.transcriptions).toEqual({ direction: 'up', change: 1, percentage: 100 });
  });

  it('os alertas vêm dos audit_logs das últimas 24h, no máximo 5', async () => {
    tabelas({
      audit_logs: [
        {
          id: 'log-1',
          action: 'sentiment_alert',
          entity_id: 'contato-1',
          created_at: instante(0, 9),
          details: { contact_name: 'Maria', sentiment_score: 10, consecutive_low: 3 },
        },
      ],
    });

    const { result } = await esperarStats(7);
    expect(result.current.data?.activeAlerts).toHaveLength(1);
    expect(result.current.data?.activeAlerts[0]).toMatchObject({
      id: 'log-1',
      contactId: 'contato-1',
      contact_name: 'Maria',
      sentiment_score: 10,
      consecutive_low: 3,
    });

    const leitura = h.queries.find((q) => q.table === 'audit_logs');
    expect(leitura?.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', col: 'action', val: 'sentiment_alert' },
        { op: 'limit', col: '', val: 5 },
      ]),
    );
    const desde = leitura?.filters.find((f) => f.op === 'gte');
    expect(typeof desde?.val).toBe('string');
    const janelaMs = Date.now() - new Date(String(desde?.val)).getTime();
    expect(Math.abs(janelaMs - 24 * 60 * 60 * 1000)).toBeLessThan(5000);
  });

  it('alerta sem detalhes não quebra o widget e mantém o contato', async () => {
    tabelas({
      audit_logs: [
        { id: 'log-1', action: 'sentiment_alert', entity_id: null, created_at: instante(0, 9), details: null },
      ],
    });

    const { result } = await esperarStats(7);
    expect(result.current.data?.activeAlerts[0]).toMatchObject({ id: 'log-1', contactId: null });
  });

  it('ações diferentes de sentiment_alert não viram alerta ativo', async () => {
    tabelas({
      audit_logs: [
        { id: 'log-1', action: 'login', entity_id: 'contato-1', created_at: instante(0, 9), details: {} },
      ],
    });

    const { result } = await esperarStats(7);
    expect(result.current.data?.activeAlerts).toHaveLength(0);
  });
});
