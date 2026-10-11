import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X147 — Fila por Segmento no Monitor ao Vivo (T11-046..052).
 *
 * A lista de destinatários do Monitor ganha a Fila por Segmento (agrupada por
 * `talkx_recipients.segment_id`) e o cabeçalho vivo mostra a Taxa de envio e o
 * Término estimado. O hook `useTalkXMonitor` entrega esses dados já agregados;
 * aqui provamos que a tela os exibe (dado real da campanha, não placeholder).
 */

const h = vi.hoisted(() => ({
  segmentQueue: [] as Array<{ segmentId: string | null; name: string; total: number; sent: number; remaining: number; progress: number }>,
  ratePerMinute: 0,
  finishMinutes: null as number | null,
}));

const CAMPAIGN = {
  id: 'camp-1',
  name: 'Campanha Fila',
  status: 'sending',
  message_template: 'mensagem de teste',
  total_recipients: 1205,
  sent_count: 305,
  delivered_count: 300,
  failed_count: 5,
  outcome_unknown_count: 0,
  started_at: null,
  completed_at: null,
  whatsapp_connection_id: null,
  created_at: '2026-10-10T10:00:00.000Z',
};

vi.mock('@/integrations/supabase/client', () => {
  const resolveChain = (table: string) =>
    Promise.resolve({ data: table === 'talkx_campaigns' ? CAMPAIGN : [], error: null });
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => resolveChain(table);
    chain.single = () => resolveChain(table);
    chain.maybeSingle = () => resolveChain(table);
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
  useTalkXEvents: () => ({ events: [], isLoading: false, isError: false, error: null, refetch: vi.fn(), logEvent: vi.fn() }),
}));
vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }),
}));
vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: () => ({
    rateByMinute: [],
    ratePerMinute: h.ratePerMinute,
    finishMinutes: h.finishMinutes,
    segmentQueue: h.segmentQueue,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { TalkXLiveMonitor } from '../TalkXLiveMonitor';

function renderMonitor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXLiveMonitor campaignId="camp-1" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('Fila por Segmento — TalkXLiveMonitor (X147)', () => {
  it('mostra um segmento por linha com Total/Enviadas/Restante/Progresso', async () => {
    h.segmentQueue = [
      { segmentId: 'seg-a', name: 'Clientes VIP', total: 1200, sent: 300, remaining: 900, progress: 25 },
      { segmentId: null, name: 'Sem segmento', total: 5, sent: 5, remaining: 0, progress: 100 },
    ];
    renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha Fila')).toBeTruthy());
    const section = screen.getByText('Fila por Segmento').closest('section') as HTMLElement;

    expect(within(section).getByText('Clientes VIP')).toBeTruthy();
    expect(within(section).getByText('Sem segmento')).toBeTruthy();
    // cabeçalho + 2 linhas
    expect(within(section).getAllByRole('row')).toHaveLength(3);
    expect(within(section).getByText('1.200')).toBeTruthy();
    expect(within(section).getByText('900')).toBeTruthy();
    expect(within(section).getByText('25%')).toBeTruthy();
    expect(within(section).getByText('100%')).toBeTruthy();
  });

  it('fila vazia: mostra o vazio, nunca linha inventada', async () => {
    h.segmentQueue = [];
    renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha Fila')).toBeTruthy());
    const section = screen.getByText('Fila por Segmento').closest('section') as HTMLElement;
    expect(within(section).getByText('Fila vazia')).toBeTruthy();
    expect(within(section).queryByRole('row')).toBeNull();
  });

  it('Saúde da Campanha mostra a Taxa de envio e o Término estimado calculados', async () => {
    h.ratePerMinute = 12.5;
    h.finishMinutes = 72; // 900 restantes a 12,5/min = 72 min
    renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha Fila')).toBeTruthy());
    const saude = screen.getByText('Saúde da Campanha').closest('section') as HTMLElement;
    expect(within(saude).getByText('12.5 msg/min')).toBeTruthy();
    expect(within(saude).getByText('1h 12m')).toBeTruthy();
  });

  it('série Previsto leva o sub "(previsto = taxa medida)", nunca ritmo real (ponto 5)', async () => {
    h.segmentQueue = [];
    renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha Fila')).toBeTruthy());
    expect(screen.getByText('(últimos 60 min · previsto = taxa medida)')).toBeTruthy();
  });

  it('sem taxa (fila parada) o término estimado fica "—", nunca 0 falso', async () => {
    h.ratePerMinute = 0;
    h.finishMinutes = null;
    renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha Fila')).toBeTruthy());
    const saude = screen.getByText('Saúde da Campanha').closest('section') as HTMLElement;
    expect(within(saude).getByText('0.0 msg/min')).toBeTruthy();
    expect(within(saude).getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});
