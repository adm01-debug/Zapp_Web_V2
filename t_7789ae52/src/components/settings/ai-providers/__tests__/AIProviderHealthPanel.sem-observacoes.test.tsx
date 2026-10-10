import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * IA-057 — aceite: "nenhum provedor recebe 100% de sucesso por ausência de
 * observações". O defeito medido estava em AIProviderHealthPanel.tsx:53
 * (`stats.total > 0 ? ... : 100`), que devolvia 100 e pintava o ícone de verde
 * quando nao havia NENHUMA chamada.
 */
const logsDaConsulta: { atual: unknown[]; erro?: unknown } = { atual: [] };

vi.mock('@/integrations/supabase/client', () => {
  const construtor = () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.gte = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: logsDaConsulta.atual, error: logsDaConsulta.erro ?? null }).then(resolve);
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

const log = (status: string, duration: number | null = 120) => ({
  id: crypto.randomUUID(),
  function_name: 'ai-proxy',
  model: 'modelo-x',
  status,
  duration_ms: duration,
  input_tokens: 10,
  output_tokens: 5,
  total_tokens: 15,
  error_message: null,
  created_at: new Date().toISOString(),
  metadata: { provider_type: 'openrouter' },
});

describe('IA-057 — saúde dos provedores não inventa número', () => {
  beforeEach(() => {
    logsDaConsulta.atual = [];
    logsDaConsulta.erro = undefined;
  });

  it('SEM observações: não existe 100% e o estado é "sem dados", não saudável', async () => {
    renderizar();
    // O título do painel aparece sempre; o KPI de taxa não pode afirmar 100%.
    expect(await screen.findByText(/Sa[uú]de dos Provedores/i)).toBeTruthy();
    expect(screen.queryByText('100%')).toBeNull();
    expect(screen.queryByText('Taxa de Sucesso')).toBeNull();
  });

  it('SEM observações: diz explicitamente que não há dados', async () => {
    renderizar();
    const vazio = await screen.findAllByText(/sem dados|sem chamadas|nenhuma chamada/i);
    expect(vazio.length).toBeGreaterThan(0);
  });

  it('só erros: taxa 0% (não 100%), e erro aparece separado', async () => {
    logsDaConsulta.atual = [log('error'), log('error')];
    renderizar();
    // 0% aparece em Taxa de Sucesso e em Disponibilidade: ambos os indicadores
    // veem a mesma amostra, e NENHUM deles pode afirmar 100%.
    expect((await screen.findAllByText('0%')).length).toBeGreaterThan(0);
    expect(screen.queryByText('100%')).toBeNull();
    expect(screen.getByText(/Erros/i)).toBeTruthy();
  });

  it('amostra mista: taxa reflete as observações e a amostra é declarada', async () => {
    logsDaConsulta.atual = [log('success'), log('success'), log('error'), log('fallback')];
    renderizar();
    expect((await screen.findAllByText('50%')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4 chamadas|amostra de 4/i).length).toBeGreaterThan(0);
  });

  it('duração NÃO medida não entra como zero na estatística', async () => {
    // 3 medidas (100/200/300) + 2 sem medição: p50 tem de ser 200, nunca 120
    // (que é o que daria tratando as não medidas como zero).
    logsDaConsulta.atual = [
      log('success', 100), log('success', 200), log('success', 300),
      log('success', null), log('success', null),
    ];
    renderizar();
    expect((await screen.findAllByText(/200ms/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/120ms/)).toBeNull();
    expect(screen.getAllByText(/2 sem medi[cç][aã]o/i).length).toBeGreaterThan(0);
  });
});
