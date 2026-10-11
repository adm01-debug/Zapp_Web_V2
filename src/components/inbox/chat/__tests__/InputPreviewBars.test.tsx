import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InputPreviewBars } from '../InputPreviewBars';
import { Message } from '@/types/chat';

function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    sender: 'contact',
    content: '',
    timestamp: new Date('2026-10-11T10:00:00Z'),
    status: 'delivered',
    type: 'text',
    ...overrides,
  } as Message;
}

const CONTACT_MESSAGE = makeMsg({ id: 'm1', content: 'Mensagem original do contato' });

describe('InputPreviewBars — barras de edição e resposta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a barra de edição mostra "Modo de edição", o texto original e cancela pelo rótulo', () => {
    const onCancelEdit = vi.fn();
    render(
      <InputPreviewBars
        replyToMessage={null}
        editingMessage={CONTACT_MESSAGE}
        onCancelReply={vi.fn()}
        onCancelEdit={onCancelEdit}
      />,
    );

    expect(screen.getByText('Modo de edição')).toBeInTheDocument();
    expect(screen.getByText('Mensagem original do contato')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Cancelar edição'));

    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it('a barra de resposta tem o rótulo "Cancelar resposta" e cancela a resposta', () => {
    const onCancelReply = vi.fn();
    render(
      <InputPreviewBars
        replyToMessage={CONTACT_MESSAGE}
        editingMessage={null}
        onCancelReply={onCancelReply}
      />,
    );

    expect(screen.getByText(/Respondendo a/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Cancelar resposta'));

    expect(onCancelReply).toHaveBeenCalledTimes(1);
  });

  it('enquanto edita, a barra de resposta não aparece', () => {
    render(
      <InputPreviewBars
        replyToMessage={CONTACT_MESSAGE}
        editingMessage={CONTACT_MESSAGE}
        onCancelReply={vi.fn()}
        onCancelEdit={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Cancelar resposta')).not.toBeInTheDocument();
    expect(screen.getByText('Modo de edição')).toBeInTheDocument();
  });

  it('sem resposta e sem edição não renderiza barra nenhuma', () => {
    render(
      <InputPreviewBars
        replyToMessage={null}
        editingMessage={null}
        onCancelReply={vi.fn()}
      />,
    );

    expect(screen.queryByText('Modo de edição')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cancelar resposta')).not.toBeInTheDocument();
  });
});
