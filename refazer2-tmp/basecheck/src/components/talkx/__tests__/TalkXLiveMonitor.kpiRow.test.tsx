import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X146 — a faixa de KPIs ao vivo DENTRO da tela 11 (Monitor). O teste do componente
 * (`TalkXLiveKpiRow.test.tsx`) prova a faixa; este arquivo prova que a TELA usa a faixa
 * e que o dado que entra nela sai da campanha aberta — o caminho que a tela realmente
 * percorre, e não um componente montado à mão pelo teste.
 *
 * O comportamento novo que só existe aqui é o clique na linha "N a confirmar": ele
 * leva para a aba Destinatários JÁ filtrada por `outcome_unknown`.
 */

const h = vi.hoisted(() => ({
  statusFilters: [] as string[],
  refetchRate: vi.fn(),
  refetchEvents: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const CAMPAIGN = {
    id: 'camp-1',
    name: 'Campanha X146',
    status: 'sending',
    message_template: 'mensagem de teste',
    total_recipients: 5000,
    sent_count: 1250,
    delivered_count: 1180,
    replied_count: 289,
    failed_count: 42,
    outcome_unknown_count: 2,
    started_at: null,
    completed_at: null,
    whatsapp_connection_id: null,
    created_at: '2026-10-05T10:00:00.000Z',
  };

  const resolveChain = (table: string) => (table === 'talkx_campaigns' ? { data: CAMPAIGN, error: null } : { data: [], error: null });

  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, value: unknown) => {
      if (col === 'status') h.statusFilters.push(String(value));
      return chain;
    };
    chain.order = () => chain;
    // A consulta real é `.limit(200).eq('status', …)` quando há filtro: `limit` continua
    // devolvendo a cadeia (thenable), senão o encadeamento quebra antes do filtro.
    chain.limit = () => chain;
    chain.single = () => Promise.resolve(resolveChain(table));
    chain.then = (resolve: (value: unknown) => void) => resolve(resolveChain(table));
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => makeChain(table),
      channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
      removeChannel: () => {},
    },
  };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({ startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXEvents', () => ({
  useTalkXEvents: () => ({
    events: [], isLoading: false, isError: false, error: null, refetch: h.refetchEvents, logEvent: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }),
}));

vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: () => ({
    rateByMinute: [
      { label: '14:00', Enviadas: 10, Entregues: 8 },
      { label: '14:01', Enviadas: 12, Entregues: 12 },
      { label: '14:02', Enviadas: 9, Entregues: 7 },
    ],
    isLoading: false,
    isError: false,
    refetch: h.refetchRate,
  }),
}));

import { TalkXLiveMonitor } from '../TalkXLiveMonitor';

function renderMonitor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXLiveMonitor campaignId="camp-1" onBack={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.statusFilters = [];
  h.refetchRate = vi.fn();
  h.refetchEvents = vi.fn();
});

describe('TalkXLiveMonitor — faixa de KPIs ao vivo (X146)', () => {
  it('a tela 11 monta a faixa com os números da campanha aberta', async () => {
    renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha X146')).toBeTruthy());
    expect(screen.getByTestId('talkx-live-kpi-row')).toBeTruthy();
    expect(screen.getByText('Enviadas')).toBeTruthy();
    expect(screen.getByText('Entregues')).toBeTruthy();
    expect(screen.getByText('Respondidas')).toBeTruthy();
    expect(screen.getByText('Falhas')).toBeTruthy();
    // sem fonte de opt-out por campanha o cartão não entra na faixa
    expect(screen.queryByText('Opt-outs')).toBeNull();
    // sem comparativo do painel (X144) a linha "vs. ontem" não é inventada
    expect(screen.queryByText(/vs\. ontem/)).toBeNull();
  });

  it('clique em "a confirmar" abre Destinatários já filtrados por outcome_unknown', async () => {
    renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha X146')).toBeTruthy());
    h.statusFilters = [];

    fireEvent.click(screen.getByRole('button', { name: '2 a confirmar' }));

    await waitFor(() => expect(h.statusFilters).toContain('outcome_unknown'));
    const tab = screen.getByRole('button', { name: 'Destinatários' });
    expect(tab.className).toContain('border-primary');
  });
});
