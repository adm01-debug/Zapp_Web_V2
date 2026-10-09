import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * X186 — tela 07 (Analytics): performance de campanhas em 4 séries diárias e funil em SVG
 * proporcional ao valor medido.
 *
 * Antes: "Performance por Campanha" era barras das 5 maiores campanhas (Enviadas × Falhas),
 * sem série no tempo, e o funil usava larguras FIXAS (100/80/55/35 %) com Lidas/Conversões
 * em "Não rastreado" — a largura não dizia nada sobre a perda real.
 *
 * O recharts depende de medida de contêiner e não desenha nada no jsdom, então ele é
 * mockado: o teste julga o que o componente ENTREGA ao gráfico (linhas do dia, séries e
 * séries ausentes) e o que aparece na tela (notas, funil em SVG).
 */

const recharts = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  areaKeys: [] as string[],
}));

vi.mock('recharts', () => {
  const Node = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Node,
    AreaChart: ({ data, children }: { data: Array<Record<string, unknown>>; children?: ReactNode }) => {
      recharts.rows = data;
      recharts.areaKeys = [];
      return <div data-testid="perf-chart">{children}</div>;
    },
    BarChart: Node,
    Bar: () => null,
    Cell: () => null,
    LabelList: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Area: ({ dataKey }: { dataKey: string }) => {
      recharts.areaKeys = [...recharts.areaKeys, dataKey];
      return <div data-testid={`area-${dataKey}`} />;
    },
  };
});

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.in = chain;
    builder.gte = chain;
    builder.eq = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.not = () => Promise.resolve({ data: [], error: null });
    return builder;
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: rpcMock } }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: [], isLoading: false, isError: false, error: null }),
}));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

import { AnalyticsPerformanceChart } from '@/components/talkx/analytics/AnalyticsPerformanceChart';
import type { PerformancePoint } from '@/components/talkx/analytics/AnalyticsPerformanceChart';
import { AnalyticsFunnel } from '@/components/talkx/analytics/AnalyticsFunnel';
import { TalkXAnalytics } from '@/components/talkx/TalkXAnalytics';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const thirtyDays: PerformancePoint[] = Array.from({ length: 30 }, (_, index) => ({
  day: `2026-10-${String(index + 1).padStart(2, '0')}`,
  sent: 100 + index,
  delivered: 90 + index,
  replied: 10 + index,
  conversions: index,
}));

function withoutConversions(points: PerformancePoint[]): PerformancePoint[] {
  return points.map((point) => ({ ...point, conversions: null }));
}

function withClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

beforeEach(() => {
  recharts.rows = [];
  recharts.areaKeys = [];
  rpcMock.mockReset();
});

