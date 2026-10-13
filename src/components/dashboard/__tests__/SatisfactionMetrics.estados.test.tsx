/**
 * `SatisfactionMetrics` — os três estados que o cartão pede (carregando, erro e
 * vazio) mais o conteúdo com dado.
 *
 * O sujeito é a tela REAL; ficam de fora as duas leituras (CSAT/NPS) e o
 * `ResponsiveContainer` do recharts, que mede 0x0 no jsdom. O que a tela faz com
 * o que chega — inclusive o que ela escreve quando NÃO chega nada — é o que
 * este arquivo trava: erro mostra rendição com "Tentar novamente", vazio mostra
 * "—" e os blocos de vazio, e nenhum número inventado aparece.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ csat: vi.fn(), nps: vi.fn() }));

vi.mock('@/hooks/business/useCSAT', () => ({
  useSatisfactionBreakdown: (...a: unknown[]) => h.csat(...a),
}));
vi.mock('@/hooks/business/useNPSSurveys', () => ({
  useNPSSurveys: (...a: unknown[]) => h.nps(...a),
}));
vi.mock('recharts', async () => {
  const real = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...real,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="grafico">{children}</div>,
  };
});

import { SatisfactionMetrics } from '../SatisfactionMetrics';

/** Valor do KPI pela posição (os quatro cards usam o mesmo testid). */
function kpi(i: number): string {
  return within(screen.getAllByTestId('kpi-card')[i]).getByTestId('kpi-value').textContent ?? '';
}

const VAZIO = {
  totalResponses: 0,
  csatPercent: null,
  previousCsatPercent: null,
  trend: null,
  trendValue: 0,
  distribution: [5, 4, 3, 2, 1].map((rating) => ({ rating, count: 0 })),
  byAgent: [],
  byQueue: [],
  timeline: [{ date: '01/10', csatPercent: null, responses: 0 }],
};

const CHEIO = {
  totalResponses: 13,
  csatPercent: 84.6,
  previousCsatPercent: 75,
  trend: 'up' as const,
  trendValue: 9.6,
  distribution: [
    { rating: 5, count: 8 },
    { rating: 4, count: 3 },
    { rating: 3, count: 1 },
    { rating: 2, count: 1 },
    { rating: 1, count: 0 },
  ],
  byAgent: [
    { agentId: 'a1', agentName: 'Joaquim Silva', csatPercent: 90, totalRatings: 5 },
    { agentId: 'a2', agentName: 'Ana Souza', csatPercent: 80, totalRatings: 4 },
    { agentId: 'a3', agentName: 'Bia Lima', csatPercent: 70, totalRatings: 3 },
    { agentId: 'a4', agentName: 'Caio Melo', csatPercent: 60, totalRatings: 1 },
  ],
  byQueue: [
    { queueId: 'q1', queueName: 'Vendas', csatPercent: 60, responses: 3 },
    { queueId: 'q2', queueName: 'Suporte', csatPercent: 95, responses: 10 },
  ],
  timeline: [
    { date: '01/10', csatPercent: 80, responses: 4 },
    { date: '02/10', csatPercent: null, responses: 0 },
    { date: '03/10', csatPercent: 90, responses: 9 },
  ],
};

const surveys = (over: Array<{ score: number; dias: number }>) =>
  over.map((s, i) => ({
    id: `s${i}`,
    contact_id: `c${i}`,
    score: s.score,
    created_at: new Date(Date.now() - s.dias * 86_400_000).toISOString(),
    feedback: null,
    survey_type: 'manual' as const,
  }));

beforeAll(() => {
  // Radix usa captura de ponteiro; o jsdom não traz os métodos.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  h.csat.mockReset();
  h.nps.mockReset();
  h.csat.mockReturnValue({ data: CHEIO, isLoading: false, isError: false, refetch: vi.fn() });
  h.nps.mockReturnValue({ surveys: surveys([{ score: 10, dias: 1 }, { score: 9, dias: 2 }, { score: 5, dias: 3 }]) });
});

describe('SatisfactionMetrics — erro e carregando', () => {
  it('falha na leitura mostra o aviso e o botão que refaz a consulta', () => {
    const refetch = vi.fn();
    h.csat.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });

    render(<SatisfactionMetrics />);

    expect(screen.getByText('Erro ao carregar dados de satisfação')).toBeInTheDocument();
    expect(screen.queryByTestId('sat-evolution-card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('enquanto carrega, os quatro KPIs ficam "—" e nenhum número aparece', () => {
    h.csat.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    h.nps.mockReturnValue({ surveys: [] });

    render(<SatisfactionMetrics />);

    expect(kpi(0)).toBe('—');
    expect(kpi(1)).toBe('—');
    expect(kpi(2)).toBe('—');
    expect(kpi(3)).toBe('Sem dados');
    expect(screen.getAllByText('Sem avaliações no período')).toHaveLength(4);
  });
});

