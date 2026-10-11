/**
 * ConversationDeliverySummary — paridade V3 (auditoria 11/10/2026, parte 1 do chat).
 * O componente REAL é montado; a prova é pela tela, não por mock do resumo.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Message } from '@/types/chat';
import { ConversationDeliverySummary } from '../ConversationDeliverySummary';

function msg(over: Partial<Message> = {}): Message {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    content: '',
    sender: 'agent',
    timestamp: new Date('2026-10-11T10:00:00.000Z'),
    type: 'text',
    created_at: '2026-10-11T10:00:00.000Z',
    status: 'sending',
    ...over,
  } as Message;
}

describe('ConversationDeliverySummary', () => {
  it('com tudo confirmado (ou sem mensagem) não renderiza nada', () => {
    const { container, rerender } = render(
      <ConversationDeliverySummary messages={[msg({ id: 'a', status: 'delivered' }), msg({ id: 'b', status: 'sent' })]} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('conversation-delivery-summary')).toBeNull();

    rerender(<ConversationDeliverySummary messages={[]} />);
    expect(screen.queryByTestId('conversation-delivery-summary')).toBeNull();
  });

  it('mostra só os chips com valor maior que zero', () => {
    render(
      <ConversationDeliverySummary
        messages={[
          msg({ id: 'q1', status: 'sending' }),
          msg({ id: 'q2', status: 'sending' }),
          msg({ id: 'f1', status: 'failed' }),
          msg({ id: 'f2', status: 'failed' }),
          msg({ id: 'f3', status: 'failed' }),
          msg({ id: 'ok', status: 'delivered' }),
          msg({ id: 'contato', sender: 'contact', status: 'failed' }),
        ]}
      />,
    );

    expect(screen.getByText('2 na fila')).toBeInTheDocument();
    expect(screen.getByText('3 com falha')).toBeInTheDocument();
    expect(screen.queryByText(/enviando/)).toBeNull();
    expect(screen.queryByText(/confirmada/)).toBeNull();
  });

  it('conta o envio em voo (claim registrado) como "enviando"', () => {
    render(
      <ConversationDeliverySummary
        messages={[
          msg({ id: 'voo', status: 'sending', delivery_claimed_at: '2026-10-11T10:00:05.000Z' }),
          msg({ id: 'ok', status: 'read' }),
        ]}
      />,
    );

    expect(screen.getByText('1 enviando')).toBeInTheDocument();
    expect(screen.queryByText(/na fila/)).toBeNull();
  });

  it('é uma região viva educada para o leitor de tela', () => {
    render(<ConversationDeliverySummary messages={[msg({ status: 'failed' })]} />);
    const regiao = screen.getByTestId('conversation-delivery-summary');
    expect(regiao).toHaveAttribute('aria-live', 'polite');
    expect(regiao).toHaveAttribute('role', 'status');
  });
});
