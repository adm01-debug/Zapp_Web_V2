import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrdersTab } from '../OrdersTab';
import { OpenDealsList } from '../OpenDealsList';
import type { Crm360Result } from '@/hooks/crm/useContactCrm360';

const mockUseContactCrm360 = vi.fn();

vi.mock('@/hooks/crm/useContactCrm360', () => ({
  useContactCrm360: (...args: unknown[]) => mockUseContactCrm360(...args),
}));

vi.mock('../../ContactPurchasesPanel', () => ({
  ContactPurchasesPanel: ({ contactId }: { contactId: string }) => <div>Compras de {contactId}</div>,
}));

const EMPTY: Crm360Result = {
  purchases: [], openDeals: [], stages: [], currentStage: null, currentDeal: null,
  ticketMedio: null, ticketDeltaPct: null, interesses: [], interacoes: [],
  pipeline: {
    propostas: { total: 0, count: 0 },
    negociacao: { total: 0, count: 0 },
    ganhos: { total: 0, count: 0 },
  },
  resumo: { comprasTotal: 0, comprasCount: 0, propostas: 0, emAberto: 0 },
};

describe('OrdersTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('não apresenta ausência enquanto a consulta está carregando', () => {
    mockUseContactCrm360.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<OrdersTab contactId="contact-1" />);
    expect(screen.getByText('Carregando pedidos')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum pedido registrado')).not.toBeInTheDocument();
  });

  it('apresenta erro separadamente de uma coleção vazia', () => {
    mockUseContactCrm360.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<OrdersTab contactId="contact-1" />);
    expect(screen.getByText('Não foi possível carregar os pedidos')).toBeInTheDocument();
  });

  it('apresenta empty state honesto quando compras e propostas estão vazias', () => {
    mockUseContactCrm360.mockReturnValue({ data: EMPTY, isLoading: false, isError: false });
    render(<OrdersTab contactId="contact-1" />);
    expect(screen.getByText('Nenhum pedido registrado')).toBeInTheDocument();
  });

  it('usa SectionCards em grid responsivo ao container quando existem dados', () => {
    mockUseContactCrm360.mockReturnValue({
      data: { ...EMPTY, purchases: [{ id: 'p1', title: 'Compra real', amount: 0, purchased_at: null, status: 'completed' }] },
      isLoading: false,
      isError: false,
    });
    render(<OrdersTab contactId="contact-1" />);
    expect(screen.getByTestId('orders-card-grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 24rem), 1fr))',
    });
    expect(screen.getByText('Compras de contact-1')).toBeInTheDocument();
    expect(screen.getByText('Compras e propostas')).toBeInTheDocument();
  });
});

describe('OpenDealsList', () => {
  it('preserva valor zero e ignora uma previsão inválida sem quebrar', () => {
    render(<OpenDealsList deals={[{
      id: 'd1', title: 'Proposta real', value: 0, status: 'open', stage_id: null,
      expected_close_date: 'inválida', updated_at: null,
    }]} />);
    expect(screen.getByText('Proposta real')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*0,00/)).toBeInTheDocument();
    expect(screen.queryByText(/Previsão:/)).not.toBeInTheDocument();
  });
});
