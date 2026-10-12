/**
 * Isolamento de erro por bloco em Relatórios Avançados.
 *
 * Comportamento portado da V3 (SectionErrorBoundary): cada aba de análise é um
 * bloco independente. Um deles lançar erro não pode derrubar a tela — o
 * cabeçalho e as abas continuam, e as outras abas seguem funcionando. O teste
 * renderiza a TELA real (dados pelo mesmo mock de banco dos testes da tela) e
 * derruba só o bloco "Mapa de calor".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => {
  function makeQuery() {
    const q: Record<string, unknown> = {
      select: () => q,
      gte: () => q,
      lte: () => q,
      eq: () => q,
      order: () => q,
      range: () => Promise.resolve({ data: [], error: null }),
    };
    return q;
  }
  return { makeQuery };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => h.makeQuery() },
}));

// useAgents fala com o banco por conta própria; aqui só precisa existir.
vi.mock('@/hooks/crm/useAgents', () => ({ useAgents: () => ({ agents: [] }) }));

// Só o bloco do Mapa de calor falha; os outros provam que as abas seguem vivas.
vi.mock('../ConversationHeatmap', () => ({
  ConversationHeatmap: () => {
    throw new Error('falha proposital no mapa de calor');
  },
}));
vi.mock('../PeriodComparison', () => ({ PeriodComparison: () => <div data-testid="bloco-comparacao" /> }));
vi.mock('../DemandForecast', () => ({ DemandForecast: () => <div data-testid="bloco-previsao" /> }));
vi.mock('../AbandonmentRate', () => ({ AbandonmentRate: () => <div data-testid="bloco-abandono" /> }));

import { AdvancedReportsView } from '../AdvancedReportsView';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('AdvancedReportsView — isolamento de erro por bloco', () => {
  it('um bloco de análise que lança erro mostra aviso e não derruba a tela nem as outras abas', () => {
    render(<AdvancedReportsView />, { wrapper: makeWrapper() });

    // Abre a aba cujo bloco falha (Radix ativa a aba no mouseDown).
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Heatmap/ }));
    expect(screen.getByText('Erro em "Mapa de calor"')).toBeInTheDocument();

    // A tela continua de pé.
    expect(screen.getByText('Relatórios Avançados')).toBeInTheDocument();

    // E outra aba continua utilizável.
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Comparativo/ }));
    expect(screen.getByTestId('bloco-comparacao')).toBeInTheDocument();
  });
});
