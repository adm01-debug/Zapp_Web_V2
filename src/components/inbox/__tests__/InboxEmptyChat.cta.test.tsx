/**
 * InboxEmptyChat — tela de boas-vindas quando nenhuma conversa está selecionada.
 *
 * O componente foi reescrito no PR #1986: as props onNewConversation/waitingCount/
 * unreadCount foram removidas e o componente agora renderiza ConversationEmptyState
 * com atalhos de teclado obtidos via useCustomShortcuts (sem props externas).
 *
 * Estes testes verificam a UI ATUAL do componente.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InboxEmptyChat } from '../InboxEmptyChat';

// useCustomShortcuts depende de store global — mockamos para isolar o componente.
vi.mock('@/hooks/useCustomShortcuts', () => ({
  useCustomShortcuts: () => ({
    shortcuts: [],
    formatShortcut: vi.fn(() => ''),
  }),
}));

describe('InboxEmptyChat — UI atual (pós PR #1986)', () => {
  it('renderiza o estado vazio da conversa', () => {
    render(<InboxEmptyChat />);

    expect(
      screen.getByTestId('conversation-empty-state'),
    ).toBeInTheDocument();
  });

  it('exibe o título "Selecione uma conversa"', () => {
    render(<InboxEmptyChat />);

    expect(
      screen.getByText('Selecione uma conversa'),
    ).toBeInTheDocument();
  });

  it('exibe a descrição orientando o usuário', () => {
    render(<InboxEmptyChat />);

    expect(
      screen.getByText(/Escolha uma conversa na lista ao lado/),
    ).toBeInTheDocument();
  });

  it('não aceita props externas — componente sem props', () => {
    // O componente é renderizado sem props e não deve lançar erros.
    expect(() => render(<InboxEmptyChat />)).not.toThrow();
  });

  it('não exibe seção de atalhos quando a lista de atalhos está vazia', () => {
    // useCustomShortcuts mockado retorna shortcuts=[]; logo nenhum atalho
    // corresponde a INBOX_EMPTY_SHORTCUT_IDS e inbox-empty-shortcuts não é renderizado.
    render(<InboxEmptyChat />);

    expect(
      screen.queryByTestId('inbox-empty-shortcuts'),
    ).not.toBeInTheDocument();
  });
});
