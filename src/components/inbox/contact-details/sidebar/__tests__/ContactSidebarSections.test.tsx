import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Accordion } from '@/components/ui/accordion';
import { ContactSidebarSections } from '../ContactSidebarSections';
import type { ConversationContact as Contact } from '@/types/chat';
import type { ContactSidebarStatus, ContactSidebarData } from '@/types/contactSidebar';

const hookResult = {
  status: 'ok' as ContactSidebarStatus,
  data: null as ContactSidebarData | null | undefined,
  error: null as Error | null,
  refetch: vi.fn(),
};

vi.mock('@/hooks/crm/useContactSidebar', () => ({
  useContactSidebar: () => hookResult,
}));

vi.mock('@/components/contacts/ContactCRMDialog', () => ({
  ContactCRMDialog: () => null,
}));

vi.mock('@/services/contact.service', () => ({
  ContactService: { getById: vi.fn(async () => ({ data: null })) },
}));

// A seção "Linha do tempo de SLA" mora aqui; o hook de dados é o único mock
// (lista vazia) — o filtro e a memória da seção têm prova própria.
vi.mock('@/hooks/sla/useContactSlaTimeline', () => ({
  contactSlaTimelineKey: (contactId: string | null | undefined) => ['contact-sla-timeline', contactId],
  useContactSlaTimeline: () => ({ milestones: [], incomplete: false, limitsReady: true, loading: false }),
}));

const contact = { id: 'contact-1', name: 'João Silva', phone: '+55 11 99999-0000' } as Contact;

beforeEach(() => {
  hookResult.status = 'ok';
  hookResult.data = null;
  hookResult.refetch = vi.fn();
});

function renderSections() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Accordion type="multiple" defaultValue={['professional', 'personal', 'singu']}>
        <ContactSidebarSections contact={contact} enrichedData={null} onQuickAction={vi.fn()} />
      </Accordion>
    </QueryClientProvider>,
  );
}

describe('ContactSidebarSections (etapa 48)', () => {
  it('status ok renderiza as 3 seções com data-testid', () => {
    renderSections();
    expect(screen.getByTestId('sidebar-section-professional')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-personal')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-singu')).toBeInTheDocument();
  });

  it('a seção "Linha do tempo de SLA" aparece no painel (nasce recolhida)', () => {
    renderSections();
    const secao = screen.getByTestId('sidebar-section-sla-timeline');
    expect(secao).toBeInTheDocument();
    expect(secao).toHaveAttribute('data-state', 'closed');
    expect(screen.getByText('Linha do tempo de SLA')).toBeInTheDocument();
  });

  it('status disabled renderiza as 3 seções em estado desligado', () => {
    hookResult.status = 'disabled';
    renderSections();
    expect(screen.getByTestId('sidebar-section-professional')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-personal')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-singu')).toBeInTheDocument();
    expect(screen.getAllByText('Integração com o Singu desligada').length).toBeGreaterThanOrEqual(1);
  });
});
