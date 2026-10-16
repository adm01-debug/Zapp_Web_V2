import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { JourneyTab } from '../JourneyTab';
import type { TimelineDay, TimelineMetrics } from '@/hooks/chat/useConversationHistoryTimeline';
import type { ContactStats } from '@/hooks/crm/useContactStats';

const mockUseConversationHistoryTimeline = vi.fn();
const mockUseContactStats = vi.fn();

vi.mock('@/hooks/chat/useConversationHistoryTimeline', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/chat/useConversationHistoryTimeline')>('@/hooks/chat/useConversationHistoryTimeline');
  return { ...actual, useConversationHistoryTimeline: (...args: unknown[]) => mockUseConversationHistoryTimeline(...args) };
});

vi.mock('@/hooks/crm/useContactStats', () => ({
  useContactStats: (...args: unknown[]) => mockUseContactStats(...args),
}));

const DAYS: TimelineDay[] = [
  {
    date: '2026-09-08',
    events: [
      { id: 'msg-1', at: '2026-09-08T14:00:00.000Z', kind: 'message_in', title: 'Mensagem recebida', subtitle: 'Olá' },
      { id: 'task-1', at: '2026-09-08T15:00:00.000Z', kind: 'task', title: 'Tarefa criada: Ligar', pill: { label: 'Pendente', tone: 'warning' } },
    ],
  },
];

const METRICS: TimelineMetrics = { total: 5, lastContactAt: '2026-09-08T15:00:00.000Z', avgResponseMin: 42, avgResponsePrevMin: null, resolutions: 1 };

// R2-INB-035: a pílula vem pronta do mapper e a tela não pode reescrevê-la.
const DAYS_TAREFAS: TimelineDay[] = [
  {
    date: '2026-09-08',
    events: [
      { id: 'task-1', at: '2026-09-08T15:00:00.000Z', kind: 'task', title: 'Tarefa criada: Ligar', pill: { label: 'Pendente', tone: 'warning' } },
      { id: 'task-2', at: '2026-09-08T16:00:00.000Z', kind: 'task', title: 'Tarefa concluída: Ligar', pill: { label: 'Concluída', tone: 'success' } },
    ],
  },
];

const STATS: ContactStats = {
  totalMessages: 150,
  avgResponseTimeMinutes: 90,
  totalConversations: 12,
  csatAverage: 4.5,
  csatCount: 3,
};

function renderTab(overrides: Partial<{ days: TimelineDay[]; metrics: TimelineMetrics; hasMore: boolean; isLoading: boolean }> = {}) {
  mockUseConversationHistoryTimeline.mockReturnValue({
    data: overrides.isLoading ? undefined : { days: overrides.days ?? DAYS, metrics: overrides.metrics ?? METRICS, hasMore: overrides.hasMore ?? false },
    isLoading: overrides.isLoading ?? false,
  });
  return render(<JourneyTab contactId="c1" />);
}

describe('JourneyTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseContactStats.mockReturnValue({ data: STATS, isLoading: false });
  });

  it('renderiza os eventos agrupados por dia', () => {
    renderTab();
    expect(screen.getAllByTestId('timeline-event')).toHaveLength(2);
    expect(screen.getByText('Mensagem recebida')).toBeInTheDocument();
    expect(screen.getByText('Tarefa criada: Ligar')).toBeInTheDocument();
  });

  it('preserva a pílula da tarefa recebida: concluída mostra Concluída e não Pendente', () => {
    renderTab({ days: DAYS_TAREFAS });

    const concluida = screen.getByText('Tarefa concluída: Ligar').closest('[data-testid="timeline-event"]') as HTMLElement;
    expect(concluida).not.toBeNull();
    expect(within(concluida).getByText('Concluída')).toBeInTheDocument();
    expect(within(concluida).queryByText('Pendente')).not.toBeInTheDocument();
    // o ícone acompanha o tom da pílula: nada de tom de pendência numa tarefa concluída
    const icone = concluida.querySelector('svg')?.parentElement as HTMLElement;
    expect(icone.className).toContain('text-success');
    expect(icone.className).not.toContain('text-warning');

    // tarefa ainda pendente continua com a pílula que o mapper enviou (a tela não normaliza por conta própria)
    const pendente = screen.getByText('Tarefa criada: Ligar').closest('[data-testid="timeline-event"]') as HTMLElement;
    expect(within(pendente).getByText('Pendente')).toBeInTheDocument();
    expect(within(pendente).queryByText('Concluída')).not.toBeInTheDocument();
  });

  it('mostra os KPIs vindos do hook', () => {
    renderTab();
    const strip = screen.getByTestId('kpi-strip');
    expect(strip).toHaveTextContent('5');
    expect(strip).toHaveTextContent('1');
  });

  it('trocar o período chama o hook com o novo valor', () => {
    renderTab();
    fireEvent.click(screen.getByText('Últimos 30 dias'));
    fireEvent.click(screen.getByText('Últimos 7 dias'));
    expect(mockUseConversationHistoryTimeline).toHaveBeenLastCalledWith('c1', 7, 'all', 200);
  });

  it('sem eventos mostra o empty state honesto', () => {
    renderTab({ days: [] });
    expect(screen.getByText('Nenhum evento neste período.')).toBeInTheDocument();
  });

  it('"Carregar mais" aparece só quando hasMore é verdadeiro', () => {
    renderTab({ hasMore: true });
    expect(screen.getByText('Carregar mais')).toBeInTheDocument();
  });

  it('mostra as estatísticas do contato na faixa do topo (contact-stats-strip)', () => {
    renderTab();
    const strip = screen.getByTestId('contact-stats-strip');
    expect(strip).toHaveTextContent('150');
    expect(strip).toHaveTextContent('1h30m');
    expect(strip).toHaveTextContent('12');
    expect(strip).toHaveTextContent('4.5⭐');
    expect(strip).toHaveTextContent('Total trocado');
    expect(strip).toHaveTextContent('Resposta ao cliente');
    expect(strip).toHaveTextContent('Episódios respondidos');
    expect(strip).toHaveTextContent('3 avaliações');
    expect(mockUseContactStats).toHaveBeenCalledWith('c1');
  });

  it('não rotula a faixa de estatísticas como histórico completo (SV-002/S24)', () => {
    renderTab();
    expect(screen.queryByText('Desde o início do relacionamento')).not.toBeInTheDocument();
    expect(screen.getByText('Independe do período abaixo')).toBeInTheDocument();
  });

  it('trocar o período não refaz a busca das estatísticas (faixa é do contato inteiro)', () => {
    renderTab();
    fireEvent.click(screen.getByText('Últimos 30 dias'));
    fireEvent.click(screen.getByText('Últimos 7 dias'));
    for (const call of mockUseContactStats.mock.calls) {
      expect(call).toEqual(['c1']);
    }
    expect(mockUseConversationHistoryTimeline).toHaveBeenLastCalledWith('c1', 7, 'all', 200);
    expect(screen.getByText('No período selecionado')).toBeInTheDocument();
  });

  it('estatísticas carregando não bloqueiam a timeline (cargas independentes)', () => {
    mockUseContactStats.mockReturnValue({ data: undefined, isLoading: true });
    renderTab();
    expect(screen.getAllByTestId('timeline-event')).toHaveLength(2);
    expect(screen.getByTestId('contact-stats-strip')).toBeInTheDocument();
  });
});
