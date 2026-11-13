import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { talkxReportSeriesFromRows, talkxReportHeatmapFromTimestamps } from '../talkxReportData';
import { TalkXCampaignReport } from '../TalkXCampaignReport';

const { state } = vi.hoisted(() => ({
  state: {
    recipients: [] as unknown[],
    report: null as unknown,
  },
}));
const { pdfBuilder, toastError } = vi.hoisted(() => ({
  pdfBuilder: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/talkxReportPdf', () => ({ buildTalkXCampaignPdfBlob: pdfBuilder }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: false, isLoading: false }),
}));

vi.mock('@/lib/supabaseHelpers', () => {
  const fromTable = () => {
    let selected = '';
    const builder: Record<string, unknown> = {
      select: (cols: string) => { selected = cols; return builder; },
      eq: () => builder, not: () => builder, order: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => void) => {
        resolve({ data: selected.includes('talkx_links') ? [] : state.recipients, error: null });
      },
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
      rpc: () => Promise.resolve({ data: state.report, error: null }),
      channel: realtimeChannel,
      removeChannel: vi.fn(),
    },
    invokeEdge: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});

vi.mock('../TalkXReportPerformance', () => ({
  TalkXReportPerformance: ({ hasConversionSource }: { hasConversionSource: boolean }) =>
    React.createElement('div', { 'data-testid': 'performance', 'data-has-conversion': String(hasConversionSource) }),
}));
vi.mock('../TalkXReportFunnel', () => ({
  TalkXReportFunnel: () => React.createElement('div', { 'data-testid': 'funnel' }),
}));
vi.mock('../TalkXReportHeatmap', () => ({
  TalkXReportHeatmap: () => React.createElement('div', { 'data-testid': 'heatmap' }),
}));

describe('talkxReportData', () => {
  describe('talkxReportSeriesFromRows', () => {
    it('retorna array vazio para entrada vazia', () => {
      expect(talkxReportSeriesFromRows([], 'day', 'America/Sao_Paulo')).toEqual([]);
    });
    it('agrupa 2 envios do mesmo dia em um único balde', () => {
      const rows = [
        { sent_at: '2026-10-05T10:00:00Z', delivered_at: '2026-10-05T10:00:05Z', replied_at: null },
        { sent_at: '2026-10-05T14:00:00Z', delivered_at: null, replied_at: '2026-10-05T15:00:00Z' },
      ];
      const series = talkxReportSeriesFromRows(rows, 'day', 'America/Sao_Paulo');
      expect(series).toHaveLength(1);
      expect(series[0].sent).toBe(2);
      expect(series[0].delivered).toBe(1);
      expect(series[0].replied).toBe(1);
      expect(series[0].conversions).toBe(0);
    });
    it('separa dois dias distintos — 2026-10-05 (segunda) e 2026-10-11 (domingo)', () => {
      const rows = [
        { sent_at: '2026-10-05T10:00:00Z', delivered_at: null, replied_at: null },
        { sent_at: '2026-10-11T10:00:00Z', delivered_at: null, replied_at: null },
      ];
      const series = talkxReportSeriesFromRows(rows, 'day', 'America/Sao_Paulo');
      expect(series).toHaveLength(2);
    });
    it('ignora linhas sem sent_at', () => {
      const rows = [
        { sent_at: null, delivered_at: null, replied_at: null },
        { sent_at: '2026-10-05T10:00:00Z', delivered_at: null, replied_at: null },
      ];
      expect(talkxReportSeriesFromRows(rows, 'day', 'America/Sao_Paulo')).toHaveLength(1);
    });
    it('granularidade hour — dois envios em horas distintas no mesmo dia geram dois baldes', () => {
      const rows = [
        { sent_at: '2026-10-05T10:00:00Z', delivered_at: null, replied_at: null },
        { sent_at: '2026-10-05T11:00:00Z', delivered_at: null, replied_at: null },
      ];
      const series = talkxReportSeriesFromRows(rows, 'hour', 'America/Sao_Paulo');
      expect(series).toHaveLength(2);
    });
  });
  describe('talkxReportHeatmapFromTimestamps', () => {
    it('retorna grade 7x24 zerada para entrada vazia', () => {
      const grid = talkxReportHeatmapFromTimestamps([], 'America/Sao_Paulo');
      expect(grid).toHaveLength(7);
      grid.forEach((row) => expect(row).toHaveLength(24));
      expect(grid.flat().every((v) => v === 0)).toBe(true);
    });
    it('incrementa célula [0][7] — 2026-10-05T10:00:00Z é segunda às 7h em Sao_Paulo', () => {
      const grid = talkxReportHeatmapFromTimestamps(['2026-10-05T10:00:00Z'], 'America/Sao_Paulo');
      expect(grid[0][7]).toBe(1);
    });
    it('ignora valores null e undefined', () => {
      const grid = talkxReportHeatmapFromTimestamps([null, undefined], 'America/Sao_Paulo');
      expect(grid.flat().every((v) => v === 0)).toBe(true);
    });
  });
});

describe('TalkXCampaignReport', () => {
  const campaign: TalkXCampaign = {
    id: 'camp-test-1',
    name: 'Campanha Teste',
    message_template: 'Olá, {{nome}}!',
    variables_config: ['nome'],
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

  beforeEach(() => {
    state.recipients = [];
    state.report = null;
  });

  function renderReport() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <TalkXCampaignReport campaign={campaign} onBack={vi.fn()} />
      </QueryClientProvider>,
    );
  }

  it('exibe título "Relatório da Campanha"', () => {
    renderReport();
    expect(screen.getByRole('heading', { name: /Relatório da Campanha/i })).toBeInTheDocument();
  });
  it('exibe nome da campanha no cabeçalho', () => {
    renderReport();
    expect(screen.getByText('Campanha Teste')).toBeInTheDocument();
  });
  it('renderiza os três cartões gráficos quando KPIs estão disponíveis', async () => {
    state.report = {
      kpis: {
        total_recipients: 100, sent_count: 100, delivered_count: 90,
        read_count: 50, failed_count: 5, outcome_unknown_count: 5,
        delivery_rate_pct: 90, duration_secs: 300,
      },
    };
    renderReport();
    expect(await screen.findByTestId('performance')).toBeInTheDocument();
    expect(screen.getByTestId('funnel')).toBeInTheDocument();
    expect(screen.getByTestId('heatmap')).toBeInTheDocument();
  });
  it('hasConversionSource é false — série Conversões não é renderizada', async () => {
    state.report = {
      kpis: {
        total_recipients: 100, sent_count: 100, delivered_count: 90,
        read_count: 50, failed_count: 5, outcome_unknown_count: 5,
        delivery_rate_pct: 90, duration_secs: 300,
      },
    };
    renderReport();
    const perf = await screen.findByTestId('performance');
    expect(perf.getAttribute('data-has-conversion')).toBe('false');
  });
  it('falha ao gerar o PDF avisa o usuário e libera o botão', async () => {
    state.report = {
      kpis: {
        total_recipients: 100, sent_count: 100, delivered_count: 90,
        read_count: 50, failed_count: 5, outcome_unknown_count: 5,
        delivery_rate_pct: 90, duration_secs: 300,
      },
    };
    pdfBuilder.mockRejectedValueOnce(new Error('chunk jspdf indisponível'));
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Não foi possível gerar o PDF. Tente novamente.'));
    expect(screen.getByRole('button', { name: 'PDF' })).toBeEnabled();
  });
});
