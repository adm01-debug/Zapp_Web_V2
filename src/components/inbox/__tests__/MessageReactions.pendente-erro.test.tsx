import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageReactions } from '@/components/inbox/MessageReactions';

const hookState = {
  reactions: [{ emoji: '👍', count: 1, hasCurrentUser: false }],
  addReaction: vi.fn(async () => undefined),
  removeReaction: vi.fn(async () => undefined),
  hasReacted: vi.fn(() => false),
  isReacting: false,
  currentProfileId: 'profile-1',
};

vi.mock('@/hooks/chat/useMessageReactions', () => ({
  useMessageReactions: () => hookState,
}));

beforeEach(() => {
  hookState.isReacting = false;
  hookState.addReaction = vi.fn(async () => undefined);
  hookState.removeReaction = vi.fn(async () => undefined);
  hookState.hasReacted = vi.fn(() => false);
});

describe('MessageReactions — pendente e erro', () => {
  it('mostra o estado pendente enquanto a reação é enviada', () => {
    hookState.isReacting = true;
    render(<MessageReactions messageId="m1" />);

    const container = screen.getByTestId('message-reactions');
    expect(container).toHaveAttribute('data-pending', 'true');
    expect(container).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('reaction-add-button')).toBeDisabled();
    expect(screen.getByTestId('reaction-badge')).toBeDisabled();
  });

  it('trata a promessa rejeitada do envio sem derrubar o componente', async () => {
    hookState.addReaction = vi.fn(() => Promise.reject(new Error('falha no envio')));
    render(<MessageReactions messageId="m1" />);

    fireEvent.click(screen.getByTestId('reaction-badge'));

    await waitFor(() => expect(hookState.addReaction).toHaveBeenCalledWith('👍'));
    // Sem try/catch no handleReact isto viraria promessa solta e o teste falharia.
    expect(screen.getByTestId('message-reactions')).toBeInTheDocument();
  });
});
