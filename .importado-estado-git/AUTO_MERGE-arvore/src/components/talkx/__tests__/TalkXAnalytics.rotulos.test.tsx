import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * R2-MOD-037 — rótulos do Analytics Talk X devem corresponder à fórmula medida.
 *
 * Antes: o comparativo calculava sent/total_recipients ("Taxa de envio") mas a legenda
 * dizia "Taxa de entrega", e o card "Melhor horário" (pico de volume de envios) prometia
 * "maior taxa de abertura". Este teste prova os rótulos corretos.
 */

const hourlyRows = [
  { sent_at: '2026-10-05T12:00:00.000Z', status: 'sent' },
  { sent_at: '2026-10-05T12:01:00.000Z', status: 'delivered' },
];

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = chain; b.in = chain; b.gte = chain; b.eq = chain; b.order = chain; b.limit = chain;
    b.not = () => Promise.resolve({ data: hourlyRows, error: null });
    return b;
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: [], isLoading: false, isError: false, error: null }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

// X185: o card "Comparativo de Campanhas" saiu; quem responde pelo comparativo no
// rail é o de PERÍODOS, alimentado pela RPC. Aqui ele recebe dados para o rótulo de
// cada linha poder ser conferido contra a métrica devolvida.
vi.mock('@/hooks/crm/useCRMAdminAccess', () => ({ useCRMAdminAccess: () => false }));
vi.mock('@/hooks/team-chat/useActiveDepartments', () => ({ useActiveDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/integrations/useTalkXAnalytics', async (orig) => {
  const actual = await orig<typeof import('@/hooks/integrations/useTalkXAnalytics')>();
  return {
    ...actual,
    useTalkXAnalytics: () => ({
      data: {
        current: { campaigns_sent: 3, reply_rate_pct: 13.3, revenue: null },
        previous: { campaigns_sent: 2, reply_rate_pct: 10, revenue: null },
        active: 0,
        daily: [],
      },
      isPending: false,
    }),
  };
});

import { TalkXAnalytics } from '../TalkXAnalytics';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const campaigns = [
  {
    id: 'c1', name: 'Campanha A', status: 'completed', sent_count: 100, delivered_count: 20,
    failed_count: 0, total_recipients: 100, started_at: new Date().toISOString(),
    completed_at: new Date('2026-10-05T10:00:00.000Z').toISOString(),
    updated_at: new Date('2026-10-05T10:00:00.000Z').toISOString(),
  },
  {
    id: 'c2', name: 'Campanha B', status: 'completed', sent_count: 50, delivered_count: 40,
    failed_count: 0, total_recipients: 50, started_at: new Date().toISOString(),
    completed_at: new Date('2026-10-05T09:00:00.000Z').toISOString(),
    updated_at: new Date('2026-10-05T09:00:00.000Z').toISOString(),
  },
] as unknown as TalkXCampaign[];

describe('rótulos do Analytics (R2-MOD-037)', () => {
  it('o comparativo de períodos rotula cada linha pela métrica da RPC', () => {
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    const section = screen.getByTestId('comparativo-periodos');
    // Cada linha diz de que número fala e o valor bate com o campo devolvido.
    expect(within(section).getByText('Campanhas enviadas')).toBeTruthy();
    expect(within(section).getByText('Taxa de resposta')).toBeTruthy();
    expect(within(section).getByText('13,3%')).toBeTruthy();
    expect(within(section).getByText('+3,3 p.p.')).toBeTruthy();
    expect(within(section).getByText('+50%')).toBeTruthy();
    // A série antiga (envio × falha por campanha) saiu da tela: nenhum rótulo de
    // taxa de envio/entrega sobrou no comparativo.
    expect(within(section).queryByText('Taxa de envio')).toBeNull();
    expect(within(section).queryByText('Taxa de entrega')).toBeNull();
    expect(screen.queryByText('Comparativo de Campanhas')).toBeNull();
  });

  it('card de horário fala de volume de envios e não promete abertura', async () => {
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    expect(screen.getByText('Pico de envios no período')).toBeTruthy();
    expect(screen.queryByText('Pico de entrega no período')).toBeNull();
    await waitFor(() => expect(screen.getByText(/Não mede abertura/)).toBeTruthy());
    expect(screen.queryByText(/maior taxa de abertura/i)).toBeNull();
  });
});