describe('AnalyticsPerformanceChart — séries diárias (X186)', () => {
  it('30 pontos diários viram 4 séries, com o dia do tooltip rotulado "1 out"', () => {
    render(
      <AnalyticsPerformanceChart data={thirtyDays} period="30d" onPeriodChange={() => {}} />,
    );

    expect(screen.getByTestId('area-Enviadas')).toBeInTheDocument();
    expect(screen.getByTestId('area-Entregues')).toBeInTheDocument();
    expect(screen.getByTestId('area-Respostas')).toBeInTheDocument();
    expect(screen.getByTestId('area-Conversões')).toBeInTheDocument();
    expect(recharts.areaKeys).toHaveLength(4);

    // Uma linha por dia, com os 4 valores do dia que a dica mostra.
    expect(recharts.rows).toHaveLength(30);
    expect(Object.keys(recharts.rows[0])).toEqual(['day', 'Dia', 'Enviadas', 'Entregues', 'Respostas', 'Conversões']);
    expect(recharts.rows[0]).toMatchObject({ Dia: '1 out', Enviadas: 100, Entregues: 90, Respostas: 10, Conversões: 0 });
    expect(recharts.rows[29]).toMatchObject({ Dia: '30 out' });
  });

  it('série sem fonte não é desenhada e ganha a nota "sem dados ainda"', () => {
    render(
      <AnalyticsPerformanceChart data={withoutConversions(thirtyDays)} period="30d" onPeriodChange={() => {}} />,
    );

    expect(recharts.areaKeys).toHaveLength(3);
    expect(screen.queryByTestId('area-Conversões')).toBeNull();
    expect(screen.getByText(/Conversões: sem dados ainda/)).toBeInTheDocument();
    expect(Object.keys(recharts.rows[0])).not.toContain('Conversões');
  });

  it('falha de leitura não vira "sem resultados"', () => {
    render(<AnalyticsPerformanceChart data={[]} period="30d" onPeriodChange={() => {}} isError />);

    expect(screen.getByText(/Não foi possível carregar a série do período/)).toBeInTheDocument();
    expect(screen.queryByText(/Sem envios registrados/)).toBeNull();
    expect(screen.queryByTestId('perf-chart')).toBeNull();
  });

  it('o período é próprio do gráfico e o (i) explica de onde vem cada série', () => {
    const onPeriodChange = vi.fn();
    render(
      <AnalyticsPerformanceChart data={thirtyDays} period="30d" onPeriodChange={onPeriodChange} />,
    );

    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));
    expect(onPeriodChange).toHaveBeenCalledWith('90d');

    // O (i) só explica depois do clique (não nasce "já explicado").
    expect(screen.queryByText(/confirmação de entrega devolvida pelo provedor/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'De onde vem cada série' }));
    expect(screen.getByText(/confirmação de entrega devolvida pelo provedor/)).toBeInTheDocument();
    expect(screen.getByText(/vendas registradas nos links da campanha/)).toBeInTheDocument();
  });
});

