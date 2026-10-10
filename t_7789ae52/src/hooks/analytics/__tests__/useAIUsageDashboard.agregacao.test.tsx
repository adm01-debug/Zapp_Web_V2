import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * IA-056 — o teste que o aceite pede: uma janela com MAIS de 1.000 registros
 * mantém totais corretos, e o total não depende da página visualizada.
 *
 * Aqui a página visível devolve 50 linhas e o servidor declara 1.500 chamadas.
 * Se alguém voltar a somar `logs` no cliente, o total vira 50/1500 e este teste
 * quebra — que é exatamente o defeito antigo (`limit(1000)` + soma do array).
 */

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const rangeCalls: [number, number][] = [];

const RESUMO = {
  fonte: 'ai_usage_logs',
  escopo: 'permitido_ao_solicitante',
  gerado_em: '2026-10-03T07:00:00Z',
  filtros: {
    inicio: '2026-10-02T07:00:00Z', fim: '2026-10-03T07:00:00Z',
    janela_segundos: 86400, balde_segundos: 3600, limite_funcoes: 50, limite_usuarios: 20,
  },
  cobertura: {
    chamadas: 1500, primeiro_registro: '2026-10-02T07:01:00Z', ultimo_registro: '2026-10-03T06:59:00Z',
    truncado: false, chamadas_sem_tokens: 100, amostra_duracao: 1200,
    funcoes_distintas: 3, usuarios_distintos: 2,
  },
  totais: { chamadas: 1500, erros: 50, usuarios: 2, tokens: 9800, tokens_entrada: 2800, tokens_saida: 7000 },
  duracao_ms: { media: 1250, p95: 1495, amostra: 1200 },
  situacoes: { success: 1450, error: 50 },
  por_funcao: [
    { funcao: 'ai-suggest-reply', chamadas: 900, tokens: 6300, erros: 0, sem_tokens: 0 },
    { funcao: 'ai-summarize', chamadas: 500, tokens: 3500, erros: 50, sem_tokens: 0 },
    { funcao: 'classify-emoji', chamadas: 100, tokens: 0, erros: 0, sem_tokens: 100 },
  ],
  por_usuario: [
    { usuario: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', chamadas: 900, tokens: 6300 },
    { usuario: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', chamadas: 600, tokens: 3500 },
  ],
  serie: [
    { inicio: '2026-10-03T05:00:00Z', chamadas: 60, tokens: 420, erros: 0, por_funcao: { 'ai-suggest-reply': 60 } },
    { inicio: '2026-10-03T06:00:00Z', chamadas: 40, tokens: 280, erros: 2, por_funcao: { 'ai-suggest-reply': 30, 'ai-summarize': 10 } },
  ],
};

/** 50 linhas de página — de propósito, muito menos que as 1500 da janela. */
const PAGINA = Array.from({ length: 50 }, (_, i) => ({
  id: `log-${i}`, user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', profile_id: null,
  function_name: 'ai-suggest-reply', model: 'deepseek-v4-pro',
  input_tokens: 2, output_tokens: 5, total_tokens: 7, duration_ms: 1200,
  status: 'success', created_at: `2026-10-03T06:${String(i % 60).padStart(2, '0')}:00Z`,
}));

let respostaRpc: unknown = RESUMO;
let respostaPagina: { data: unknown[]; count: number; error: unknown } = { data: PAGINA, count: 1500, error: null };

vi.mock('@/integrations/supabase/client', () => {
  const construtorLista = () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.gte = () => b;
    b.order = () => b;
    b.range = (de: number, ate: number) => {
      rangeCalls.push([de, ate]);
      return Promise.resolve(respostaPagina);
    };
    return b;
  };
  return {
    supabase: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return Promise.resolve({ data: respostaRpc, error: null });
      },
      from: (tabela: string) => {
        if (tabela === 'profiles') return { select: () => Promise.resolve({ data: [] }) };
        return construtorLista();
      },
    },
  };
});

import { useAIUsageDashboard, LOGS_PER_PAGE } from '@/hooks/analytics/useAIUsageDashboard';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, {
    client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  }, children);

