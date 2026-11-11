import { act, render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

let conversas: Array<{ id: string; name: string }> = [];
vi.mock('@/hooks/chat/useTeamChat', () => ({
  useTeamConversations: () => ({ data: conversas, isLoading: false }),
}));
vi.mock('@/hooks/chat/useTeamChatNotifications', () => ({
  useActiveTeamChatConversation: () => undefined,
}));
vi.mock('../TeamConversationList', () => ({
  TeamConversationList: ({ conversations, onSelect }: { conversations: Array<{ id: string }>; onSelect: (id: string) => void }) => (
    <div>
      {conversations.map((c) => (
        <button key={c.id} onClick={() => onSelect(c.id)}>{`abrir-${c.id}`}</button>
      ))}
    </div>
  ),
}));
vi.mock('../TeamChatPanel', () => ({
  TeamChatPanel: ({ conversation }: { conversation: { id: string } }) => <div data-testid="painel">{conversation.id}</div>,
}));
vi.mock('../TeamMemberDetails', () => ({ TeamMemberDetails: () => null }));
vi.mock('../NewConversationDialog', () => ({ NewConversationDialog: () => null }));

import { TeamChatView } from '../TeamChatView';

describe('TeamChatView — deep-link ?cid=', () => {
  beforeEach(() => {
    conversas = [{ id: A, name: 'A' }, { id: B, name: 'B' }];
    window.history.replaceState({}, '', '/');
  });

  it('seleciona a conversa do ?cid= e remove o parâmetro da URL', () => {
    window.history.replaceState({}, '', `/?view=team-chat&cid=${A}`);
    render(<TeamChatView />);
    expect(screen.getByTestId('painel').textContent).toBe(A);
    expect(new URLSearchParams(window.location.search).get('cid')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('view')).toBe('team-chat');
  });

  it('recarga da lista não desfaz a conversa que o usuário escolheu depois', () => {
    window.history.replaceState({}, '', `/?view=team-chat&cid=${A}`);
    const { rerender } = render(<TeamChatView />);
    fireEvent.click(screen.getByText(`abrir-${B}`));
    expect(screen.getByTestId('painel').textContent).toBe(B);

    conversas = [...conversas]; // nova referência, como no refetch do realtime
    rerender(<TeamChatView />);
    expect(screen.getByTestId('painel').textContent).toBe(B);
  });

  it('nova notificação com a tela aberta troca para a conversa do novo ?cid=', () => {
    render(<TeamChatView />);
    act(() => {
      window.history.pushState({}, '', `/?view=team-chat&cid=${B}`);
      window.dispatchEvent(new CustomEvent('zapp:navigate', { detail: { view: 'team-chat' } }));
    });
    expect(screen.getByTestId('painel').textContent).toBe(B);
    expect(new URLSearchParams(window.location.search).get('cid')).toBeNull();
  });

  it('cid que não pertence ao usuário é ignorado e sai da URL', () => {
    window.history.replaceState({}, '', '/?view=team-chat&cid=33333333-3333-4333-8333-333333333333');
    render(<TeamChatView />);
    expect(screen.queryByTestId('painel')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('cid')).toBeNull();
  });
});
