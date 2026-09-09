import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConversationTabContent } from '../ConversationTabContent';
import type { Conversation, Message } from '@/types/chat';

vi.mock('../../tabs/Crm360Tab', () => ({
  Crm360Tab: () => <div>Conteúdo CRM</div>,
}));

const conversation = {
  id: 'conversation-1',
  contact: { id: 'contact-1', name: 'Contato', phone: '5511999999999' },
} as Conversation;

describe('ConversationTabContent', () => {
  it('associa a aba Chat ao seu painel e mantém o conteúdo montado', () => {
    const { container, rerender } = render(
      <ConversationTabContent
        activeTab="chat"
        onTabChange={vi.fn()}
        conversation={conversation}
        messages={[] as Message[]}
      >
        <div>Conteúdo Chat</div>
      </ConversationTabContent>,
    );

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', 'conversation-tabpanel-chat');
    expect(panel).toHaveAttribute('aria-labelledby', 'conversation-tab-chat');
    expect(panel).toHaveAttribute('tabindex', '0');
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(8);
    for (const tab of ['chat', 'ia', 'crm', 'orders', 'tasks', 'notes', 'files', 'history']) {
      expect(container.querySelector(`#conversation-tabpanel-${tab}`)).toHaveAttribute(
        'aria-labelledby',
        `conversation-tab-${tab}`,
      );
    }

    rerender(
      <ConversationTabContent
        activeTab="crm"
        onTabChange={vi.fn()}
        conversation={conversation}
        messages={[] as Message[]}
      >
        <div>Conteúdo Chat</div>
      </ConversationTabContent>,
    );

    const chatPanel = container.querySelector('#conversation-tabpanel-chat');
    expect(chatPanel).toHaveAttribute('hidden');
    expect(chatPanel).toHaveTextContent('Conteúdo Chat');
  });

  it('expõe o painel lazy ativo com relacionamento APG e padding de 20px', async () => {
    render(
      <ConversationTabContent
        activeTab="crm"
        onTabChange={vi.fn()}
        conversation={conversation}
        messages={[] as Message[]}
      >
        <div>Conteúdo Chat</div>
      </ConversationTabContent>,
    );

    expect(await screen.findByText('Conteúdo CRM')).toBeInTheDocument();
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', 'conversation-tabpanel-crm');
    expect(panel).toHaveAttribute('aria-labelledby', 'conversation-tab-crm');
    expect(panel).toHaveClass('p-5');
  });
});
