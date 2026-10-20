import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusChips } from '../conversation-list/StatusChips';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
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
    makeConversation({ id: 'c1', assigned_to: 'user-1', unreadCount: 2 }),
    makeConversation({ id: 'c2', assigned_to: null }),
    makeConversation({ id: 'c3', hasMessages: false }),
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
    expect(screen.getByTestId('status-chip-all')).toHaveTextContent('2');
  });

  it('maps "Não lidas" to conversations with unreadCount > 0', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-unread')).toHaveTextContent('1');
  });

  it('maps "Em atendimento" to conversations assigned to the current user', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-attending')).toHaveTextContent('1');
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
