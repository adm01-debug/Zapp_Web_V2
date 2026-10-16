import { render } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

// O componente consulta talkx_recipients via fromTable → supabase.from. Mockamos o
// cliente para não bater na rede; o objetivo aqui é a ORDEM dos hooks, não os dados.
vi.mock('@/integrations/supabase/client', () => {
  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  });
  return { supabase: { from: mockFrom } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// Recharts renderiza SVG com dimensão zero no jsdom; mockamos para isolar a ordem dos hooks.
vi.mock('recharts', () => {
  const Node = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    BarChart: Node, Bar: () => <div />, XAxis: () => <div />, YAxis: () => <div />,
    CartesianGrid: () => <div />, Tooltip: () => <div />,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Cell: () => <div />, LabelList: () => <div />,
  };
});

vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));

// useTalkXInsights é mockado chamando um hook REAL (useMemo) para reproduzir a regressão:
// se a chamada ficar atrás de um return antecipado, o React lança "Rendered more hooks"
// quando a lista passa de 0 para 1 campanha.
vi.mock('@/hooks/integrations/useTalkXInsights', async () => {
  const { useMemo } = await import('react');
  return {
    useTalkXInsights: () => {
      useMemo(() => ({}), []);
      return { data: [], isLoading: false, isError: false } as never;
    },
  };
});

import { TalkXAnalytics } from '@/components/talkx/TalkXAnalytics';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

function withClient(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('TalkXAnalytics — ordem dos hooks (X007)', () => {
  it('renderiza com 0 campanhas e re-renderiza com 1 sem lançar', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const W = withClient(client);

    const { rerender } = render(
      <W>
        <TalkXAnalytics campaigns={[]} />
      </W>,
    );

    const campaign = {
      id: 'c1', name: 'Campanha 1', status: 'sent', sent_count: 10,
      delivered_count: 9, failed_count: 1, total_recipients: 10,
      started_at: new Date().toISOString(),
    } as unknown as TalkXCampaign;

    expect(() => rerender(
      <W>
        <TalkXAnalytics campaigns={[campaign]} />
      </W>,
    )).not.toThrow();
  });
});