describe('AnalyticsFunnel — degraus proporcionais (X186)', () => {
  const steps = [
    { key: 'sent', label: 'Enviadas', value: 18742, token: 'primary' },
    { key: 'delivered', label: 'Entregues', value: 18075, token: 'dash-green' },
    { key: 'read', label: 'Lidas', value: null, token: 'info' },
    { key: 'replied', label: 'Respostas', value: 3748, token: 'dash-violet' },
    { key: 'conversions', label: 'Conversões', value: null, token: 'dash-amber' },
  ];

  it('18.742 → 18.075 deixa o 2º degrau com 96,4% da largura do 1º', () => {
    render(<AnalyticsFunnel steps={steps} />);

    const sentWidth = Number(screen.getByTestId('funnel-bar-sent').getAttribute('width'));
    const deliveredWidth = Number(screen.getByTestId('funnel-bar-delivered').getAttribute('width'));
    const repliedWidth = Number(screen.getByTestId('funnel-bar-replied').getAttribute('width'));

    expect(deliveredWidth / sentWidth).toBeCloseTo(0.9644, 3);
    expect(repliedWidth / sentWidth).toBeCloseTo(3748 / 18742, 3);
    // Largura fixa de outro degrau (80/55/35 %) não é o que está desenhado.
    expect(deliveredWidth / sentWidth).not.toBeCloseTo(0.8, 2);
    expect(screen.getByText('Entrega → Leitura → Resposta → Conversão')).toBeInTheDocument();
  });

  it('degrau com fonte nula aparece vazio com "sem dados ainda" e não 0', () => {
    render(<AnalyticsFunnel steps={steps} />);

    expect(screen.queryByTestId('funnel-bar-read')).toBeNull();
    expect(screen.queryByTestId('funnel-bar-conversions')).toBeNull();
    expect(screen.getAllByText('sem dados ainda')).toHaveLength(2);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('zero medido não é confundido com fonte nula', () => {
    render(
      <AnalyticsFunnel steps={[
        { key: 'sent', label: 'Enviadas', value: 100, token: 'primary' },
        { key: 'conversions', label: 'Conversões', value: 0, token: 'dash-amber' },
      ]} />,
    );

    expect(screen.getByTestId('funnel-bar-conversions')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('sem dados ainda')).toBeNull();
  });
});

describe('TalkXAnalytics — funil e gráfico na tela (X186)', () => {
  const campaign = {
    id: 'c1',
    name: 'Campanha de outubro',
    message_template: 'Olá {{nome}}',
    variables_config: [],
    typing_delay_min: 1,
    typing_delay_max: 2,
    send_interval_min: 1,
    send_interval_max: 2,
    status: 'completed',
    total_recipients: 20000,
    sent_count: 18742,
    failed_count: 120,
    delivered_count: 18075,
    read_count: 7497,
    replied_count: 3748,
    outcome_unknown_count: 5,
    whatsapp_connection_id: null,
    created_by: null,
    started_at: '2026-10-05T12:00:00.000Z',
    completed_at: '2026-10-05T13:00:00.000Z',
    created_at: '2026-10-05T11:00:00.000Z',
    updated_at: '2026-10-05T13:00:00.000Z',
    media_url: null,
    media_type: null,
    scheduled_at: null,
  } as unknown as TalkXCampaign;

  // A RPC desta cópia devolve envio/entrega/resposta por dia; `conversions` só passa a vir
  // depois da etapa de banco X073 — por isso a série de conversão não é desenhada na tela.
  const daily = [
    { day: '2026-10-05', sent: 9000, delivered: 8700, replied: 1800 },
    { day: '2026-10-06', sent: 9742, delivered: 9375, replied: 1948 },
  ];

  it('renderiza o gráfico de 3 séries com a nota, o funil proporcional e o período próprio ligado à RPC', async () => {
    rpcMock.mockResolvedValue({ data: { daily }, error: null });

    withClient(<TalkXAnalytics campaigns={[campaign]} isLoading={false} isError={false} />);

    // Gráfico novo no lugar do "Performance por Campanha".
    expect(await screen.findByText('Performance de campanhas')).toBeInTheDocument();
    expect(screen.queryByText('Performance por Campanha')).toBeNull();
    expect(await screen.findByTestId('area-Enviadas')).toBeInTheDocument();
    expect(screen.getByTestId('area-Entregues')).toBeInTheDocument();
    expect(screen.getByTestId('area-Respostas')).toBeInTheDocument();
    // Conversão, que o sistema ainda não mede, não vira série nem 0.
    expect(screen.queryByTestId('area-Conversões')).toBeNull();
    expect(screen.getByText('Conversões: sem dados ainda')).toBeInTheDocument();

    // Funil: largura do 2º degrau provada pelos números da campanha (18.075 / 18.742).
    const sentWidth = Number(screen.getByTestId('funnel-bar-sent').getAttribute('width'));
    const deliveredWidth = Number(screen.getByTestId('funnel-bar-delivered').getAttribute('width'));
    expect(deliveredWidth / sentWidth).toBeCloseTo(0.9644, 3);
    // Conversão, que o sistema ainda não mede, não vira 0.
    expect(screen.getByText('Conversões: sem dados ainda')).toBeInTheDocument();

    // O seletor do gráfico nasce no filtro da tela (30 dias) e, tocado, refaz a consulta.
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    const firstArgs = rpcMock.mock.calls[0][1] as { p_from: string; p_to: string };
    expect(rpcMock.mock.calls[0][0]).toBe('talkx_overview_stats');
    expect((new Date(firstArgs.p_to).getTime() - new Date(firstArgs.p_from).getTime()) / 86_400_000).toBeCloseTo(30, 1);

    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    const secondArgs = rpcMock.mock.calls[1][1] as { p_from: string; p_to: string };
    expect((new Date(secondArgs.p_to).getTime() - new Date(secondArgs.p_from).getTime()) / 86_400_000).toBeCloseTo(90, 1);
  });
});
