import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X147 (TL-156) — card "Ritmo de Entrega" (tela 11) e "Ritmo de Envio" (tela 12).
 *
 * O que este teste prova (cada item falhava antes do fix):
 *  1. série com `forecast` nulo NÃO desenha a linha "Previsto" nem o balão de término;
 *     com `forecast` desenha os dois — e o balão traz minutos de verdade;
 *  2. trocar o seletor para "Últimos 15 minutos" refaz a leitura do painel com a janela
 *     de 15 minutos e desenha 15 pontos (a janela fixa de 60 min saiu: T11-031);
 *  3. "Entregues" é contado pelo minuto da ENTREGA: uma mensagem enviada fora da janela
 *     e entregue dentro dela aparece em "Entregues" (antes ia para o minuto do envio: T11-034);
 *  4. mês sem envio mostra o estado de vazio do kit com o card ainda visível;
 *  5. o filtro de status dos destinatários da tela 11 NÃO entra na leitura do painel
 *     (antes o filtro da aba ia para a query do gráfico: T11-033a).
 *
 * O `AreaChart` mockado expõe o `data` que o gráfico recebe (`data-points`/`data-last`) e
 * cada `Area` existe por `dataKey` — é a asserção sobre o que o gráfico desenha, sem
 * comparar classe de CSS.
 */

const h = vi.hoisted(() => ({
  rateCalls: [] as unknown[][],
  rateRows: [] as Array<{ sent_at: string | null; delivered_at: string | null }>,
  rateError: null as Error | null,
  refetchRate: vi.fn(),
  statusCalls: [] as unknown[][],
  recepientsData: [] as unknown[],
}));

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    AreaChart: ({ data, children }: { data?: unknown[]; children?: React.ReactNode }) => (
      <div
        data-testid="rate-chart"
        data-points={(data ?? []).length}
        data-all={JSON.stringify(data ?? [])}
      >
        {children}
      </div>
    ),
    Area: ({ dataKey, strokeDasharray }: { dataKey?: string; strokeDasharray?: string }) => (
      <span data-testid={`serie-${dataKey}`} data-dashed={strokeDasharray ? 'sim' : 'nao'} />
    ),
    ReferenceLine: ({ y }: { y?: number }) => <span data-testid="limite-per-minuto" data-y={y} />,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: Box,
  };
});

// Tela 11 (Monitor): o cliente Supabase é mockado como no teste de estados dela.
vi.mock('@/integrations/supabase/client', () => {
  const CAMPAIGN = {
    id: 'camp-1',
    name: 'Campanha X147',
    status: 'sending',
    message_template: 'mensagem de teste',
    total_recipients: 10,
    sent_count: 3,
    delivered_count: 2,
    failed_count: 1,
    outcome_unknown_count: 0,
    started_at: null,
    completed_at: null,
    whatsapp_connection_id: null,
    created_at: '2026-10-09T10:00:00.000Z',
    send_interval_min: 8000,
    send_interval_max: 20000,
    typing_delay_min: 1500,
    typing_delay_max: 4000,
    max_per_minute: 6,
  };

  const resolve = (table: string) => {
    if (table === 'talkx_campaigns') return Promise.resolve({ data: CAMPAIGN, error: null });
    if (table === 'talkx_recipients') {
      h.statusCalls.push([]);
      return Promise.resolve({ data: h.recepientsData, error: null });
    }
    return Promise.resolve({ data: [], error: null });
  };

  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, value: unknown) => { if (col === 'status') h.statusCalls.push([value]); return chain; };
    chain.order = () => chain;
    chain.not = () => chain;
    chain.limit = () => resolve(table);
    chain.single = () => resolve(table);
    chain.then = (onFulfilled: (value: unknown) => void) => resolve(table).then(onFulfilled);
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
  useTalkXEvents: () => ({ events: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }),
}));

vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: (...args: unknown[]) => {
    h.rateCalls.push(args);
    return {
      recipients: h.rateRows,
      rateByMinute: [],
      isLoading: false,
      isError: h.rateError !== null,
      refetch: h.refetchRate,
    };
  },
}));

import { TalkXRateChart } from '@/components/talkx/tracking/TalkXRateChart';
import { buildRateSeries, forecastFromCampaign, type TalkXRateWindow } from '@/components/talkx/tracking/talkxRatePanel';
import { TalkXLiveMonitor } from '@/components/talkx/TalkXLiveMonitor';

const MINUTE = 60_000;
const NOW = new Date();

/** Minuto local truncado, como o painel usa. */
function minuteAgo(minutes: number): string {
  const at = new Date(NOW.getTime() - minutes * MINUTE);
  at.setSeconds(0, 0);
  return at.toISOString();
}

/** Harness = como as telas usam o card: janela em estado, série do painel e releitura. */
function Harness({ rows, withForecast, windowDefault = 60, onRead }: {
  rows: Array<{ sent_at: string | null; delivered_at: string | null }>;
  withForecast: boolean;
  windowDefault?: TalkXRateWindow;
  onRead?: (minutes: number) => void;
}) {
  const [windowMinutes, setWindowMinutes] = useState<TalkXRateWindow>(windowDefault);
  const now = new Date(NOW.getTime());
  const series = buildRateSeries(rows, { windowMinutes, now });
  const forecast = withForecast
    ? forecastFromCampaign(
        { send_interval_min: 8000, send_interval_max: 20000, typing_delay_min: 1500, typing_delay_max: 4000 },
        { pending: 10, now },
      )
    : null;
  return (
    <TalkXRateChart
      title="Ritmo de Entrega"
      windowMinutes={windowMinutes}
      onWindowChange={(minutes) => { setWindowMinutes(minutes); onRead?.(minutes); }}
      series={series}
      forecast={forecast}
      limitPerMinute={6}
      query={{ isLoading: false, isError: false, error: null }}
    />
  );
}

