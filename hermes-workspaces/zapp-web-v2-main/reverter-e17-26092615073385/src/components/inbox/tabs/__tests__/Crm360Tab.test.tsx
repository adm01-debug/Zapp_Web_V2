import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Crm360Tab } from '../Crm360Tab';
import type { Conversation } from '@/types/chat';
import type { Crm360Result } from '@/hooks/crm/useContactCrm360';

const mockUseContactCrm360 = vi.fn();
const mockUseContactLeadScore = vi.fn();
const mockAdvanceMutate = vi.fn();
const mockNavigateToView = vi.fn();
const mockCreateTask = vi.fn();

vi.mock('@/hooks/crm/useContactCrm360', () => ({
  useContactCrm360: (...args: unknown[]) => mockUseContactCrm360(...args),
  useContactLeadScore: (...args: unknown[]) => mockUseContactLeadScore(...args),
  useAdvanceDealStage: () => ({ mutate: mockAdvanceMutate, isPending: false }),
}));

vi.mock('@/hooks/chat/useNextBestAction', () => ({
  useNextBestAction: () => ({ actions: [], loading: false }),
}));

vi.mock('@/hooks/chat/useConversationTasks', () => ({
  useConversationTasks: () => ({ createTask: mockCreateTask }),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({
  navigateToView: (...args: unknown[]) => mockNavigateToView(...args),
}));

const EMPTY_CRM360: Crm360Result = {
  purchases: [],
  openDeals: [],
  stages: [],
  currentStage: null,
  currentDeal: null,
  ticketMedio: null,
  ticketDeltaPct: null,
  interesses: [],
  pipeline: {
    propostas: { total: 0, count: 0 },
    negociacao: { total: 0, count: 0 },
    ganhos: { total: 0, count: 0 },
  },
  interacoes: [],
  resumo: { comprasTotal: 0, comprasCount: 0, propostas: 0, emAberto: 0 },
};

const conversation: Conversation = {
  id: 'conv-1',
  contact: {
    id: 'contact-1',
    name: 'Ana Cliente',
    phone: '5511999999999',
    company: null,
    job_title: null,
    created_at: '2026-01-15T10:00:00.000Z',
    conversation_status: 'open',
  },
  unreadCount: 0,
  status: 'open',
} as unknown as Conversation;

function renderTab(crm360: Partial<Crm360Result> | undefined = EMPTY_CRM360) {
  mockUseContactCrm360.mockReturnValue({ data: crm360 });
  mockUseContactLeadScore.mockReturnValue({ data: null });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onTabChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <Crm360Tab conversation={conversation} messages={[]} onTabChange={onTabChange} />
    </QueryClientProvider>
  );
  return { onTabChange };
}

describe('Crm360Tab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderiza a faixa de KPIs', () => {
    renderTab();
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
    expect(screen.getAllByTestId('kpi-cell')).toHaveLength(4);
  });

  it('mostra empty states honestos quando não há dados comerciais', () => {
    renderTab();
    expect(screen.getByText('Nenhuma compra registrada')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma proposta em aberto')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma negociação aberta')).toBeInTheDocument();
    expect(screen.getByText('Sem negociações')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma interação comercial')).toBeInTheDocument();
    expect(screen.getByText('Nenhum interesse marcado')).toBeInTheDocument();
    expect(screen.getByText('Sem empresa')).toBeInTheDocument();
  });

  it('nunca inventa nomes ou valores das imagens de referência', () => {
    renderTab();
    expect(screen.queryByText(/Joaquim|Ana Souza|12\.450|Score 92|Segmento Varejo/)).not.toBeInTheDocument();
  });

  it('"Ver todas →" de Últimas compras troca para a aba Pedidos', () => {
    const { onTabChange } = renderTab();
    fireEvent.click(screen.getByText('Ver todas →'));
    expect(onTabChange).toHaveBeenCalledWith('orders');
  });

  it('"Ver histórico →" troca para a aba Histórico', () => {
    const { onTabChange } = renderTab();
    fireEvent.click(screen.getByText('Ver histórico →'));
    expect(onTabChange).toHaveBeenCalledWith('history');
  });

  it('"Ver funil →" navega para o pipeline (navigateToView)', () => {
    renderTab();
    fireEvent.click(screen.getByText('Ver funil →'));
    expect(mockNavigateToView).toHaveBeenCalledWith('pipeline');
  });

  it('exibe o ticket médio formatado em BRL quando há compras concluídas', () => {
    renderTab({ ...EMPTY_CRM360, ticketMedio: 1234.5 });
    expect(screen.getByText(/R\$\s*1\.234,50/)).toBeInTheDocument();
  });

  it('renderiza o stepper de etapas quando há um deal aberto', () => {
    renderTab({
      ...EMPTY_CRM360,
      stages: [{ id: 's1', name: 'Prospecção', position: 1, is_active: true }, { id: 's2', name: 'Proposta', position: 2, is_active: true }],
      currentStage: { id: 's1', name: 'Prospecção', position: 1, is_active: true },
      currentDeal: { id: 'd1', title: 'Negócio X', value: 1000, status: 'open', stage_id: 's1', expected_close_date: null, updated_at: '2026-01-01T00:00:00.000Z' },
    });
    expect(screen.getByText('Prospecção')).toBeInTheDocument();
    expect(screen.getByText('Avançar etapa →')).toBeInTheDocument();
  });
});
