/**
 * Navegação por teclado e associação aba ↔ painel da barra "Seções da conversa".
 *
 * Complementa `ConversationTabs.test.tsx` (ordem e contadores): o contrato aqui é o
 * roving tabindex, as setas e o `aria-controls` que resolve para um painel existente.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationTabs, type ConversationTab } from '../ConversationTabs';
import { ConversationTabContent } from '../ConversationTabContent';
import type { ConversationTabCounts } from '@/hooks/chat/useConversationTabCounts';
import type { Conversation } from '@/types/chat';

const ZERO: ConversationTabCounts = { tasksOpen: 0, notesTotal: 0, filesTotal: 0 };

const TODAS: ConversationTab[] = ['chat', 'files', 'ia', 'crm', 'orders', 'history', 'tasks', 'notes'];

function setup(activeTab: ConversationTab = 'chat') {
  const onTabChange = vi.fn();
  render(<ConversationTabs activeTab={activeTab} onTabChange={onTabChange} counts={ZERO} />);
  return { onTabChange };
}

describe('ConversationTabs — roving tabindex', () => {
  it('só a aba ativa entra na sequência de Tab', () => {
    setup('crm');
    expect(screen.getByTestId('conversation-tab-crm')).toHaveAttribute('tabindex', '0');
    for (const id of TODAS.filter((t) => t !== 'crm')) {
      expect(screen.getByTestId(`conversation-tab-${id}`)).toHaveAttribute('tabindex', '-1');
    }
  });

  it('a aba ativa aponta para o próprio painel e as inativas não prometem painel inexistente', () => {
    setup('tasks');
    const ativa = screen.getByTestId('conversation-tab-tasks');
    expect(ativa).toHaveAttribute('id', 'conversation-tab-tasks');
    expect(ativa).toHaveAttribute('aria-controls', 'conversation-panel-tasks');
    expect(screen.getByTestId('conversation-tab-notes')).not.toHaveAttribute('aria-controls');
  });

  it('ArrowRight seleciona a aba seguinte e leva o foco junto', () => {
    const { onTabChange } = setup('chat');
    fireEvent.keyDown(screen.getByTestId('conversation-tab-chat'), { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenCalledWith('files');
    expect(document.activeElement).toBe(screen.getByTestId('conversation-tab-files'));
  });

  it('ArrowLeft na primeira aba dá a volta para a última', () => {
    const { onTabChange } = setup('chat');
    fireEvent.keyDown(screen.getByTestId('conversation-tab-chat'), { key: 'ArrowLeft' });
    expect(onTabChange).toHaveBeenCalledWith('notes');
  });

  it('Home vai para a primeira e End para a última', () => {
    const { onTabChange } = setup('orders');
    const orders = screen.getByTestId('conversation-tab-orders');
    fireEvent.keyDown(orders, { key: 'Home' });
    expect(onTabChange).toHaveBeenLastCalledWith('chat');
    fireEvent.keyDown(orders, { key: 'End' });
    expect(onTabChange).toHaveBeenLastCalledWith('notes');
  });

  it('tecla sem função na barra não muda a seleção', () => {
    const { onTabChange } = setup('chat');
    fireEvent.keyDown(screen.getByTestId('conversation-tab-chat'), { key: 'ArrowUp' });
    expect(onTabChange).not.toHaveBeenCalled();
  });
});

describe('ConversationTabContent — painel do Chat é o tabpanel da primeira aba', () => {
  it('o conteúdo do Chat declara role=tabpanel com id e rótulo amarrados à aba', () => {
    const conversa = {
      id: 'conv-1',
      contact: { id: 'contato-1', name: 'Contato de teste' },
    } as unknown as Conversation;

    render(
      <ConversationTabContent
        activeTab="chat"
        onTabChange={vi.fn()}
        conversation={conversa}
        messages={[]}
      >
        <div data-testid="conteudo-chat" />
      </ConversationTabContent>,
    );

    const painel = screen.getByRole('tabpanel');
    expect(painel).toHaveAttribute('id', 'conversation-panel-chat');
    expect(painel).toHaveAttribute('aria-labelledby', 'conversation-tab-chat');
    expect(screen.getByTestId('conteudo-chat')).toBeInTheDocument();
  });
});
