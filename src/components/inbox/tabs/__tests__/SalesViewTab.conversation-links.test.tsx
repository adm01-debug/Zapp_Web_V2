/**
 * N-042 — SalesView: conversa aberta vinculada a oportunidade/orçamento/pedido.
 *
 * A aba SalesView passa a receber a conversa aberta no chat (prop `conversationId`)
 * e a exibir a seção "Vinculados a esta conversa" com o que está vinculado àquele
 * contato (oportunidades/orçamentos em aberto e pedidos), escopada pelo id da
 * conversa. Sem vínculo, a seção mostra estado vazio.
 *
 * Este teste chama o componente REAL: sem a prop + seção, fica vermelho.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SalesViewTab } from '../SalesViewTab';
import type { Crm360Result, Crm360Deal, Crm360Purchase } from '@/hooks/crm/useContactCrm360';

const mockUseContactCrm360 = vi.fn();
let purchasesData: unknown[] = [];

vi.mock('@/hooks/crm/useContactCrm360', () => ({
  useContactCrm360: (...args: unknown[]) => mockUseContactCrm360(...args),
  contactCrm360Key: (contactId: string) => ['contact-crm-360', contactId] as const,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: purchasesData }) }) }),
      insert: () => Promise.resolve({ error: null }),
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
  title: 'Orçamento sala de reunião',
  value: 1500,
  status: 'open',
  stage_id: 's1',
  expected_close_date: '2026-11-01',
  updated_at: '2026-10-01T00:00:00.000Z',
};

const PURCHASE: Crm360Purchase = {
  id: 'p1',
  title: 'Pedido cadeiras ergonômicas',
  amount: 900,
  purchased_at: '2026-09-30T00:00:00.000Z',
  status: 'completed',
};

function renderTab(conversationId?: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SalesViewTab
        contactId="c1"
        profileId="profile-1"
        onTabChange={vi.fn()}
        conversationId={conversationId}
      />
    </QueryClientProvider>,
  );
}

describe('SalesViewTab — conversa vinculada (N-042)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    purchasesData = [];
  });

  it('exibe a seção escopada pela conversa aberta, listando oportunidade/orçamento e pedido', async () => {
    mockUseContactCrm360.mockReturnValue({
      data: { ...EMPTY_CRM360, openDeals: [DEAL], purchases: [PURCHASE] },
    });
    renderTab('conv-9');

    const secao = await screen.findByTestId('conversation-linked');
    expect(secao.getAttribute('data-conversation-id')).toBe('conv-9');
    expect(screen.getByText('Vinculados a esta conversa')).toBeInTheDocument();
    // Escopado à seção: o mesmo deal também aparece em "Propostas em aberto".
    expect(within(secao).getByText('Orçamento sala de reunião')).toBeInTheDocument();
    expect(within(secao).getByText('Pedido cadeiras ergonômicas')).toBeInTheDocument();
    expect(within(secao).queryByText('Nada vinculado a esta conversa')).not.toBeInTheDocument();
  });

  it('sem vínculo, mostra estado vazio com texto', async () => {
    mockUseContactCrm360.mockReturnValue({ data: EMPTY_CRM360 });
    renderTab('conv-9');

    const secao = await screen.findByTestId('conversation-linked');
    expect(secao.getAttribute('data-conversation-id')).toBe('conv-9');
    expect(screen.getByText('Nada vinculado a esta conversa')).toBeInTheDocument();
  });

  it('sem conversa aberta (conversationId ausente) a seção não lista nada vinculado', async () => {
    mockUseContactCrm360.mockReturnValue({
      data: { ...EMPTY_CRM360, openDeals: [DEAL], purchases: [PURCHASE] },
    });
    renderTab(undefined);

    const secao = await screen.findByTestId('conversation-linked');
    expect(secao.getAttribute('data-conversation-id')).toBe('');
    expect(screen.getByText('Nada vinculado a esta conversa')).toBeInTheDocument();
    // A seção não lista nada: o deal só aparece em "Propostas em aberto".
    expect(within(secao).queryByText('Orçamento sala de reunião')).not.toBeInTheDocument();
    expect(within(secao).queryByTestId('conversation-linked-orders')).not.toBeInTheDocument();
  });
});
