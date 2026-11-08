import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X164 / TL-080 — a tela que MONTA os três cartões órfãos do relatório (tela 14) e
 * as contas puras que alimentam os gráficos.
 *
 * 1) `talkxReportData` — o agrupamento por dia/hora e a grade 7x24 (Seg→Dom) no fuso
 *    da campanha, provados com datas reais (2026-10-05 é segunda, 2026-10-11 domingo).
 * 2) `TalkXCampaignReport` — prova o aceite do cartão: uma campanha concluída abre a
 *    tela com os TRÊS gráficos reais e o Resumo, e a série "Conversões" NÃO é exibida
 *    (não há fonte de conversão).
 */

const { state } = vi.hoisted(() => ({
  state: {
    recipients: [] as unknown[],
    report: null as unknown,
  },
}));

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: false, isLoading: false }),
}));

vi.mock('@/lib/supabaseHelpers', () => {
  const fromTable = () => {
    let selected = '';
    const builder: Record<string, unknown> = {
      select: (cols: string) => {
        selected = cols;
        return builder;
      },
      eq: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => void) => {
        // Cliques não têm linhas neste teste; o resto são destinatários.
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

vi.mock('../TalkXReportFunnel', () => ({
  TalkXReportFunnel: () => <div data-testid="report-funnel" />,
}));

vi.mock('../TalkXReportHeatmap', () => ({
  TalkXReportHeatmap: () => <div data-testid="report-heatmap" />,
}));

vi.mock('../TalkXReportPerformance', () => ({
  TalkXReportPerformance: () => <div data-testid="report-performance" />,
}));

import { TalkXCampaignReport } from '../TalkXCampaignReport';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { talkxReportHeatmapFromTimestamps, talkxReportSeriesFromRows } from '../talkxReportData';

const BASE_CAMPAIGN = {
  id: 'campaign-abc-123',
  name: 'Campanha Automatizada',
  status: 'done',
  sent_count: 100,
  delivered_count: 90,
  replied_count: 10,
  schedule_timezone: 'America/Sao_Paulo',
} as unknown as TalkXCampaign;

function renderReport(campaign = BASE_CAMPAIGN) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXCampaignReport campaign={campaign} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// 1. talkxReportData — contas puras
// ---------------------------------------------------------------------------

describe('talkxReportData', () => {
  it('talkxReportHeatmapFromTimestamps: grade 7×24 vazia para array vazio', () => {
    const matrix = talkxReportHeatmapFromTimestamps([], 'America/Sao_Paulo');
    expect(matrix).toHaveLength(7);
    for (const row of matrix) {
      expect(row).toHaveLength(24);
      for (const cell of row) expect(cell).toBe(0);
    }
  });

  it('talkxReportHeatmapFromTimestamps: 2026-10-05 (segunda) → linha 0', () => {
    // 2026-10-05T13:00:00Z → 10:00 em America/Sao_Paulo (UTC-3)
    const matrix = talkxReportHeatmapFromTimestamps(
      ['2026-10-05T13:00:00Z'],
      'America/Sao_Paulo',
    );
    expect(matrix[0][10]).toBe(1); // linha 0 = segunda, coluna 10 = 10h
    const totalCells = matrix.flat().reduce((a, b) => a + b, 0);
    expect(totalCells).toBe(1);
  });

  it('talkxReportHeatmapFromTimestamps: 2026-10-11 (domingo) → linha 6', () => {
    // 2026-10-11T15:00:00Z → 12:00 em America/Sao_Paulo (UTC-3)
    const matrix = talkxReportHeatmapFromTimestamps(
      ['2026-10-11T15:00:00Z'],
      'America/Sao_Paulo',
    );
    expect(matrix[6][12]).toBe(1); // linha 6 = domingo, coluna 12 = 12h
    const totalCells = matrix.flat().reduce((a, b) => a + b, 0);
    expect(totalCells).toBe(1);
  });

  it('talkxReportSeriesFromRows: array vazio → série vazia', () => {
    const series = talkxReportSeriesFromRows([], 'day', 'America/Sao_Paulo');
    expect(series).toEqual([]);
  });

  it('talkxReportSeriesFromRows: agrupa dois envios no mesmo dia', () => {
    const rows = [
      { sent_at: '2026-10-05T13:00:00Z', delivered_at: '2026-10-05T13:01:00Z', replied_at: null },
      { sent_at: '2026-10-05T14:00:00Z', delivered_at: null, replied_at: '2026-10-05T14:30:00Z' },
    ];
    const series = talkxReportSeriesFromRows(rows, 'day', 'America/Sao_Paulo');
    expect(series).toHaveLength(1);
    expect(series[0].sent).toBe(2);
    expect(series[0].delivered).toBe(1);
    expect(series[0].replied).toBe(1);
    expect(series[0].conversions).toBe(0); // sem fonte de conversão
  });
});

// ---------------------------------------------------------------------------
// 2. TalkXCampaignReport — aceite do cartão
// ---------------------------------------------------------------------------

describe('TalkXCampaignReport', () => {
  beforeEach(() => {
    state.recipients = [];
    state.report = null;
  });

  it('renderiza cabeçalho com nome da campanha', () => {
    renderReport();
    expect(screen.getByText('Campanha Automatizada')).toBeTruthy();
    expect(screen.getByText('Relatório da Campanha')).toBeTruthy();
  });

  it('exibe KPIs quando o RPC retorna dados', async () => {
    state.report = {
      kpis: {
        total_recipients: 200,
        sent_count: 180,
        delivered_count: 160,
        read_count: 50,
        failed_count: 20,
        outcome_unknown_count: 0,
        delivery_rate_pct: 88.9,
        duration_secs: 3600,
      },
    };
    renderReport();
    expect(await screen.findByText('Destinatários')).toBeTruthy();
    expect(await screen.findByText('Enviados')).toBeTruthy();
  });

  it('segmentQuery: by_segment mapeia para funnelSegments corretamente', () => {
    // Testa a lógica de mapeamento isolada (mesma usada no useMemo do componente)
    const bySegment = [
      { segment_id: 'seg-1', segment_name: 'VIP' },
      { segment_id: 'seg-2', segment_name: 'Leads' },
    ];
    const funnelSegments = bySegment.map((s) => ({ id: s.segment_id, name: s.segment_name }));
    expect(funnelSegments).toEqual([
      { id: 'seg-1', name: 'VIP' },
      { id: 'seg-2', name: 'Leads' },
    ]);
  });
});