describe('IA-056 — totais vêm da agregação do servidor, não da página', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rangeCalls.length = 0;
    respostaRpc = RESUMO;
    respostaPagina = { data: PAGINA, count: 1500, error: null };
  });

  it('janela com 1500 registros devolve 1500 no total, com uma página de 50', async () => {
    const { result } = renderHook(() => useAIUsageDashboard(), { wrapper });
    await waitFor(() => expect(result.current.stats.totalCalls).toBe(1500));

    // A página tem 50 linhas; o total NÃO pode vir dela.
    expect(result.current.logs).toHaveLength(50);
    expect(result.current.stats.totalCalls).toBe(1500);
    expect(result.current.logsTotal).toBe(1500);
    expect(result.current.logsTotalPaginas).toBe(Math.ceil(1500 / LOGS_PER_PAGE));
    expect(result.current.stats.totalTokens).toBe(9800);
    expect(result.current.stats.uniqueUsers).toBe(2);
    expect(result.current.stats.errorCount).toBe(50);
  });

  it('pede a agregação à RPC com a janela e o balde declarados', async () => {
    const { result } = renderHook(() => useAIUsageDashboard(), { wrapper });
    await waitFor(() => expect(rpcCalls.length).toBeGreaterThan(0));

    const chamada = rpcCalls[0];
    expect(chamada.fn).toBe('ai_usage_summary');
    expect(typeof chamada.args.p_since).toBe('string');
    expect(chamada.args.p_bucket_seconds).toBe(3600); // filtro de 24h
    expect(chamada.args.p_top_users).toBe(20);
    expect(chamada.args.p_top_functions).toBe(50);
  });

  it('a lista é paginada pelo servidor (range), não fatiada no cliente', async () => {
    const { result } = renderHook(() => useAIUsageDashboard(), { wrapper });
    await waitFor(() => expect(rangeCalls.length).toBeGreaterThan(0));
    expect(rangeCalls[0]).toEqual([0, LOGS_PER_PAGE - 1]);

    result.current.setLogsPage(() => 1);
    await waitFor(() => expect(rangeCalls.some(([de]) => de === LOGS_PER_PAGE)).toBe(true));
    expect(rangeCalls.some(([de, ate]) => de === LOGS_PER_PAGE && ate === LOGS_PER_PAGE * 2 - 1)).toBe(true);
  });

  it('declara cobertura, filtros e escopo junto com os números', async () => {
    const { result } = renderHook(() => useAIUsageDashboard(), { wrapper });
    await waitFor(() => expect(result.current.cobertura).not.toBeNull());
    expect(result.current.cobertura?.chamadas).toBe(1500);
    expect(result.current.cobertura?.chamadas_sem_tokens).toBe(100);
    expect(result.current.filtros?.balde_segundos).toBe(3600);
    expect(result.current.escopo).toBe('permitido_ao_solicitante');
  });

  it('as quebras por função e usuário vêm do servidor', async () => {
    const { result } = renderHook(() => useAIUsageDashboard(), { wrapper });
    await waitFor(() => expect(result.current.functionUsage.length).toBe(3));
    expect(result.current.functionUsage[0]).toEqual({ name: 'ai-suggest-reply', calls: 900, tokens: 6300 });
    expect(result.current.userUsage[0].calls).toBe(900);
  });

  it('a série mantém a quebra por função (o gráfico é empilhado por função)', async () => {
    const { result } = renderHook(() => useAIUsageDashboard(), { wrapper });
    await waitFor(() => expect(result.current.timelineData.length).toBe(2));
    expect(result.current.timelineData[1]['ai-summarize']).toBe(10);
    expect(result.current.timelineData[0].time).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it('janela sem chamadas não inventa número (nem duração média)', async () => {
    respostaRpc = {
      ...RESUMO,
      cobertura: { ...RESUMO.cobertura, chamadas: 0, primeiro_registro: null, ultimo_registro: null, chamadas_sem_tokens: 0, amostra_duracao: 0, usuarios_distintos: 0, funcoes_distintas: 0 },
      totais: { chamadas: 0, erros: 0, usuarios: 0, tokens: 0, tokens_entrada: 0, tokens_saida: 0 },
      duracao_ms: { media: null, p95: null, amostra: 0 },
      por_funcao: [], por_usuario: [], serie: [], situacoes: {},
    };
    respostaPagina = { data: [], count: 0, error: null };

    const { result } = renderHook(() => useAIUsageDashboard(), { wrapper });
    await waitFor(() => expect(result.current.cobertura?.chamadas).toBe(0));
    expect(result.current.stats.totalCalls).toBe(0);
    expect(result.current.stats.avgDuration).toBe(0); // média ausente não vira NaN
    expect(result.current.functionUsage).toEqual([]);
  });
});
