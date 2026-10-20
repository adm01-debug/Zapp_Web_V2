import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * R2-API-043 (item 217) — "Painel de saúde exclui chamadas de IA registradas
 * fora de ai-proxy".
 *
 * Defeito medido em AIProviderHealthPanel.tsx: a consulta usava
 * `.eq('function_name', 'ai-proxy')`. O roteador central (`generateWithRouting`)
 * grava em `ai_usage_logs.function_name` o nome da FUNÇÃO CHAMADORA (voice-agent,
 * ai-auto-tag, classify-*, chatbot-l1, ...), não "ai-proxy". Quando não havia
 * nenhuma linha `ai-proxy` na janela, o painel geral declarava "nenhuma chamada
 * de IA foi observada", escondendo a atividade real.
 *
 * O mock abaixo HONRA os filtros pedidos (diferente do mock de sem-observacoes):
 * com o filtro errado, uma fixture só de voice-agent/ai-auto-tag volta vazia e
 * prova o defeito (vermelho). Sem o filtro, as mesmas linhas viram observações.
 */
const estado: { linhas: Record<string, unknown>[]; erro: null | { message: string } } = {
  linhas: [],
  erro: null,
};

vi.mock('@/integrations/supabase/client', () => {
  const construtor = () => {
    let resultado = [...estado.linhas];
    const b: Record<string, unknown> = {};
    b.select = () => b;
    // Filtro de verdade: é exatamente o `.eq('function_name', 'ai-proxy')` que
    // o defeito exercia.
    b.eq = (coluna: string, valor: unknown) => {
      resultado = resultado.filter((linha) => linha[coluna] === valor);
      return b;
    };
    b.gte = () => b;
    b.order = () => b;
    b.limit = (n: number) => {
      resultado = resultado.slice(0, n);
      return b;
    };
    b.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: estado.erro ? null : resultado, error: estado.erro }).then(resolve);
    return b;
  };
  return { supabase: { from: construtor } };
});

import { AIProviderHealthPanel } from '@/components/settings/ai-providers/AIProviderHealthPanel';

const renderizar = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    React.createElement(QueryClientProvider, { client }, React.createElement(AIProviderHealthPanel)),
  );
};

const log = (functionName: string, status = 'success') => ({
  id: crypto.randomUUID(),
  function_name: functionName,
  model: 'modelo-x',
  status,
  duration_ms: 120,
  input_tokens: 10,
  output_tokens: 5,
  total_tokens: 15,
  error_message: null,
  created_at: new Date().toISOString(),
  metadata: { provider_type: 'openrouter' },
});

describe('R2-API-043 — painel cobre as chamadas de IA fora do ai-proxy', () => {
  beforeEach(() => {
    estado.linhas = [];
    estado.erro = null;
  });

  it('fixture só com voice-agent/ai-auto-tag produz observações no painel geral', async () => {
    estado.linhas = [log('voice-agent'), log('ai-auto-tag')];
    renderizar();

    // O painel geral precisa CONTAR as chamadas das funções modernas.
    expect(await screen.findByText('Taxa de Sucesso')).toBeTruthy();
    expect(screen.queryByText(/Nenhuma chamada de IA foi observada/i)).toBeNull();
    // A indicação de amostra é preservada.
    expect(screen.getAllByText(/amostra de 2|2 chamadas/i).length).toBeGreaterThan(0);
  });

  it('erro de leitura é mostrado separado de uma amostra bem-sucedida e vazia', async () => {
    estado.erro = { message: 'permission denied for table ai_usage_logs' };
    renderizar();

    expect(
      await screen.findByText('Não foi possível ler o histórico de chamadas de IA'),
    ).toBeTruthy();
    expect(screen.getAllByText(/erro de leitura/i).length).toBeGreaterThan(0);
    // Um erro de leitura NÃO pode ser lido como "nenhuma chamada observada".
    expect(screen.queryByText(/Nenhuma chamada de IA foi observada/i)).toBeNull();
    expect(screen.queryByText('Taxa de Sucesso')).toBeNull();
  });
});
