import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { TalkXReportFunnelSegment, TalkXReportFunnelStep } from '../talkxReportCharts';
import { TalkXCampaignReport } from '../TalkXCampaignReport';

/**
 * X058 no relatório: o seletor de segmento do funil troca os números do funil.
 * Com um segmento escolhido, Enviadas/Entregues/Respondidas vêm da linha dele em
 * `talkx_campaign_queue_by_segment`; Cliques não têm recorte por segmento e ficam
 * sem dados. "Sem segmento" (segment_id null) vira um item próprio do seletor.
 */

const { state } = vi.hoisted(() => ({
  state: { bySegment: [] as unknown[] },
}));

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: false, isLoading: false }),
}));

vi.mock('@/lib/supabaseHelpers', () => {
  const fromTable = () => {
    const builder: Record<string, unknown> = {
      select: () => builder, eq: () => builder, not: () => builder, order: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
    };
    return builder;
  };
  const realtimeChannel = () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  };
  return {
    fromTable,
    supabase: {
      from: fromTable,
      rpc: (name: string) =>
        Promise.resolve({
          data:
            name === 'talkx_campaign_queue_by_segment'
              ? { by_segment: state.bySegment }
              : {
                  kpis: {
                    total_recipients: 100, sent_count: 100, delivered_count: 90, read_count: 50,
                    failed_count: 0, outcome_unknown_count: 0, delivery_rate_pct: 90, duration_secs: 300,
                  },
                },
          error: null,
        }),
      channel: realtimeChannel,
      removeChannel: vi.fn(),
    },
    invokeEdge: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});

vi.mock('../TalkXReportPerformance', () => ({
  TalkXReportPerformance: () => React.createElement('div', { 'data-testid': 'performance' }),
}));
vi.mock('../TalkXReportHeatmap', () => ({
  TalkXReportHeatmap: () => React.createElement('div', { 'data-testid': 'heatmap' }),
}));
vi.mock('../TalkXReportFunnel', () => ({
  TalkXReportFunnel: ({
    steps,
    segments,
    segmentId,
    onSegmentChange,
  }: {
    steps: TalkXReportFunnelStep[];
    segments: TalkXReportFunnelSegment[];
    segmentId: string | null;
    onSegmentChange: (id: string | null) => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'funnel', 'data-segment': segmentId ?? 'all' },
      React.createElement('span', { 'data-testid': 'steps' }, steps.map((s) => `${s.key}=${s.count ?? 'null'}`).join(',')),
      segments.map((s) =>
        React.createElement('button', { key: s.id, type: 'button', onClick: () => onSegmentChange(s.id) }, s.name),
      ),
      React.createElement('button', { type: 'button', onClick: () => onSegmentChange(null) }, 'Todos'),
    ),
}));

const campaign: TalkXCampaign = {
  id: 'camp-seg-1',
  name: 'Campanha Segmentada',
  message_template: 'Olá',
  variables_config: [],
  typing_delay_min: 1,
  typing_delay_max: 2,
  send_interval_min: 3,
  send_interval_max: 5,
  status: 'completed',
  total_recipients: 100,
  schedule_timezone: 'America/Sao_Paulo',
  sent_count: 100,
  failed_count: 0,
  delivered_count: 90,
  replied_count: 10,
  whatsapp_connection_id: null,
  created_by: null,
  started_at: '2026-10-05T10:00:00Z',
  completed_at: '2026-10-05T10:05:00Z',
  created_at: '2026-10-05T09:00:00Z',
  updated_at: '2026-10-05T10:05:00Z',
  media_url: null,
  media_type: null,
  scheduled_at: null,
};

function renderReport() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXCampaignReport campaign={campaign} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('TalkXCampaignReport — funil por segmento (X058)', () => {
  beforeEach(() => {
    state.bySegment = [
      { segment_id: 'seg-a', segment_name: 'Clientes VIP', sent: 40, delivered: 35, replied: 7 },
      { segment_id: null, segment_name: 'Sem segmento', sent: 60, delivered: 55, replied: 3 },
    ];
  });

  it('sem segmento escolhido o funil usa os totais da campanha', async () => {
    renderReport();
    expect(await screen.findByRole('button', { name: 'Clientes VIP' })).toBeInTheDocument();
    expect(screen.getByTestId('steps')).toHaveTextContent('sent=100,delivered=90,replied=10');
  });

  it('escolher um segmento troca os números do funil e zera Cliques para sem dados', async () => {
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: 'Clientes VIP' }));
    await waitFor(() =>
      expect(screen.getByTestId('steps')).toHaveTextContent('sent=40,delivered=35,replied=7,clicked=null,converted=null'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(screen.getByTestId('steps')).toHaveTextContent('sent=100,delivered=90,replied=10'));
  });

  it('destinatários sem segmento viram item próprio e filtram pela linha deles', async () => {
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: 'Sem segmento' }));
    await waitFor(() => expect(screen.getByTestId('steps')).toHaveTextContent('sent=60,delivered=55,replied=3'));
    expect(screen.getByTestId('funnel')).toHaveAttribute('data-segment', 'sem-segmento');
  });
});
