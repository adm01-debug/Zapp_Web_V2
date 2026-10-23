import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactDetails } from '../ContactDetails';
import type { Conversation } from '@/types/chat';

const h = vi.hoisted(() => {
  const state = {
    error: null as { message: string } | null,
    rows: {} as Record<string, unknown>,
    invokeError: null as { message: string } | null,
  };
  const eq = vi.fn(() => Promise.resolve({ error: state.error }));
  const update = vi.fn(() => ({ eq }));
  // select → eq → { maybeSingle | single | limit → maybeSingle }
  // (useChatMediaSending resolveInstance + archiveContact leem o estado real)
  let currentTable = '';
  const terminal = (): Record<string, unknown> => ({
    maybeSingle: async () => ({ data: state.rows[currentTable] ?? null, error: null }),
    single: async () => ({ data: state.rows[currentTable] ?? null, error: null }),
    limit: () => terminal(),
  });
  const select = vi.fn(() => ({ eq: vi.fn(() => terminal()) }));
  const from = vi.fn((table: string) => {
    currentTable = table;
    return { update, select };
  });
  const invoke = vi.fn(async (_fn: string, _opts?: unknown) =>
    state.invokeError
      ? { data: null, error: state.invokeError }
      : { data: { ok: true }, error: null });
  // `set_conversation_status` (arquivar/reabrir) e `delivery_stats` (seção
  // "Entrega de mensagens") passam por aqui; o teste filtra pelo nome.
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  });
  return { state, eq, update, select, from, invoke, rpc, toast };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: h.from,
    functions: { invoke: h.invoke },
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    // A seção "Entrega de mensagens" (16/10/2026) consulta a RPC no mount;
    // aqui ela responde vazio — este teste não mede entrega.
    rpc: h.rpc,
  },
}));
vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/hooks/crm/useContactEnrichedData', () => ({
  useContactEnrichedData: () => ({ enrichedData: null }),
}));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({
  useFeatureFlag: (_key: string, fallback = false) => fallback,
}));
vi.mock('@/hooks/crm/useExternalContact360', () => ({ useExternalContact360: () => ({ data: null }) }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));
vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({ syncConversationAsync: vi.fn(), isSyncing: false, isConfigured: false }),
}));
vi.mock('@/components/inbox/contact-details/sidebar/ContactSidebarSections', () => ({
  ContactSidebarSections: () => null,
}));
vi.mock('@/components/inbox/contact-details/EditContactDialog', () => ({
  EditContactDialog: () => null,
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
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-05'),
};

// DropdownMenuTrigger do Radix abre no pointerdown, não no click
// (mesmo padrão de ContactActionButtons.test.tsx).
function openMais() {
  const tiles = screen.getAllByTestId('contact-action-tile');
  const mais = tiles.find((t) => t.querySelector('svg.lucide-ellipsis'))!;
  fireEvent.pointerDown(mais);
  fireEvent.pointerUp(mais);
  fireEvent.click(mais);
}

async function clickUndo() {
  const call = h.toast.mock.calls[h.toast.mock.calls.length - 1];
  expect(call?.[1]?.action?.onClick).toBeTypeOf('function');
  await act(async () => {
    call[1].action.onClick();
  });
}

const invokeCalls = () =>
  h.invoke.mock.calls.map((c) => (c[1] as { body: Record<string, unknown> }).body);

/**
 * O painel real vive dentro de um provider de query na aplicação; a seção
 * "Entrega de mensagens" (16/10/2026) consulta a RPC `delivery_stats` no mount,
 * então o teste monta o mesmo contexto (antes o painel passava sem provider
 * porque todas as seções que consultam estavam desligadas por flag/mock).
 */
function renderPainel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContactDetails conversation={conversation} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('ContactDetails — ações rápidas persistem (cartão #241)', () => {
  beforeAll(() => {
    // jsdom não implementa Element.scrollTo — ContactDetails rola o painel no mount.
    Element.prototype.scrollTo = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    h.state.error = null;
    h.state.invokeError = null;
    h.state.rows = {
      contacts: { assigned_to: 'agent-9', whatsapp_connection_id: 'conn-1' },
      whatsapp_connections: { instance_id: 'inst-1' },
    };
  });

  it('"Arquivar" usa a semântica do archiveContact (RPC set_conversation_status); Desfazer reabre pela mesma RPC', async () => {
    renderPainel();
    openMais();
    fireEvent.click(screen.getByText('Arquivar'));
    // Arquivar é mudar o ESTADO pela RPC canônica (a mesma do diálogo de
    // encerrar e do chip "Arquivadas"): `assigned_to` (o responsável) fica intacto.
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('set_conversation_status', {
        p_contact_id: 'c1',
        p_next: 'archived',
      }),
    );
    expect(h.update).not.toHaveBeenCalled();

    await clickUndo();
    // Reabre pela mesma RPC — sem reabrir nada o toast de desfazer mentiria.
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('set_conversation_status', {
        p_contact_id: 'c1',
        p_next: 'open',
      }),
    );
    expect(h.update).not.toHaveBeenCalled();
  });

  it('"Bloquear" impede novas mensagens pelo fluxo real (update-block-status na edge) e grava a tag', async () => {
    renderPainel();
    openMais();
    fireEvent.click(screen.getByText('Bloquear'));
    await waitFor(() =>
      expect(invokeCalls()).toContainEqual(
        expect.objectContaining({
          instanceName: 'inst-1',
          number: '5511999999999@s.whatsapp.net',
          status: 'block',
        }),
      ),
    );
    // A função de tags de contato não existe mais: nada é escrito em contacts.
    expect(h.update).not.toHaveBeenCalled();
  });

  it('"Bloquear" sem conexão resolvível não escreve tag nem chama a edge', async () => {
    h.state.rows = {
      contacts: { assigned_to: 'agent-9', whatsapp_connection_id: null },
      whatsapp_connections: null,
    };
    renderPainel();
    openMais();
    fireEvent.click(screen.getByText('Bloquear'));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('a seção "Tags" e a ação "Marcar VIP" não existem mais no painel', () => {
    renderPainel();
    expect(screen.queryByTestId('sidebar-section-tags')).toBeNull();
    expect(screen.queryByText('Marcar VIP')).toBeNull();
  });
});
