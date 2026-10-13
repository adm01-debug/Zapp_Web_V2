import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Estado de carregamento e falha do painel de Consumo de IA.
 *
 * Antes deste cartão o hook só devolvia `isLoading` do resumo (que a tela nem
 * usava) e engolia a falha das consultas: falha na agregação virava cartões 0,
 * "Nenhum dado no período" e tendência zerada — indistinguível de uma janela
 * legitimamente vazia —, e falha na lista virava `[]` como se não houvesse log.
 * Aqui se prova que o hook DIZ que falhou (isError/error) e que ainda está
 * buscando (isLoading/isLoadingLogs), para a tela poder separar os dois casos.
 */

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
  por_funcao: [{ funcao: 'ai-suggest-reply', chamadas: 900, tokens: 6300, erros: 0, sem_tokens: 0 }],
  por_usuario: [{ usuario: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', chamadas: 900, tokens: 6300 }],
  serie: [
    { inicio: '2026-10-03T06:00:00Z', chamadas: 40, tokens: 280, erros: 2, por_funcao: { 'ai-suggest-reply': 30 } },
  ],
};

const PAGINA = [{
  id: 'log-0', user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', profile_id: null,
  function_name: 'ai-suggest-reply', model: 'deepseek-v4-flash',
  input_tokens: 2, output_tokens: 5, total_tokens: 7, duration_ms: 1200,
  status: 'success', created_at: '2026-10-03T06:00:00Z',
}];

let falhaResumo: unknown = null;
let falhaLogs: unknown = null;

vi.mock('@/integrations/supabase/client', () => {
  const construtorLista = () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.gte = () => b;
    b.order = () => b;
    b.range = () => Promise.resolve(
      falhaLogs ? { data: null, count: null, error: falhaLogs } : { data: PAGINA, count: 1, error: null },
    );
    return b;
  };
  return {
    supabase: {
      rpc: (fn: string) => {
        if (fn === 'ai_usage_cost_summary') return Promise.resolve({ data: null, error: null });
        return Promise.resolve(
          falhaResumo ? { data: null, error: falhaResumo } : { data: RESUMO, error: null },
        );
      },
      from: (tabela: string) =>
        tabela === 'profiles' ? { select: () => Promise.resolve({ data: [] }) } : construtorLista(),
    },
  };
});

import { useAIUsageDashboard } from '@/hooks/analytics/useAIUsageDashboard';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, {
    client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  }, children);

describe('Consumo de IA — carregando e erro não se confundem com "sem dado"', () => {
  beforeEach(() => {
    falhaResumo = null;
    falhaLogs = null;
  });

  it('enquanto a agregação não responde, isLoading está ligado e não há erro', async () => {
    const { result } = renderHook(() => useAIUsageDashboard(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
  });

  it('falha na agregação do resumo aparece como isError com o erro do servidor', async () => {
    const erro = new Error('permission denied for function ai_usage_summary');
    falhaResumo = erro;

    const { result } = renderHook(() => useAIUsageDashboard(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(erro);
    expect(result.current.isLoading).toBe(false);
    // Os zeros continuam ali, mas agora a tela tem como saber que NÃO são medição.
    expect(result.current.stats.totalCalls).toBe(0);
    expect(result.current.functionUsage).toEqual([]);
    expect(result.current.timelineData).toEqual([]);
    expect(result.current.cobertura).toBeNull();
  });

  it('sucesso não marca erro nem inventa mensagem', async () => {
    const { result } = renderHook(() => useAIUsageDashboard(), { wrapper });
    await waitFor(() => expect(result.current.stats.totalCalls).toBe(1500));

    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('falha na lista de logs sai como logsError, e não como lista vazia silenciosa', async () => {
    const erro = new Error('statement timeout');
    falhaLogs = erro;

    const { result } = renderHook(() => useAIUsageDashboard(), { wrapper });
    await waitFor(() => expect(result.current.logsError).toBe(true));

    expect(result.current.isLoadingLogs).toBe(false);
    expect(result.current.logs).toEqual([]);
  });
});