describe('SatisfactionMetrics — período sem respostas', () => {
  it('vazio: "—" nos KPIs e os quatro blocos de vazio, sem barra nem ranking', () => {
    h.csat.mockReturnValue({ data: VAZIO, isLoading: false, isError: false, refetch: vi.fn() });
    h.nps.mockReturnValue({ surveys: [] });

    render(<SatisfactionMetrics />);

    // CSAT, NPS e Top Agente sem valor; Respostas CSAT = 0
    expect(kpi(0)).toBe('—');
    expect(kpi(1)).toBe('—');
    expect(kpi(2)).toBe('0');
    expect(kpi(3)).toBe('Sem dados');
    expect(screen.getAllByText('Sem avaliações no período')).toHaveLength(4);
    expect(screen.getByText('Ainda não há avaliações de satisfação neste período')).toBeInTheDocument();
    expect(screen.getByText('As respostas dos clientes aparecerão aqui, distribuídas por nota de 1 a 5.')).toBeInTheDocument();
    expect(screen.getAllByText('Sem dados para exibir')).toHaveLength(2);
    expect(screen.getByText('Não há avaliações registradas nas filas durante o período selecionado.')).toBeInTheDocument();
    expect(screen.getByText('Ainda não há avaliações de satisfação para os agentes neste período.')).toBeInTheDocument();
    expect(screen.queryByTestId('grafico')).not.toBeInTheDocument();
    expect(screen.getByText('Selecionar outro período')).toBeInTheDocument();
  });

  it('pesquisa NPS fora do período não entra no cálculo (não vira 0 por engano)', () => {
    h.csat.mockReturnValue({ data: VAZIO, isLoading: false, isError: false, refetch: vi.fn() });
    h.nps.mockReturnValue({ surveys: surveys([{ score: 10, dias: 100 }, { score: 0, dias: 100 }]) });

    render(<SatisfactionMetrics />);

    // O NPS fica sem valor: as duas respostas estão fora da janela
    expect(kpi(1)).toBe('—');
  });
});

describe('SatisfactionMetrics — com dados', () => {
  it('KPIs: CSAT arredondado, NPS do período, total e top agente', async () => {
    render(<SatisfactionMetrics />);

    expect(kpi(0)).toBe('85%');
    // (2 promotores - 1 detrator) / 3 respostas = 33
    await waitFor(() => expect(kpi(1)).toBe('33'));
    await waitFor(() => expect(kpi(2)).toBe('13'));
    expect(kpi(3)).toBe('Joaquim');
    expect(screen.getByText('90% CSAT')).toBeInTheDocument();
  });

  it('e a dica pode ser dispensada', () => {
    render(<SatisfactionMetrics />);
    expect(screen.getByTestId('sat-tip-card')).toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId('sat-tip-card')).getAllByRole('button')[0]);

    expect(screen.queryByTestId('sat-tip-card')).not.toBeInTheDocument();
  });

  it('desenha os três gráficos quando existe dado na janela', () => {
    render(<SatisfactionMetrics />);

    expect(screen.getAllByTestId('grafico')).toHaveLength(2);
    expect(screen.queryByText('Ainda não há avaliações de satisfação neste período')).not.toBeInTheDocument();
    // legenda do gráfico (o rótulo do KPI repete o mesmo texto)
    expect(screen.getAllByText('CSAT').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('NPS').length).toBeGreaterThanOrEqual(2);
  });

  it('filas: ordena por CSAT e corta em cinco; o modo Volume troca o número exibido', () => {
    render(<SatisfactionMetrics />);
    const filas = screen.getByTestId('sat-queue-card');

    const nomes = within(filas).getAllByText(/Vendas|Suporte/).map((e) => e.textContent);
    expect(nomes).toEqual(['Suporte', 'Vendas']);
    expect(within(filas).getByText('95%')).toBeInTheDocument();

    const gatilho = screen.getByRole('combobox', { name: 'Modo fila' });
    fireEvent.pointerDown(gatilho, { button: 0, pointerType: 'mouse' });
    fireEvent.click(gatilho);
    fireEvent.click(screen.getByRole('option', { name: 'Volume' }));

    expect(within(filas).getByText('10')).toBeInTheDocument();
    expect(within(filas).getByText('3')).toBeInTheDocument();
  });

  it('agentes: mostra o Top N escolhido, na ordem do hook', () => {
    render(<SatisfactionMetrics />);
    const agentes = screen.getByTestId('sat-agents-card');
    expect(within(agentes).getAllByText(/Joaquim Silva|Ana Souza|Bia Lima|Caio Melo/)).toHaveLength(4);

    const gatilho = screen.getByRole('combobox', { name: 'Top N agentes por satisfação' });
    fireEvent.pointerDown(gatilho, { button: 0, pointerType: 'mouse' });
    fireEvent.click(gatilho);
    fireEvent.click(screen.getByRole('option', { name: 'Top 3' }));

    expect(within(agentes).getAllByText(/Joaquim Silva|Ana Souza|Bia Lima|Caio Melo/)).toHaveLength(3);
    expect(within(agentes).queryByText('Caio Melo')).not.toBeInTheDocument();
  });

  it('o período da evolução pede a janela escolhida ao hook', () => {
    render(<SatisfactionMetrics />);
    expect(h.csat).toHaveBeenLastCalledWith(30);

    const gatilho = screen.getByRole('combobox', { name: 'Período da evolução da satisfação' });
    fireEvent.pointerDown(gatilho, { button: 0, pointerType: 'mouse' });
    fireEvent.click(gatilho);
    fireEvent.click(screen.getByRole('option', { name: 'Últimos 7 dias' }));

    expect(h.csat).toHaveBeenLastCalledWith(7);
  });
});
