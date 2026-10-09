import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * TL-173 (X188) — painel Insights do Analytics: título e frase do painel, botão em
 * cada cartão executando a ação da regra e Resumo com estimativa CONDICIONADA.
 *
 * Antes: o painel não tinha a frase, `applyLabel` vinha sem ação (o botão nunca
 * aparecia) e não existia Resumo. Este teste RENDERIZA o componente real e clica
 * nos botões — o alvo da ação é provado pelo endereço/rota que a tela escreve.
 */

const h = vi.hoisted(() => ({
  calls: [] as number[],
  result: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: (windowDays: number) => {
    h.calls.push(windowDays);
    return h.result;
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = chain; b.in = chain; b.gte = chain; b.eq = chain; b.order = chain; b.limit = chain;
    b.not = () => Promise.resolve({ data: [], error: null });
    return b;
  },
}));

vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

// Recharts não mede dimensão no jsdom; o painel testado não depende dos gráficos.
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    BarChart: Box, Bar: () => <div />, XAxis: () => <div />, YAxis: () => <div />,
    CartesianGrid: () => <div />, Tooltip: () => <div />, LabelList: () => <div />, Cell: () => <div />,
    ResponsiveContainer: Box,
  };
});

import { TalkXAnalytics } from '../TalkXAnalytics';
import type { TalkXInsight } from '@/hooks/integrations/useTalkXInsights';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const campaigns = [
  {
    id: 'c1', name: 'Campanha A', status: 'completed', sent_count: 100, delivered_count: 20,
    failed_count: 0, total_recipients: 100, started_at: new Date().toISOString(),
    completed_at: new Date('2026-10-05T10:00:00.000Z').toISOString(),
    updated_at: new Date('2026-10-05T10:00:00.000Z').toISOString(),
  },
] as unknown as TalkXCampaign[];

function insight(over: Partial<TalkXInsight> & { id: string }): TalkXInsight {
  return {
    type: 'timing', title: 'Título', description: 'Descrição', priority: 'high', ...over,
  };
}

const COM_ACAO: TalkXInsight[] = [
  insight({ id: 'best-hour', title: 'Janela de horário com mais respostas', applyLabel: 'Aplicar sugestão', action: 'new-campaign' }),
  insight({ id: 'best-template', type: 'template', priority: 'medium', title: 'Mensagem com maior taxa de resposta', applyLabel: 'Ver templates', action: 'templates' }),
];

function mockInsights(over: Record<string, unknown>) {
  h.result = { data: [], isLoading: false, isError: false, error: null, estimatedLiftPct: null, ...over };
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  h.calls = [];
  window.history.replaceState(null, '', '/');
  mockInsights({});
});

describe('painel Insights do Analytics (TL-173)', () => {
  it('mostra o título "Insights" com a frase do painel', () => {
    mockInsights({ data: COM_ACAO });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    const painel = screen.getByLabelText('Insights');
    expect(within(painel).getByText('Insights')).toBeTruthy();
    expect(within(painel).getByText('Análise dos seus dados de campanhas.')).toBeTruthy();
    // O título de IA (CAP-086, fora desta etapa) não aparece.
    expect(screen.queryByText('Insights da IA')).toBeNull();
  });

  it('cada cartão traz o botão da ação da regra', () => {
    mockInsights({ data: COM_ACAO });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    expect(screen.getByRole('button', { name: 'Aplicar sugestão →' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver templates →' })).toBeTruthy();
  });

  it('a janela dos insights é o período escolhido na tela', () => {
    mockInsights({ data: COM_ACAO });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    expect(h.calls).toContain(30); // padrão da barra
    fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 dias' }));
    expect(h.calls).toContain(7);
  });

  it('Resumo: sem recomendação mostra o texto base, sem percentual', () => {
    mockInsights({ data: [] });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    const resumo = screen.getByText('Resumo').closest('div') as HTMLElement;
    expect(within(resumo).getByText('Ainda não há dados suficientes para recomendações.')).toBeTruthy();
    expect(within(resumo).queryByText(/%/)).toBeNull();
  });

  it('Resumo: sem estimativa medida conta as recomendações e não inventa percentual', () => {
    mockInsights({ data: COM_ACAO, estimatedLiftPct: null });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    const resumo = screen.getByText('Resumo').closest('div') as HTMLElement;
    expect(within(resumo).getByText(/2 recomendações/)).toBeTruthy();
    expect(within(resumo).queryByText(/%/)).toBeNull();
  });

  it('Resumo: com estimativa medida mostra o percentual marcado como estimativa', () => {
    mockInsights({ data: COM_ACAO, estimatedLiftPct: 0.12 });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    const resumo = screen.getByText('Resumo').closest('div') as HTMLElement;
    expect(within(resumo).getByText(/12%/)).toBeTruthy();
    expect(within(resumo).getByText(/estimativa medida/)).toBeTruthy();
  });

  it('"Ver templates →" leva à aba de templates', () => {
    mockInsights({ data: COM_ACAO });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver templates →' }));
    expect(window.location.search).toContain('tab=templates');
  });

  it('"Aplicar sugestão →" abre uma campanha nova (rota do assistente)', () => {
    mockInsights({ data: COM_ACAO });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugestão →' }));
    const search = new URLSearchParams(window.location.search);
    expect(search.get('wizard')).toBe('new');
    expect(search.get('view')).toBe('talkx');
  });
});
