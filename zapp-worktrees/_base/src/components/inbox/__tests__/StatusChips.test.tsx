import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusChips } from '../conversation-list/StatusChips';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

// R2-INB-056 (#349): o usuário logado tem DOIS ids distintos — o do auth
// (auth.users.id, exposto em `user`) e o do perfil (public.profiles.id, alvo
// da FK contacts.assigned_to). O mock dá valores DIFERENTES aos dois, como no
// runtime: um mock com o mesmo valor nos dois papéis esconderia o defeito do
// contador comparando o id errado (auth id no lugar do profile id).
const AUTH_USER_ID = 'auth-user-1';
const CURRENT_PROFILE_ID = 'perfil-atual-1';
const OTHER_PROFILE_ID = 'perfil-colega-2';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: AUTH_USER_ID }, profile: { id: CURRENT_PROFILE_ID } }),
}));

function makeConversation(overrides: Partial<ConversationWithMessages['contact']> & { hasMessages?: boolean; unreadCount?: number }): ConversationWithMessages {
  const { hasMessages = true, unreadCount = 0, ...contactOverrides } = overrides;
  return {
    contact: {
      id: contactOverrides.id ?? 'c1',
      assigned_to: null,
      ...contactOverrides,
    } as ConversationWithMessages['contact'],
    messages: hasMessages ? [{ id: 'm1' } as never] : [],
    unreadCount,
    lastMessage: null,
  };
}

describe('StatusChips', () => {
  const conversations: ConversationWithMessages[] = [
    makeConversation({ id: 'c1', assigned_to: CURRENT_PROFILE_ID, unreadCount: 2 }),
    makeConversation({ id: 'c2', assigned_to: OTHER_PROFILE_ID }),
    makeConversation({ id: 'c3', assigned_to: null }),
    makeConversation({ id: 'c4', hasMessages: false }),
  ];

  it('renders the 5 chips (no Spam — não existe no modelo)', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-all')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-unread')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-attending')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-waiting')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-resolved')).toBeInTheDocument();
    expect(screen.queryByTestId('status-chip-spam')).not.toBeInTheDocument();
  });

  it('maps "Todas" to open conversations count', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-all')).toHaveTextContent('3');
  });

  it('maps "Não lidas" to conversations with unreadCount > 0', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-unread')).toHaveTextContent('1');
  });

  it('conta "Em atendimento" pelo profile.id logado, não pelo auth id (#349)', () => {
    // c1 está atribuída ao profile do usuário logado; c2 está com o perfil de
    // um colega e c3 não tem responsável. Comparando com o auth id — que não é
    // um profile id válido — o contador zeraria mesmo com a conversa atribuída
    // ao próprio usuário.
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-attending').querySelector('span')?.textContent).toBe('1');
  });

  it('maps "Aguardando" to unassigned open conversations', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-waiting')).toHaveTextContent('1');
  });

  it('maps "Resolvidas" to conversations with no messages', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-resolved')).toHaveTextContent('1');
  });

  it('calls onChipTabChange with the clicked chip id', () => {
    const onChipTabChange = vi.fn();
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={onChipTabChange} />);
    fireEvent.click(screen.getByTestId('status-chip-resolved'));
    expect(onChipTabChange).toHaveBeenCalledWith('resolved');
  });
});
