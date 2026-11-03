import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SalesViewTab } from '../SalesViewTab';
import type { Crm360Result, Crm360Deal } from '@/hooks/crm/useContactCrm360';

const mockUseContactCrm360 = vi.fn();

vi.mock('@/hooks/crm/useContactCrm360', () => ({
  useContactCrm360: (...args: unknown[]) => mockUseContactCrm360(...args),
  contactCrm360Key: (contactId: string) => ['contact-crm-360', contactId] as const,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const EMPTY_CRM360: Crm360Result = {
  openDeals: [],
  stages: [],
  currentStage: null,
  currentDeal: null,
  interesses: [],
  pipeline: {
    propostas: { total: 0, count: 0 },
    negociacao: { total: 0, count: 0 },
    ganhos: { total: 0, count: 0 },
  },
  interacoes: [],
  resumo: { propostas: 0, emAberto: 0 },
};

const DEAL: Crm360Deal = {
  id: 'd1',
  title: 'Negócio Y',
  value: 1500,
  status: 'open',
  stage_id: 's1',
  expected_close_date: '2026-11-01',
  updated_at: '2026-10-01T00:00:00.000Z',
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onTabChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <SalesViewTab contactId="c1" onTabChange={onTabChange} />
    </QueryClientProvider>,
  );
  return { onTabChange };
}

describe('SalesViewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('estado vazio: tiles do resumo e empty state interno de propostas — sem módulo de compras', () => {
    mockUseContactCrm360.mockReturnValue({ data: EMPTY_CRM360 });
    renderTab();

    expect(screen.getByTestId('commercial-summary-strip')).toBeInTheDocument();
    expect(screen.getByText('Propostas')).toBeInTheDocument();
    expect(screen.getByText('Em aberto')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma proposta em aberto')).toBeInTheDocument();
    expect(screen.queryByText(/compras/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ticket médio/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /novo/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum pedido registrado')).not.toBeInTheDocument();
  });

  it('com dados: a proposta em aberto aparece — sem empty state', () => {
    mockUseContactCrm360.mockReturnValue({
      data: { ...EMPTY_CRM360, resumo: { propostas: 1, emAberto: 1 }, openDeals: [DEAL] },
    });
    renderTab();

    expect(screen.getByText('Propostas em aberto')).toBeInTheDocument();
    expect(screen.getByText('Negócio Y')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma proposta em aberto')).not.toBeInTheDocument();
  });

  it('nunca renderiza o texto "Pedidos"', () => {
    mockUseContactCrm360.mockReturnValue({ data: EMPTY_CRM360 });
    renderTab();

    expect(screen.getByTestId('commercial-summary-strip')).toBeInTheDocument();
    expect(screen.queryByText(/pedidos?/i)).not.toBeInTheDocument();
  });

  it('"Ver no CRM →" no Resumo comercial troca para a aba CRM 360°', () => {
    mockUseContactCrm360.mockReturnValue({ data: EMPTY_CRM360 });
    const { onTabChange } = renderTab();

    fireEvent.click(screen.getByText('Ver no CRM →'));

    expect(onTabChange).toHaveBeenCalledWith('crm');
  });
});
