import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  });
  return { state, eq, update, select, from, invoke, toast };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: h.from,
    functions: { invoke: h.invoke },
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
  },
}));
vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/hooks/crm/useContactEnrichedData', () => ({
  useContactEnrichedData: () => ({ enrichedData: null, aiTags: [], slaInfo: null }),
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
  tags: [],
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

/** O selo VIP do cabeçalho é o Badge com ícone Crown — o chip da seção Tags
 *  também mostra o texto "VIP", então o selo se distingue pelo lucide-crown. */
const seloVip = () =>
  screen.queryAllByText('VIP').find((el) => el.parentElement?.querySelector('svg.lucide-crown'));

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

  it('"Marcar VIP" grava a tag VIP em contacts.tags; Desfazer remove de verdade', async () => {
    render(<ContactDetails conversation={conversation} onClose={() => {}} />);
    openMais();
    fireEvent.click(screen.getByText('Marcar VIP'));
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ tags: ['VIP'] }));
    expect(h.from).toHaveBeenCalledWith('contacts');
    expect(h.eq).toHaveBeenCalledWith('id', 'c1');

    await clickUndo();
    await waitFor(() => expect(h.update).toHaveBeenLastCalledWith({ tags: [] }));
  });

  it('o selo VIP do cabeçalho lê a mesma fonte que o botão grava (contacts.tags)', async () => {
    render(<ContactDetails conversation={conversation} onClose={() => {}} />);
    expect(seloVip()).toBeUndefined();
    openMais();
    fireEvent.click(screen.getByText('Marcar VIP'));
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ tags: ['VIP'] }));
    // O selo acompanha a escrita do botão sem recarregar a tela.
    await waitFor(() => expect(seloVip()).toBeTruthy());
  });

  it('o selo VIP persiste após recarregar o detalhe (tag "vip" em outra caixa vem do banco)', async () => {
    const recarregada: Conversation = {
      ...conversation,
      contact: { ...conversation.contact, tags: ['vip'] },
    };
    render(<ContactDetails conversation={recarregada} onClose={() => {}} />);
    expect(seloVip()).toBeTruthy();
  });

  it('"Arquivar" usa a semântica do archiveContact (assigned_to: null); Desfazer restaura o valor anterior real', async () => {
    render(<ContactDetails conversation={conversation} onClose={() => {}} />);
    openMais();
    fireEvent.click(screen.getByText('Arquivar'));
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ assigned_to: null }));
    // A segunda implementação paralela está proibida: nunca escreve status.
    expect(h.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ conversation_status: expect.anything() }),
    );

    await clickUndo();
    // Restaura o assigned_to lido antes da escrita — não força 'open'.
    await waitFor(() =>
      expect(h.update).toHaveBeenLastCalledWith({ assigned_to: 'agent-9' }),
    );
    expect(h.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ conversation_status: expect.anything() }),
    );
  });

  it('"Bloquear" impede novas mensagens pelo fluxo real (update-block-status na edge) e grava a tag', async () => {
    render(<ContactDetails conversation={conversation} onClose={() => {}} />);
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
    await waitFor(() =>
      expect(h.update).toHaveBeenCalledWith({ tags: ['Bloqueado'] }),
    );
  });

  it('"Bloquear" sem conexão resolvível não escreve tag nem chama a edge', async () => {
    h.state.rows = {
      contacts: { assigned_to: 'agent-9', whatsapp_connection_id: null },
      whatsapp_connections: null,
    };
    render(<ContactDetails conversation={conversation} onClose={() => {}} />);
    openMais();
    fireEvent.click(screen.getByText('Bloquear'));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('erro do banco vira toast.error e nenhum Desfazer é oferecido', async () => {
    h.state.error = { message: 'row-level security' };
    render(<ContactDetails conversation={conversation} onClose={() => {}} />);
    openMais();
    fireEvent.click(screen.getByText('Marcar VIP'));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('a seção "Tags" voltou ao painel de detalhes', () => {
    render(<ContactDetails conversation={conversation} onClose={() => {}} />);
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });
});
