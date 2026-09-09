import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryTab } from '../HistoryTab';
import type { TimelineDay, TimelineMetrics } from '@/hooks/chat/useConversationHistoryTimeline';

const mockUseConversationHistoryTimeline = vi.fn();

vi.mock('@/hooks/chat/useConversationHistoryTimeline', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/chat/useConversationHistoryTimeline')>('@/hooks/chat/useConversationHistoryTimeline');
  return { ...actual, useConversationHistoryTimeline: (...args: unknown[]) => mockUseConversationHistoryTimeline(...args) };
});

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

function renderTab(overrides: Partial<{ days: TimelineDay[]; metrics: TimelineMetrics; hasMore: boolean; isLoading: boolean }> = {}) {
  mockUseConversationHistoryTimeline.mockReturnValue({
    data: overrides.isLoading ? undefined : { days: overrides.days ?? DAYS, metrics: overrides.metrics ?? METRICS, hasMore: overrides.hasMore ?? false },
    isLoading: overrides.isLoading ?? false,
  });
  return render(<HistoryTab contactId="c1" />);
}

describe('HistoryTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderiza os eventos agrupados por dia', () => {
    renderTab();
    expect(screen.getAllByTestId('timeline-event')).toHaveLength(2);
    expect(screen.getByText('Mensagem recebida')).toBeInTheDocument();
    expect(screen.getByText('Tarefa criada: Ligar')).toBeInTheDocument();
    expect(screen.getByText('Recebida')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByTestId('timeline-event')[0]).toHaveClass('grid-cols-[44px_20px_minmax(0,1fr)]');
  });

  it('mostra os KPIs vindos do hook', () => {
    renderTab();
    const strip = screen.getByTestId('kpi-strip');
    expect(strip).toHaveTextContent('5');
    expect(strip).toHaveTextContent('1');
    expect(strip).toHaveTextContent('Mensagens, notas e ações');
    expect(strip).toHaveTextContent('Conversas finalizadas');
    expect(strip).toHaveTextContent('Sem comparação anterior');
  });

  it('exibe filtros com rotulos associados aos controles', () => {
    renderTab();
    expect(screen.getByLabelText('Período')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de evento')).toBeInTheDocument();
  });

  it('mapeia categorias reais para badges sem inventar canal', () => {
    renderTab({
      days: [{
        date: '2026-09-08',
        events: [
          { id: 'transfer-1', at: '2026-09-08T15:00:00.000Z', kind: 'transfer', title: 'Transferência' },
          { id: 'close-1', at: '2026-09-08T14:00:00.000Z', kind: 'close', title: 'Conversa encerrada' },
          { id: 'reopen-1', at: '2026-09-08T13:00:00.000Z', kind: 'reopen', title: 'Conversa reaberta' },
        ],
      }],
    });

    expect(screen.getAllByText('Transferência')).toHaveLength(2);
    expect(screen.getByText('Encerrada')).toBeInTheDocument();
    expect(screen.getByText('Reaberta')).toBeInTheDocument();
    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
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
});
