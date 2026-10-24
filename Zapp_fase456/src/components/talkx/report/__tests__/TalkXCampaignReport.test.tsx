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

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const SvgBox = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  return {
    ComposedChart: SvgBox,
    AreaChart: SvgBox,
    Area: () => null,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: Box,
  };
});

import { TalkXCampaignReport } from '@/components/talkx/report/TalkXCampaignReport';
import {
  talkxReportHeatmapFromTimestamps,
  talkxReportSeriesFromRows,
  type TalkXReportRecipientRow,
} from '@/components/talkx/report/talkxReportData';

const TZ = 'America/Sao_Paulo';

const ROWS: TalkXReportRecipientRow[] = [
  { sent_at: '2026-10-05T12:00:00.000Z', delivered_at: '2026-10-05T12:01:00.000Z', replied_at: '2026-10-05T12:05:00.000Z' },
  { sent_at: '2026-10-06T12:00:00.000Z', delivered_at: null, replied_at: null },
  { sent_at: '2026-10-11T12:00:00.000Z', delivered_at: '2026-10-11T12:02:00.000Z', replied_at: null },
];

const CAMPAIGN = {
  id: 'c1',
  name: 'Campanha Relatório X164',
  message_template: 'Olá {{nome}}',
  variables_config: [],
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  status: 'completed',
  total_recipients: 3,
  sent_count: 3,
  failed_count: 0,
  delivered_count: 2,
  read_count: 1,
  replied_count: 1,
  outcome_unknown_count: 0,
  whatsapp_connection_id: null,
  created_by: null,
  started_at: '2026-10-05T12:00:00.000Z',
  completed_at: '2026-10-05T13:00:00.000Z',
  created_at: '2026-10-05T10:00:00.000Z',
  updated_at: '2026-10-05T13:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: null,
  schedule_timezone: TZ,
  objective: 'Reengajamento',
  template_id: 'tpl-9',
  owner: 'u1',
  revision: 1,
};

const REPORT = {
  campaign_id: 'c1',
  kpis: {
    total_recipients: 3,
    sent_count: 3,
    delivered_count: 2,
    read_count: 1,
    failed_count: 0,
    outcome_unknown_count: 0,
    delivery_rate_pct: 66.7,
    duration_secs: 3600,
  },
};

function renderReport() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXCampaignReport campaign={CAMPAIGN as never} creators={{ u1: 'Fulana de Tal' }} onBack={() => {}} onViewMonitor={() => {}} />
    </QueryClientProvider>,
  );
}

describe('talkxReportData — agrupamento no fuso da campanha (X164)', () => {
  it('serie diaria: um balde por dia, com enviados/entregues/respostas do dia', () => {
    const series = talkxReportSeriesFromRows(ROWS, 'day', TZ);
    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ sent: 1, delivered: 1, replied: 1 });
    expect(series[1]).toMatchObject({ sent: 1, delivered: 0, replied: 0 });
    // Conversões não tem fonte: sempre 0 (a linha nem é desenhada).
    expect(series.every((point) => point.conversions === 0)).toBe(true);
  });

  it('mapa de calor 7x24: linha 0 = segunda, hora no fuso da campanha', () => {
    const grid = talkxReportHeatmapFromTimestamps(ROWS.map((row) => row.sent_at), TZ);
    // 12:00Z = 09:00 em Sao Paulo. 05/10 e segunda (linha 0), 06/10 terca (linha 1), 11/10 domingo (linha 6).
    expect(grid[0][9]).toBe(1);
    expect(grid[1][9]).toBe(1);
    expect(grid[6][9]).toBe(1);
    expect(grid[2][9]).toBe(0);
    // Nenhuma hora fora do horario local deve receber o envio.
    expect(grid[0][12]).toBe(0);
  });
});

describe('TalkXCampaignReport — tela do relatorio de campanha concluida (X164)', () => {
  beforeEach(() => {
    state.recipients = ROWS;
    state.report = REPORT;
  });

  it('abre com Resumo e os TRES graficos; sem a serie Conversoes (sem fonte)', async () => {
    renderReport();

    expect(await screen.findByText('Resumo da Campanha')).toBeTruthy();
    expect(screen.getByText('Desempenho da Campanha')).toBeTruthy();
    expect(screen.getByText('Funil de Conversão')).toBeTruthy();
    expect(screen.getByText('Mapa de Calor de Respostas')).toBeTruthy();

    // KPIs reais vindos do RPC (rótulos que só existem no Resumo).
    expect(screen.getByText('Destinatários')).toBeTruthy();
    expect(screen.getByText('A confirmar')).toBeTruthy();
    expect(screen.getByText('Duração')).toBeTruthy();

    // Degraus do funil com fonte real; "Converteram" fica nulo e NÃO é desenhado.
    expect(screen.getByText('Responderam')).toBeTruthy();
    expect(screen.getByText('Clicaram')).toBeTruthy();
    expect(screen.queryByText('Converteram')).toBeNull();

    // Sem fonte de conversao, a serie/coluna "Conversoes" nao aparece.
    expect(screen.queryByText('Conversões')).toBeNull();

    // O responsavel e resolvido pelo mapa de perfis.
    expect(screen.getByText('Fulana de Tal')).toBeTruthy();
  });
});
