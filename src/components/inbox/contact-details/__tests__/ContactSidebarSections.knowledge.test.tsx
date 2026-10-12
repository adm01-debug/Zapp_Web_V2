import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Accordion } from '@/components/ui/accordion';
import { ContactSidebarSections } from '../sidebar/ContactSidebarSections';
import { registerComposerInsert } from '../composerInsert';
import type { ConversationContact as Contact } from '@/types/chat';
import type { ContactSidebarStatus, ContactSidebarData } from '@/types/contactSidebar';

/**
 * Ligação do painel "Base de Conhecimento" dentro do sidebar de detalhes do
 * contato: a seção nova existe, e "Inserir no texto" chega ao compositor pela
 * ponte — sem enviar nada.
 */

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn() },
}));

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

const contacto = { id: 'contact-1', name: 'João Silva', phone: '+55 11 99999-0000' } as Contact;

const ARTIGO = {
  id: 'art-1',
  title: 'Contrato de serviço',
  content: 'O contrato de serviço é enviado por e-mail depois da assinatura.',
  category: 'Comercial',
  tags: [],
  rank: 0.9,
};

beforeEach(() => {
  vi.clearAllMocks();
  hookResult.status = 'ok';
  hookResult.data = null;
  hookResult.refetch = vi.fn();
  mocks.rpc.mockResolvedValue({ data: [ARTIGO], error: null });
});

afterEach(() => {
  registerComposerInsert(null);
});

function renderSections() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Accordion type="multiple" defaultValue={['professional', 'personal', 'singu', 'knowledge']}>
        <ContactSidebarSections contact={contacto} enrichedData={null} onQuickAction={vi.fn()} />
      </Accordion>
    </QueryClientProvider>,
  );
}

describe('ContactSidebarSections — seção Base de Conhecimento', () => {
  it('renderiza a seção nova junto das três de sempre', () => {
    renderSections();

    expect(screen.getByTestId('sidebar-section-professional')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-personal')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-singu')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-knowledge')).toBeInTheDocument();
    expect(screen.getByTestId('kb-painel')).toBeInTheDocument();
  });

  it('Inserir no texto entrega o artigo ao compositor registrado', async () => {
    const escrever = vi.fn();
    registerComposerInsert(escrever);
    renderSections();

    fireEvent.change(screen.getByLabelText('Buscar na base de conhecimento'), {
      target: { value: 'contrato' },
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });

    fireEvent.click(await screen.findByRole('button', { name: 'Inserir no texto: Contrato de serviço' }));

    expect(escrever).toHaveBeenCalledWith('O contrato de serviço é enviado por e-mail depois da assinatura.');
    // O painel só pede a inserção: nenhuma mensagem sai por aqui.
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('search_knowledge_base', {
      search_query: 'contrato',
      max_results: 5,
    });
  });
});
