import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// DASH-CONTROLS-001 (ponto 4): o tooltip afirmava "intervalo de confiança de
// 95%" sem método/calibração, e `currentCapacity = 35` era um default fixo —
// a linha de capacidade e o "Em Risco" eram contra um número inventado.
// Agora a capacidade vem de global_settings ('demand_capacity_per_hour') ou da
// prop; sem fonte, o componente diz "Não configurada" em vez de fingir.

const h = vi.hoisted(() => ({
  messagesRows: [] as { created_at: string }[],
  capacitySetting: null as { value: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        gte: async () => ({ data: table === 'messages' ? h.messagesRows : [], error: null }),
        eq: () => ({
          maybeSingle: async () => ({ data: h.capacitySetting, error: null }),
        }),
      }),
    }),
  },
}));

// Tooltip sempre aberta no stub — o conteúdo (incluindo a alegação de 95%)
// fica no DOM para a assertiva honesta.
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  TooltipContent: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  AreaChart: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  Area: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
  ReferenceLine: () => createElement('div', { 'data-testid': 'capacity-line' }),
  Tooltip: () => null,
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: () => ({ children, className }: { children?: React.ReactNode; className?: string }) =>
      createElement('div', { className }, children),
  }),
}));

import { DemandPrediction } from '../DemandPrediction';
import { useDemandPrediction, useConfiguredDemandCapacity } from '@/hooks/business/useDemandPrediction';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);

// `n` mensagens num mesmo horário-do-dia. O histórico é média por hora sobre 7
// dias: 350 msgs às "21h atrás" (mesmo horário de daqui a 3h) enchem o bucket
// do slot previsto i=3 → predicted = 50 msgs/h.
const msgsNaHora = (n: number, horasAtras: number) => {
  const t = new Date();
  t.setHours(t.getHours() - horasAtras, 0, 0, 0);
  return Array.from({ length: n }, () => ({ created_at: t.toISOString() }));
};

beforeEach(() => {
  h.messagesRows = msgsNaHora(350, 21); // previsto 50/h no slot daqui a 3h
  h.capacitySetting = null;
});

describe('useDemandPrediction — capacidade não é mais 35 fixo', () => {
  it('sem capacidade configurada, capacityRisk é false mesmo com previsão alta', async () => {
    const { result } = renderHook(() => useDemandPrediction(undefined, undefined), { wrapper });
    await waitFor(() => expect(result.current.insights.capacityConfigured).toBe(false));
    expect(result.current.insights.capacityRisk).toBe(false);
  });

  it('com capacidade informada, capacityRisk compara com ela', async () => {
    const { result } = renderHook(() => useDemandPrediction(undefined, 40), { wrapper });
    // previsto 50/h > 40 → risco (espera o histórico resolver)
    await waitFor(() => expect(result.current.insights.capacityRisk).toBe(true));
    const ok = renderHook(() => useDemandPrediction(undefined, 60), { wrapper });
    await waitFor(() => expect(ok.result.current.insights.maxPredicted).toBe(50));
    expect(ok.result.current.insights.capacityRisk).toBe(false);
  });
});

describe('useConfiguredDemandCapacity — lê global_settings', () => {
  it('devolve o número configurado e null quando ausente/inválido', async () => {
    h.capacitySetting = { value: '48' };
    const { result } = renderHook(() => useConfiguredDemandCapacity(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(48));
  });
  it('sem linha ou valor inválido → null (não inventa 35)', async () => {
    h.capacitySetting = null;
    const { result } = renderHook(() => useConfiguredDemandCapacity(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('DemandPrediction — componente', () => {
  it('sem capacidade configurada: sem linha, rótulo honesto e nenhum "95%"', async () => {
    h.capacitySetting = null;
    render(createElement(DemandPrediction), { wrapper });
    await waitFor(() => expect(screen.getByText('Não configurada')).toBeInTheDocument());
    expect(screen.queryByTestId('capacity-line')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('95%');
    expect(document.body.textContent).not.toContain('intervalo de confiança');
  });

  it('com a capacidade configurada em global_settings, a linha aparece', async () => {
    h.capacitySetting = { value: '40' };
    render(createElement(DemandPrediction), { wrapper });
    await waitFor(() => expect(screen.getByTestId('capacity-line')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Em Risco')).toBeInTheDocument());
  });

  it('prop currentCapacity continua tendo precedência', async () => {
    h.capacitySetting = null;
    render(createElement(DemandPrediction, { currentCapacity: 40 }), { wrapper });
    await waitFor(() => expect(screen.getByTestId('capacity-line')).toBeInTheDocument());
  });
});
