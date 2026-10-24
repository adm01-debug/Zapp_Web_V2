/**
 * E90 (receptor) — `TeamChatView` lê `cid` da URL (`?view=team-chat&cid=<id>`)
 * e seleciona a conversa correspondente.
 *
 * Escopo proposital: só o lado receptor. O disparo da notificação
 * (`useTeamChatNotifications`) NÃO é tocado por este teste.
 */
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATIONS = [
  {
    id: 'conv-1',
    type: 'direct',
    name: 'Alice',
    avatar_url: null,
    created_by: null,
    created_at: '2026-10-21T00:00:00Z',
    updated_at: '2026-10-21T00:00:00Z',
  },
  {
    id: 'conv-2',
    type: 'group',
    name: 'Suporte',
    avatar_url: null,
    created_by: null,
    created_at: '2026-10-21T00:00:00Z',
    updated_at: '2026-10-21T00:00:00Z',
  },
];

vi.mock('@/hooks/chat/useTeamChat', () => ({
  useTeamConversations: () => ({ data: CONVERSATIONS, isLoading: false }),
}));

vi.mock('@/hooks/chat/useTeamChatNotifications', () => ({
  useActiveTeamChatConversation: vi.fn(),
}));

vi.mock('../TeamConversationList', () => ({
  TeamConversationList: ({ selectedId }: { selectedId: string | null }) => (
    <div data-testid="team-list" data-selected={selectedId ?? ''} />
  ),
}));

vi.mock('../TeamChatPanel', () => ({
  TeamChatPanel: ({ conversation }: { conversation: { id: string } }) => (
    <div data-testid="team-panel" data-conversation={conversation.id} />
  ),
}));

vi.mock('../TeamMemberDetails', () => ({
  TeamMemberDetails: () => <div data-testid="team-details" />,
}));

vi.mock('../NewConversationDialog', () => ({
  NewConversationDialog: () => <div data-testid="team-dialog" />,
}));

import { TeamChatView } from '../TeamChatView';

function vaiPara(url: string) {
  window.history.replaceState(null, '', url);
}

beforeEach(() => {
  vaiPara('/');
});

describe('TeamChatView — receptor de cid da URL (E90)', () => {
  it('seleciona a conversa do `?cid=` ao montar', () => {
    vaiPara('/?view=team-chat&cid=conv-2');
    render(<TeamChatView />);

    expect(screen.getByTestId('team-panel')).toHaveAttribute('data-conversation', 'conv-2');
    expect(screen.getByTestId('team-list')).toHaveAttribute('data-selected', 'conv-2');
  });

  it('ignora `cid` inexistente e mantém o estado vazio', () => {
    vaiPara('/?view=team-chat&cid=nao-existe');
    render(<TeamChatView />);

    expect(screen.queryByTestId('team-panel')).toBeNull();
    expect(screen.getByTestId('conversation-empty-state')).toBeInTheDocument();
  });

  it('sem `cid` mantém o estado vazio', () => {
    vaiPara('/?view=team-chat');
    render(<TeamChatView />);

    expect(screen.queryByTestId('team-panel')).toBeNull();
    expect(screen.getByTestId('conversation-empty-state')).toBeInTheDocument();
  });

  it('reage a navegação sem remontar (clique na notificação com a tela aberta)', () => {
    vaiPara('/?view=team-chat&cid=conv-1');
    render(<TeamChatView />);
    expect(screen.getByTestId('team-panel')).toHaveAttribute('data-conversation', 'conv-1');

    act(() => {
      vaiPara('/?view=team-chat&cid=conv-2');
      window.dispatchEvent(new CustomEvent('zapp:navigate', { detail: { view: 'team-chat' } }));
    });

    expect(screen.getByTestId('team-panel')).toHaveAttribute('data-conversation', 'conv-2');
  });
});
