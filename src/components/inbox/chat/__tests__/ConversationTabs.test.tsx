import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationTabs } from '../ConversationTabs';
import type { ConversationTabCounts } from '@/hooks/chat/useConversationTabCounts';

const ZERO: ConversationTabCounts = { tasksOpen: 0, notesTotal: 0, filesTotal: 0 };

function setup(counts: ConversationTabCounts = ZERO, activeTab = 'chat' as const) {
  const onTabChange = vi.fn();
  render(<ConversationTabs activeTab={activeTab} onTabChange={onTabChange} counts={counts} />);
  return { onTabChange };
}

describe('ConversationTabs', () => {
  it('renderiza as 7 abas do painel central', () => {
    setup();
    ['chat', 'ia', 'crm', 'tasks', 'notes', 'files', 'history'].forEach((id) => {
      expect(screen.getByTestId(`conversation-tab-${id}`)).toBeInTheDocument();
    });
  });

  it('marca apenas a aba ativa com aria-selected', () => {
    setup();
    expect(screen.getByTestId('conversation-tab-chat')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('conversation-tab-notes')).toHaveAttribute('aria-selected', 'false');
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
});
