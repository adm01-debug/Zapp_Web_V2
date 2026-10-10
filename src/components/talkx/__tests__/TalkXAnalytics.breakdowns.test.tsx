import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * X187 — quebras do Analytics: top segmentos, mapa de calor por ENGAJAMENTO e
 * tabela de melhor resultado.
 *
 * Antes: o recorte por segmento era só o texto de um KPI (3 nomes), o mapa de
 * calor mostrava volume de envio (domingo primeiro, "Menor/Maior" sem dizer de
 * quê) e a tabela tinha coluna fixa "Canal / WhatsApp" e nenhuma ordenação.
 *
 * Aqui o teste passa pelo componente REAL da tela (`TalkXAnalytics`) e olha o
 * que o usuário vê: as linhas do cartão de segmentos, a primeira linha do mapa,
 * a cor da célula sem base, e a ordem da tabela.
 */

/* ------------------------------------------------------------------ */
/* Dados                                                              */
/* ------------------------------------------------------------------ */

const iso = (h: number, min = 0) => new Date(2026, 9, 5, h, min, 0).toISOString();
const DIA_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIA = DIA_LABELS[new Date(2026, 9, 5, 12, 0, 0).getDay()];
const HORA_COM_BASE = 12;
const HORA_SEM_BASE = 3;

const envio = (h: number, replied: boolean, min = 0) => ({
  sent_at: iso(h, min),
  replied_at: replied ? iso(h, min + 1) : null,
  status: 'sent',
});

// 6 envios na hora com base (3 deles respondidos) e 2 envios na hora sem base.
const hourlyRows = [
  envio(HORA_COM_BASE, true), envio(HORA_COM_BASE, true), envio(HORA_COM_BASE, true),
  envio(HORA_COM_BASE, false), envio(HORA_COM_BASE, false), envio(HORA_COM_BASE, false, 5),
  envio(HORA_SEM_BASE, true), envio(HORA_SEM_BASE, false, 5),
];

const SEGMENTS = Array.from({ length: 8 }, (_, i) => ({ id: `s${i + 1}`, name: `Segmento ${i + 1}` }));

function campaign(over: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    id: String(over.id), name: String(over.id), message_template: '', variables_config: [],
    typing_delay_min: 0, typing_delay_max: 0, send_interval_min: 0, send_interval_max: 0,
    status: 'completed', total_recipients: 100, sent_count: 0, failed_count: 0, delivered_count: 0,
    whatsapp_connection_id: null, created_by: null, started_at: now, completed_at: now,
    created_at: now, updated_at: now, media_url: null, media_type: null, scheduled_at: null,
    ...over,
  };
}

// 8 segmentos (para provar o corte de 7 + "Outros") com taxas distintas.
const CAMPAIGNS = [
  campaign({ id: 'c1', name: 'Campanha grande', segment_id: 's1', sent_count: 100, delivered_count: 50, replied_count: 20 }),
  campaign({ id: 'c2', name: 'Campanha pequena', segment_id: 's2', sent_count: 50, delivered_count: 45, replied_count: 30 }),
  campaign({ id: 'c3', name: 'Campanha 3', segment_id: 's3', sent_count: 10, delivered_count: 5, replied_count: 1 }),
  campaign({ id: 'c4', name: 'Campanha 4', segment_id: 's4', sent_count: 10, delivered_count: 5, replied_count: 1 }),
  campaign({ id: 'c5', name: 'Campanha 5', segment_id: 's5', sent_count: 10, delivered_count: 5, replied_count: 1 }),
  campaign({ id: 'c6', name: 'Campanha 6', segment_id: 's6', sent_count: 10, delivered_count: 5, replied_count: 1 }),
  campaign({ id: 'c7', name: 'Campanha 7', segment_id: 's7', sent_count: 10, delivered_count: 5, replied_count: 1 }),
  campaign({ id: 'c8', name: 'Campanha 8', segment_id: 's8', sent_count: 10, delivered_count: 5, replied_count: 1 }),
];

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

let falhaHorario = false;
let carregando = false;

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = chain; b.in = chain; b.gte = chain; b.eq = chain; b.order = chain; b.limit = chain;
    b.not = () => carregando
      ? new Promise(() => {})
      : Promise.resolve(
          falhaHorario ? { data: null, error: { message: 'falha na leitura' } } : { data: hourlyRows, error: null },
        );
    return b;
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));

vi.mock('recharts', () => {
  const Node = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    BarChart: Node, Bar: () => <div />, XAxis: () => <div />, YAxis: () => <div />,
    CartesianGrid: () => <div />, Tooltip: () => <div />,
    ResponsiveContainer: Node, Cell: () => <div />, LabelList: () => <div />,
  };
});

