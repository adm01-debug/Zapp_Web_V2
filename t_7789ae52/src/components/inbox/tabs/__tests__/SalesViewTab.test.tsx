import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SalesViewTab } from '../SalesViewTab';
import type { Crm360Result, Crm360Deal } from '@/hooks/crm/useContactCrm360';

const mockUseContactCrm360 = vi.fn();
const mockInsert = vi.fn((_record: unknown) => Promise.resolve({ error: null }));
let purchasesData: unknown[] = [];

vi.mock('@/hooks/crm/useContactCrm360', () => ({
  useContactCrm360: (...args: unknown[]) => mockUseContactCrm360(...args),
  contactCrm360Key: (contactId: string) => ['contact-crm-360', contactId] as const,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: purchasesData }) }) }),
      insert: (record: unknown) => mockInsert(record),
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

const DEAL: Crm360Deal = {
  id: 'd1',
  title: 'Negócio Y',
  value: 1500,
  status: 'open',
  stage_id: 's1',
  expected_close_date: '2026-11-01',
  updated_at: '2026-10-01T00:00:00.000Z',
};

const PURCHASE = (id: string, title: string) => ({
  id,
  title,
  description: null,
  amount: 100,
  currency: 'BRL',
  status: 'completed',
  purchase_type: 'purchase',
  purchased_at: '2026-09-30T00:00:00.000Z',
  created_at: '2026-09-30T00:00:00.000Z',
});

function renderTab(profileId: string | null = 'profile-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SalesViewTab contactId="c1" profileId={profileId} />
    </QueryClientProvider>,
  );
}

describe('SalesViewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    purchasesData = [];
  });

  it('estado vazio: tiles do resumo, "+ Novo" e empty states internos — nunca empty state de aba', async () => {
    mockUseContactCrm360.mockReturnValue({ data: EMPTY_CRM360 });
    renderTab();

    expect(screen.getByTestId('commercial-summary-strip')).toBeInTheDocument();
    expect(screen.getByText('Compras (0)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /novo/i })).toBeInTheDocument();
    expect(await screen.findByText('Nenhum registro de compra/proposta')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma proposta em aberto')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum pedido registrado')).not.toBeInTheDocument();
  });

  it('com dados: "Compras (2)", lista de compras e a proposta em aberto — sem empty states', async () => {
    purchasesData = [PURCHASE('p1', 'Compra A'), PURCHASE('p2', 'Compra B')];
    mockUseContactCrm360.mockReturnValue({
      data: {
        ...EMPTY_CRM360,
        resumo: { comprasTotal: 500, comprasCount: 2, propostas: 1, emAberto: 1 },
        ticketMedio: 250,
        openDeals: [DEAL],
      },
    });
    renderTab();

    expect(screen.getByText('Compras (2)')).toBeInTheDocument();
    expect(screen.getByText('Propostas em aberto')).toBeInTheDocument();
    expect(await screen.findByText('Compra A')).toBeInTheDocument();
    expect(screen.getByText('Negócio Y')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum registro de compra/proposta')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma proposta em aberto')).not.toBeInTheDocument();
  });

  it('profileId chega ao insert do ContactPurchasesPanel como created_by', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockUseContactCrm360.mockReturnValue({ data: EMPTY_CRM360 });
    renderTab('profile-9');

    fireEvent.click(screen.getByRole('button', { name: /novo/i }));
    fireEvent.change(screen.getByPlaceholderText('Título'), { target: { value: 'Cadeira' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: 'c1', created_by: 'profile-9', title: 'Cadeira' }),
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['contact-crm-360', 'c1'] }),
    );
    invalidateSpy.mockRestore();
  });

  it('nunca renderiza o texto "Pedidos"', async () => {
    mockUseContactCrm360.mockReturnValue({ data: EMPTY_CRM360 });
    renderTab();

    await screen.findByTestId('commercial-summary-strip');
    expect(screen.queryByText(/pedidos?/i)).not.toBeInTheDocument();
  });
});
