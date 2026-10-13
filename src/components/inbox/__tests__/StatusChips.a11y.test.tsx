import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusChips } from '../conversation-list/StatusChips';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

// Cartão t_bd1c2989 (pedido original t_90dcdcc8, item 4): os chips de filtro
// funcionam como seleção única (Todas/Não lidas/etc) mas não anunciavam
// papel/estado ao leitor de tela. Padrão copiado de TeamConversationList.tsx
// (role="tablist" no grupo + role="tab"/aria-selected em cada botão).

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'auth-user-1' }, profile: { id: 'perfil-atual-1' } }),
}));

function makeConversation(id: string): ConversationWithMessages {
  return {
    contact: { id, assigned_to: null } as ConversationWithMessages['contact'],
    messages: [{ id: `m-${id}` } as never],
    unreadCount: 0,
    lastMessage: null,
  };
}

const conversations: ConversationWithMessages[] = [makeConversation('c1'), makeConversation('c2')];

const TODOS_OS_CHIPS = ['all', 'unread', 'attending', 'waiting', 'resolved', 'archived'];

describe('StatusChips — nome/papel acessível (t_bd1c2989)', () => {
  it('o grupo de filtros é um tablist nomeado', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    const tablist = screen.getByRole('tablist', { name: 'Filtros de conversa' });
    expect(tablist).toBeInTheDocument();
    expect(tablist).toBe(screen.getByTestId('status-chips'));
  });

  it('cada chip é um tab e só o ativo fica aria-selected', () => {
    render(<StatusChips conversations={conversations} chipTab="unread" onChipTabChange={() => {}} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(TODOS_OS_CHIPS.length);

    expect(screen.getByTestId('status-chip-unread')).toHaveAttribute('aria-selected', 'true');
    for (const id of TODOS_OS_CHIPS.filter((t) => t !== 'unread')) {
      expect(screen.getByTestId(`status-chip-${id}`)).toHaveAttribute('aria-selected', 'false');
    }
  });
});