vi.mock('@/hooks/integrations/useTalkXSegments', () => ({
  useTalkXSegments: () => ({ segments: SEGMENTS, isLoading: false, isError: false }),
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: [], isLoading: false, isError: false, error: null }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

import { TalkXAnalytics } from '@/components/talkx/TalkXAnalytics';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const campaigns = CAMPAIGNS as unknown as TalkXCampaign[];

beforeEach(() => {
  falhaHorario = false;
  carregando = false;
  window.history.replaceState(null, '', '/');
});

/* ------------------------------------------------------------------ */
/* Testes                                                             */
/* ------------------------------------------------------------------ */

describe('TalkXAnalytics — top segmentos (X187)', () => {
  it('mostra 7 linhas mais "Outros" com 8 segmentos e troca os números ao trocar a métrica', () => {
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    const lista = screen.getByRole('list', { name: 'Top segmentos' });
    const itens = within(lista).getAllByRole('listitem');

    expect(itens).toHaveLength(8);
    expect(itens[7]).toHaveTextContent('Outros');
    // Métrica padrão: taxa de resposta. Segmento 2 = 30 de 50 = 60,0%.
    expect(itens[0]).toHaveTextContent('Segmento 2');
    expect(itens[0]).toHaveTextContent('60,0%');

    fireEvent.click(screen.getByRole('button', { name: 'Taxa de entrega' }));
    const porEntrega = within(screen.getByRole('list', { name: 'Top segmentos' })).getAllByRole('listitem');
    // Mesma linha, outra conta: 45 entregues de 50 = 90,0%.
    expect(porEntrega[0]).toHaveTextContent('90,0%');
    expect(porEntrega[0]).not.toHaveTextContent('60,0%');

    // Conversão não tem fonte no banco: a linha diz que não há dado.
    fireEvent.click(screen.getByRole('button', { name: 'Conversão' }));
    const porConversao = within(screen.getByRole('list', { name: 'Top segmentos' })).getAllByRole('listitem');
    expect(porConversao[0]).toHaveTextContent('sem dados ainda');
  });

  it('a sub-visão de segmentos (sub=segmentos) mostra a lista completa, sem "Outros"', () => {
    window.history.replaceState(null, '', '/?tab=analytics&sub=segmentos');
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    const itens = within(screen.getByRole('list', { name: 'Top segmentos' })).getAllByRole('listitem');
    expect(itens).toHaveLength(8);
    expect(within(screen.getByRole('list', { name: 'Top segmentos' })).queryByText('Outros')).toBeNull();
  });
});

describe('TalkXAnalytics — mapa de calor por engajamento (X187)', () => {
  it('começa na segunda-feira e não pinta a célula sem base mínima', async () => {
    const { container } = wrap(<TalkXAnalytics campaigns={campaigns} />);

    const primeiraLinha = container.querySelectorAll('[data-day]');
    expect([...primeiraLinha].map((el) => el.getAttribute('data-day'))).toEqual(['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']);

    const comBase = () => screen.getByTitle(`${DIA} ${String(HORA_COM_BASE).padStart(2, '0')}h`);
    await waitFor(() => expect(comBase().getAttribute('data-intensity')).not.toBe('sem-base'));
    expect(comBase().getAttribute('style')).toContain('--primary');

    const semBase = screen.getByTitle(`${DIA} ${String(HORA_SEM_BASE).padStart(2, '0')}h`);
    expect(semBase.getAttribute('data-intensity')).toBe('sem-base');
    expect(semBase.getAttribute('style')).toContain('--muted');
    expect(semBase.getAttribute('style')).not.toContain('--primary');

    // A tabela equivalente para leitor de tela traz o mesmo dado em texto.
    const tabela = screen.getByRole('table', { name: /Mapa de calor de engajamento/ });
    await waitFor(() => expect(within(tabela).getAllByRole('row')[1]).toHaveTextContent(DIA));
    expect(within(tabela).getByText('sem base mínima')).toBeTruthy();
  });

  it('falha na leitura do horário aparece como erro, não como "sem envios"', async () => {
    falhaHorario = true;
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    await waitFor(() => expect(screen.getByText('Não foi possível carregar os envios do período.')).toBeTruthy());
    expect(screen.queryByText('Sem envios no período selecionado.')).toBeNull();
  });

  it('em carregamento sem dados exibe "Carregando…" em vez de "Sem envios"', async () => {
    carregando = true;
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    await waitFor(() => expect(screen.getByText('Carregando…')).toBeTruthy());
    expect(screen.queryByText('Sem envios no período selecionado.')).toBeNull();
    carregando = false;
  });

  it('legenda mostra escala de engajamento e item "sem base", não "Menor/Maior engajamento"', async () => {
    const { container } = wrap(<TalkXAnalytics campaigns={campaigns} />);
    await waitFor(() => expect(screen.getByText('Engajamento por dia e horário')).toBeTruthy());
    const legendText = container.textContent ?? '';
    expect(legendText).toContain('Baixo');
    expect(legendText).toContain('Médio');
    expect(legendText).toContain('Alto');
    expect(legendText).toContain('sem base');
    expect(screen.queryByText('Menor engajamento')).toBeNull();
    expect(screen.queryByText('Maior engajamento')).toBeNull();
  });
});

describe('TalkXAnalytics — tabela de melhor resultado (X187)', () => {
  it('ordena pelo critério escolhido, avisa conversão sem fonte e leva para a lista completa', () => {
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    const secao = screen.getByText('Campanhas com melhor resultado').closest('section') as HTMLElement;
    const linhas = () => within(secao).getAllByRole('row').slice(1);

    // Padrão: mais enviadas primeiro.
    expect(linhas()[0]).toHaveTextContent('Campanha grande');

    fireEvent.change(within(secao).getByLabelText('Ordenar por'), { target: { value: 'resposta' } });
    // 30 respostas em 50 envios (60%) fica na frente de 20 em 100 (20%).
    expect(linhas()[0]).toHaveTextContent('Campanha pequena');

    // `converted_count` não existe no banco: a coluna não inventa zero.
    expect(within(secao).getAllByText('sem dados ainda')).toHaveLength(5);

    // Canal não é indicado na tabela (regra de 07–08/10/2026).
    expect(within(secao).queryByText('WhatsApp')).toBeNull();

    fireEvent.click(within(secao).getByText('Ver todas as campanhas'));
    expect(window.location.search).toContain('tab=overview');
  });
});