beforeEach(() => {
  h.rateCalls = [];
  h.rateRows = [];
  h.rateError = null;
  h.refetchRate = vi.fn();
  h.statusCalls = [];
  h.recepientsData = [];
});

describe('TalkXRateChart — ritmo, janela, previsto e término (X147)', () => {
  it('sem forecast: não desenha "Previsto" nem o balão de término', () => {
    render(
      <Harness
        rows={[{ sent_at: minuteAgo(2), delivered_at: null }]}
        withForecast={false}
      />,
    );

    expect(screen.getByTestId('serie-Enviadas')).toBeTruthy();
    expect(screen.getByTestId('serie-Entregues')).toBeTruthy();
    expect(screen.getByTestId('serie-Entregues').getAttribute('data-dashed')).toBe('sim');
    expect(screen.queryByTestId('serie-Previsto')).toBeNull();
    expect(screen.queryByText(/Previsto/)).toBeNull();
    expect(screen.queryByText(/Término estimado/)).toBeNull();
  });

  it('com forecast: desenha "Previsto" tracejada e o balão com o término estimado', () => {
    render(
      <Harness
        rows={[{ sent_at: minuteAgo(2), delivered_at: null }]}
        withForecast
      />,
    );

    expect(screen.getByTestId('serie-Previsto').getAttribute('data-dashed')).toBe('sim');
    expect(screen.getByText(/Previsto/)).toBeTruthy();
    // 10 pendentes no ritmo de ~3,6 msgs/min → 3 min de término estimado.
    expect(screen.getByText(/Término estimado · .+ · em \d+ min/)).toBeTruthy();
  });

  it('trocar o seletor para 15 minutos relê o painel com a janela nova e desenha 15 pontos', () => {
    const onRead = vi.fn();
    render(
      <Harness
        rows={[{ sent_at: minuteAgo(2), delivered_at: null }]}
        withForecast={false}
        onRead={onRead}
      />,
    );

    expect(screen.getByTestId('rate-chart').getAttribute('data-points')).toBe('60');

    fireEvent.change(screen.getByLabelText('Janela do ritmo'), { target: { value: '15' } });

    expect(onRead).toHaveBeenCalledWith(15);
    expect(screen.getByTestId('rate-chart').getAttribute('data-points')).toBe('15');
    expect(screen.getByText('Mensagens enviadas nos últimos 15 minutos')).toBeTruthy();
  });

  it('"Entregues" conta pelo minuto da ENTREGA, mesmo com o envio fora da janela', () => {
    render(
      <Harness
        rows={[
          { sent_at: minuteAgo(20), delivered_at: minuteAgo(2) },
          { sent_at: minuteAgo(3), delivered_at: minuteAgo(2) },
        ]}
        withForecast={false}
        windowDefault={15}
      />,
    );

    const points = JSON.parse(screen.getByTestId('rate-chart').getAttribute('data-all') ?? '[]');
    // O minuto das DUAS entregas não tem envio nenhum: "Entregues" segue o minuto da
    // entrega, não o do envio (T11-034).
    const entrega = points.find((point: { at: string }) => point.at === minuteAgo(2));
    expect(entrega.Enviadas).toBe(0);
    expect(entrega.Entregues).toBe(2);
    // O envio de 20 minutos atrás fica FORA da janela de 15 minutos.
    expect(points.reduce((total: number, point: { Enviadas: number }) => total + point.Enviadas, 0)).toBe(1);
  });

  it('minuto sem envio: estado de vazio do kit com o card ainda visível', () => {
    render(<Harness rows={[]} withForecast={false} />);

    expect(screen.getByText('Ritmo de Entrega')).toBeTruthy();
    expect(screen.getByText('Sem envios neste período.')).toBeTruthy();
    expect(screen.queryByTestId('rate-chart')).toBeNull();
  });
});

describe('TalkXLiveMonitor — o painel do ritmo ignora o filtro de status (X147/T11-033a)', () => {
  function renderMonitor() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <TalkXLiveMonitor campaignId="camp-1" onBack={() => {}} />
      </QueryClientProvider>,
    );
  }

  it('lê o painel só com a campanha e troca a janela relendo o painel', async () => {
    h.rateRows = [{ sent_at: minuteAgo(2), delivered_at: null }];
    renderMonitor();

    await waitFor(() => expect(screen.getByTestId('rate-chart')).toBeTruthy());
    expect(h.rateCalls.every((args) => args.length === 1 && args[0] === 'camp-1')).toBe(true);

    fireEvent.change(screen.getByLabelText('Janela do ritmo'), { target: { value: '15' } });

    expect(screen.getByTestId('rate-chart').getAttribute('data-points')).toBe('15');
    expect(h.refetchRate).toHaveBeenCalled();
  });

  it('a aba Destinatários não entra na leitura do painel do ritmo', async () => {
    h.rateRows = [{ sent_at: minuteAgo(2), delivered_at: null }];
    renderMonitor();

    await waitFor(() => expect(screen.getByTestId('rate-chart')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Destinatários/ }));
    await waitFor(() => expect(screen.getByText('Nenhum destinatário encontrado')).toBeTruthy());

    // O painel é lido só com a campanha: o filtro de status da lista de destinatários
    // nunca chega ao hook do gráfico (T11-033a).
    expect(h.rateCalls.length).toBeGreaterThan(0);
    expect(h.rateCalls.every((args) => args.length === 1 && args[0] === 'camp-1')).toBe(true);
  });
});
