import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationTabs } from '../ConversationTabs';
import type { ConversationTab } from '../ConversationTabs';
import type { ConversationTabCounts } from '@/hooks/chat/useConversationTabCounts';

const ZERO: ConversationTabCounts = { tasksOpen: 0, notesTotal: 0, filesTotal: 0 };

function setup(counts: ConversationTabCounts = ZERO, activeTab: ConversationTab = 'chat') {
  const onTabChange = vi.fn();
  render(<ConversationTabs activeTab={activeTab} onTabChange={onTabChange} counts={counts} />);
  return { onTabChange };
}

describe('ConversationTabs', () => {
  it('renderiza as 8 abas do painel central', () => {
    setup();
    ['chat', 'ia', 'crm', 'orders', 'tasks', 'notes', 'files', 'history'].forEach((id) => {
      expect(screen.getByTestId(`conversation-tab-${id}`)).toBeInTheDocument();
    });
  });

  it('exibe o badge de Pedidos via extraCounts (client-side, fora da RPC)', () => {
    const onTabChange = vi.fn();
    render(<ConversationTabs activeTab="chat" onTabChange={onTabChange} counts={ZERO} extraCounts={{ orders: 3 }} />);
    expect(screen.getByTestId('conversation-tab-count-orders')).toHaveTextContent('3');
  });

  it('omite o badge de Pedidos quando extraCounts.orders é 0 ou ausente', () => {
    setup();
    expect(screen.queryByTestId('conversation-tab-count-orders')).not.toBeInTheDocument();
  });

  it('marca apenas a aba ativa com aria-selected', () => {
    setup();
    expect(screen.getByTestId('conversation-tab-chat')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('conversation-tab-notes')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('conversation-tab-chat')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('conversation-tab-notes')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('conversation-tab-chat')).toHaveAttribute('aria-controls', 'conversation-tabpanel-chat');
  });

  it('dispara onTabChange com o id da aba clicada', () => {
    const { onTabChange } = setup();
    fireEvent.click(screen.getByTestId('conversation-tab-files'));
    expect(onTabChange).toHaveBeenCalledWith('files');
  });

  it('exibe badge só nas abas com count > 0', () => {
    setup({ tasksOpen: 2, notesTotal: 1, filesTotal: 5 });
    expect(screen.getByTestId('conversation-tab-count-tasks')).toHaveTextContent('2');
    expect(screen.getByTestId('conversation-tab-count-notes')).toHaveTextContent('1');
    expect(screen.getByTestId('conversation-tab-count-files')).toHaveTextContent('5');
  });

  it('omite o badge quando o count é zero', () => {
    setup(ZERO);
    expect(screen.queryByTestId('conversation-tab-count-tasks')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-tab-count-notes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-tab-count-files')).not.toBeInTheDocument();
  });

  it('Chat, IA, CRM e Histórico nunca renderizam badge', () => {
    setup({ tasksOpen: 9, notesTotal: 9, filesTotal: 9 });
    ['chat', 'ia', 'crm', 'history'].forEach((id) => {
      expect(screen.queryByTestId(`conversation-tab-count-${id}`)).not.toBeInTheDocument();
    });
  });

  it.each([
    ['ArrowRight', 'ia'],
    ['ArrowLeft', 'history'],
    ['End', 'history'],
  ] as const)('ativa e move o foco com %s', (key, expected) => {
    const { onTabChange } = setup();
    const chat = screen.getByTestId('conversation-tab-chat');
    chat.focus();

    fireEvent.keyDown(chat, { key });

    expect(onTabChange).toHaveBeenCalledWith(expected);
    expect(screen.getByTestId(`conversation-tab-${expected}`)).toHaveFocus();
  });

  it('Home ativa a primeira aba a partir de outra aba', () => {
    const { onTabChange } = setup(ZERO, 'files');
    const files = screen.getByTestId('conversation-tab-files');
    files.focus();

    fireEvent.keyDown(files, { key: 'Home' });

    expect(onTabChange).toHaveBeenCalledWith('chat');
    expect(screen.getByTestId('conversation-tab-chat')).toHaveFocus();
  });

  it('não intercepta teclas alheias ao padrão APG', () => {
    const { onTabChange } = setup();
    fireEvent.keyDown(screen.getByTestId('conversation-tab-chat'), { key: 'ArrowDown' });
    expect(onTabChange).not.toHaveBeenCalled();
  });
});
