import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactDetails } from '../../ContactDetails';
import type { Conversation } from '@/types/chat';

/**
 * Prova do PONTO DE MONTAGEM da seção "Entrega de mensagens" (16/10/2026).
 *
 * Aqui só a RPC é mockada: o ContactDetails real, o hook real e o painel real rodam,
 * então o teste cai se a seção sair do painel do contato ou se a RPC for chamada
 * com o contato errado.
 */
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

const fixture = {
  contact_id: 'c1',
  is_group: false,
  window_hours: 24,
  totals: {
    sent: 7, delivered: 5, read: 2, failed: 0, received: 3, total_messages: 10,
    last_sent_at: '2026-10-16T10:30:00Z',
    last_delivered_at: '2026-10-16T10:20:00Z',
    last_read_at: '2026-10-16T10:10:00Z',
  },
  timeline: [{ hour: '2026-10-16T10:00:00Z', sent: 4, delivered: 3, read: 1 }],
};

vi.mock('@/integrations/supabase/client', () => {
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const terminal = () => ({
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    limit: () => terminal(),
  });
  const select = vi.fn(() => ({ eq: vi.fn(() => terminal()) }));
  return {
    supabase: {
      from: vi.fn(() => ({ update, select })),
      functions: { invoke: vi.fn(async () => ({ data: { ok: true }, error: null })) },
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      rpc: (...args: unknown[]) => h.rpc(...args),
    },
  };
});
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/hooks/crm/useContactEnrichedData', () => ({ useContactEnrichedData: () => ({ enrichedData: null }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => true }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: (_key: string, fallback = false) => fallback }));
vi.mock('@/components/inbox/contact-details/sidebar/ContactSidebarSections', () => ({ ContactSidebarSections: () => null }));
vi.mock('@/components/inbox/contact-details/EditContactDialog', () => ({ EditContactDialog: () => null }));
vi.mock('@/hooks/crm/useExternalContact360', () => ({ useExternalContact360: () => ({ data: null }) }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));
vi.mock('@/hooks/crm/useContactIntelligence', () => ({
  useContactIntelligence: () => ({ data: null, isLoading: false }),
}));

const conversation: Conversation = {
  id: 'conv1',
  contact: {
    id: 'c1',
    name: 'Maria Silva',
    phone: '+551****9999',
    tags: [],
    conversation_status: 'open',
  },
  unreadCount: 0,
  status: 'open',
  priority: 'low',
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-05'),
};

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContactDetails conversation={conversation} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('ContactDetails — seção Entrega de mensagens (16/10/2026)', () => {
  beforeAll(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  beforeEach(() => {
    localStorage.clear();
    h.rpc.mockReset();
    h.rpc.mockResolvedValue({ data: fixture, error: null });
  });

  it('a seção abre no painel do contato com os números que a RPC devolveu', async () => {
    renderPanel();

    expect(screen.getByTestId('sidebar-section-delivery')).toBeInTheDocument();
    expect(screen.getByText('Entrega de mensagens')).toBeInTheDocument();

    const totais = await screen.findByTestId('delivery-totals');
    expect(totais).toHaveTextContent('7');
    expect(screen.getByTestId('delivery-kpi-entregues')).toHaveTextContent('5');
    expect(screen.getByTestId('delivery-kpi-lidas')).toHaveTextContent('2');
    expect(screen.getByTestId('delivery-hour-sent')).toHaveTextContent('4');

    // Consulta feita com o contato da conversa aberta e a janela padrão de 24 h.
    expect(h.rpc).toHaveBeenCalledWith('delivery_stats', { p_contact_id: 'c1', p_hours: 24 });
  });

  it('a seção continua no painel quando ainda não há número nenhum', async () => {
    h.rpc.mockResolvedValue({
      data: { ...fixture, totals: { ...fixture.totals, sent: 0, delivered: 0, read: 0, received: 0, total_messages: 0 }, timeline: [] },
      error: null,
    });
    renderPanel();

    expect(screen.getByTestId('sidebar-section-delivery')).toBeInTheDocument();
    expect(await screen.findByTestId('delivery-empty')).toHaveTextContent('Sem mensagens nas últimas 24 horas.');
  });
});
