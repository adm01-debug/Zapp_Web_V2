import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactDetails } from '../../ContactDetails';
import type { Conversation } from '@/types/chat';

interface Intel {
  found: boolean;
  churn: {
    churn_probability: number;
    risk_level: string;
    risk_factors: Record<string, unknown> | null;
    recommended_actions: string[] | null;
  } | null;
  best_times: { day_of_week: number; hour: number; success_rate?: number }[];
}

const h = vi.hoisted(() => ({
  intelligence: { data: null as Intel | null, isLoading: false },
}));

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
  useContactIntelligence: () => ({ data: h.intelligence.data, isLoading: h.intelligence.isLoading }),
}));

const conversation: Conversation = {
  id: 'conv1',
  contact: {
    id: 'c1',
    name: 'Maria Silva',
    phone: '+5511999999999',
    tags: [],
    conversation_status: 'open',
  },
  unreadCount: 0,
  status: 'open',
  priority: 'low',
  tags: [],
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-05'),
};

const foundData = (): Intel => ({
  found: true,
  churn: { churn_probability: 82.4, risk_level: 'high', risk_factors: { dias_sem_contato: 45 }, recommended_actions: ['Ligar hoje'] },
  best_times: [{ day_of_week: 1, hour: 9, success_rate: 60 }],
});

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContactDetails conversation={conversation} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('ContactDetails — seção Inteligência comercial (12/10/2026)', () => {
  beforeAll(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  beforeEach(() => {
    localStorage.clear();
    h.intelligence.data = foundData();
    h.intelligence.isLoading = false;
  });

  it('o vendedor vê risco de churn e melhor horário dentro do painel do contato', () => {
    renderPanel();

    // A seção está registrada no estado aberto do acordeão (default de sidebarSections),
    // então o conteúdo já vem renderizado.
    expect(screen.getByTestId('sidebar-section-intelligence')).toBeInTheDocument();
    expect(screen.getByText('Inteligência comercial')).toBeInTheDocument();
    expect(screen.getByTestId('intelligence-churn')).toHaveTextContent('Alto · 82%');
    expect(screen.getByTestId('intelligence-best-times')).toHaveTextContent('9h');
  });

  it('sem ficha no CRM a seção continua lá, com estado vazio honesto', () => {
    h.intelligence.data = null;
    renderPanel();

    expect(screen.getByTestId('sidebar-section-intelligence')).toBeInTheDocument();
    expect(screen.getByTestId('intelligence-empty')).toHaveTextContent('Sem inteligência comercial para este contato.');
  });
});
