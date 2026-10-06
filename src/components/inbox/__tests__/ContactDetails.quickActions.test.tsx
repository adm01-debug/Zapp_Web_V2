import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ContactDetails } from '../ContactDetails';
import type { Conversation } from '@/types/chat';

const h = vi.hoisted(() => {
  const state = { error: null as { message: string } | null };
  const eq = vi.fn(() => Promise.resolve({ error: state.error }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  });
  return { state, eq, update, from, toast };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: h.from,
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
  },
}));
vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/hooks/crm/useContactEnrichedData', () => ({
  useContactEnrichedData: () => ({ enrichedData: null, aiTags: [], slaInfo: null }),
}));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    profileId: 'p1',
    isFavorite: () => false,
    favoriteContact: vi.fn(),
    unfavoriteContact: vi.fn(),
  }),
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

describe('ContactDetails — ações rápidas persistem (cartão #241)', () => {
  beforeAll(() => {
    // jsdom não implementa Element.scrollTo — ContactDetails rola o painel no mount.
    Element.prototype.scrollTo = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    h.state.error = null;
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

  it('"Bloquear" grava a tag Bloqueado e "Arquivar" grava conversation_status archived', async () => {
    render(<ContactDetails conversation={conversation} onClose={() => {}} />);
    openMais();
    fireEvent.click(screen.getByText('Bloquear'));
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ tags: ['Bloqueado'] }));

    openMais();
    fireEvent.click(screen.getByText('Arquivar'));
    await waitFor(() =>
      expect(h.update).toHaveBeenCalledWith({ conversation_status: 'archived' }),
    );
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
