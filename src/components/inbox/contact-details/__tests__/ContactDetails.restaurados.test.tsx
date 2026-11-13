import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactDetails } from '../../ContactDetails';
import type { Conversation } from '@/types/chat';

/**
 * Painéis restaurados em 2026-11-12 (saíram como órfãos na #1886/#2112):
 * "Memória da conversa" e "Atendimento" entram no painel do contato como
 * seções recolhidas, alcançáveis pelo accordion.
 */
vi.mock('@/integrations/supabase/client', () => {
  const terminal = () => ({
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    limit: () => terminal(),
  });
  return {
    supabase: {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => terminal()) })), update: vi.fn() })),
      functions: { invoke: vi.fn(async () => ({ data: { ok: true }, error: null })) },
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    },
  };
});
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/hooks/crm/useContactEnrichedData', () => ({ useContactEnrichedData: () => ({ enrichedData: null }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: (_key: string, fallback = false) => fallback }));
vi.mock('@/components/inbox/contact-details/sidebar/ContactSidebarSections', () => ({ ContactSidebarSections: () => null }));
vi.mock('@/components/inbox/contact-details/EditContactDialog', () => ({ EditContactDialog: () => null }));
vi.mock('@/components/inbox/contact-details/ContactDeliveryPanel', () => ({ ContactDeliveryPanel: () => null }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));
vi.mock('@/components/inbox/contact-details/ContactFirstResponseSLA', () => ({
  ContactFirstResponseSLA: ({ contactId }: { contactId: string }) => <div>mock-sla {contactId}</div>,
}));
vi.mock('@/components/inbox/contact-details/LeadRiskScorePanel', () => ({
  LeadRiskScorePanel: ({ contactId }: { contactId: string }) => <div>mock-lead-risk {contactId}</div>,
}));
vi.mock('@/components/inbox/contact-details/EvolutionContactProfileSection', () => ({
  EvolutionContactProfileSection: ({ phone }: { phone: string }) => <div>mock-evolution {phone}</div>,
}));
vi.mock('@/hooks/crm/useConversationMemory', () => ({
  useConversationMemory: () => ({ memory: null, status: 'empty', loading: false }),
  hasMemoryContent: () => false,
}));

const conversation: Conversation = {
  id: 'conv1',
  contact: { id: 'c1', name: 'Maria Silva', phone: '+5511999999999', tags: [], conversation_status: 'open' },
  unreadCount: 0,
  status: 'open',
  priority: 'low',
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-05'),
} as unknown as Conversation;

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContactDetails conversation={conversation} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('ContactDetails — Memória da conversa e Atendimento (restaurados)', () => {
  beforeAll(() => {
    Element.prototype.scrollTo = vi.fn();
  });
  beforeEach(() => localStorage.clear());

  it('as duas seções aparecem recolhidas por padrão (sem conteúdo montado)', () => {
    renderPanel();
    expect(screen.getByTestId('sidebar-section-memoria')).toHaveTextContent('Memória da conversa');
    expect(screen.getByTestId('sidebar-section-atendimento')).toHaveTextContent('Atendimento');
    expect(screen.queryByText(/mock-sla/)).toBeNull();
    expect(screen.queryByTestId('sidebar-empty-memoria-vazia')).toBeNull();
  });

  it('abrir "Atendimento" mostra SLA da 1ª resposta, Score e LGPD e Perfil do WhatsApp do contato', () => {
    renderPanel();
    const section = screen.getByTestId('sidebar-section-atendimento');
    fireEvent.click(within(section).getByRole('button', { name: /Atendimento/ }));

    expect(within(section).getByRole('region', { name: 'SLA da 1ª resposta' })).toHaveTextContent('mock-sla c1');
    expect(within(section).getByRole('region', { name: 'Score e LGPD' })).toHaveTextContent('mock-lead-risk c1');
    expect(within(section).getByRole('region', { name: 'Perfil do WhatsApp' })).toHaveTextContent('mock-evolution +5511999999999');
  });

  it('abrir "Memória da conversa" mostra o estado do contato e a escolha persiste', () => {
    renderPanel();
    const section = screen.getByTestId('sidebar-section-memoria');
    fireEvent.click(within(section).getByRole('button', { name: /Memória da conversa/ }));

    expect(within(section).getByTestId('sidebar-empty-memoria-vazia')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('contact-sidebar-accordion-state@v2') ?? '[]')).toContain('memoria');
  });
});
