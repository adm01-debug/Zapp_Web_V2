/**
 * SendErrorBanner — paridade V3 (auditoria 11/10/2026, parte 1 do chat).
 * O componente REAL é montado; nada de mock do resumo.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types/chat';
import { SendErrorBanner } from '../SendErrorBanner';

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

describe('SendErrorBanner', () => {
  it('sem falha do agente não renderiza nada', () => {
    const { container } = render(
      <SendErrorBanner
        messages={[msg({ status: 'delivered' }), msg({ sender: 'contact', status: 'failed' })]}
        onSendMessage={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('com 2 mensagens em falha mostra o alerta e reenvia o texto da última falha de texto', () => {
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[
          msg({ id: 'f1', status: 'failed', content: 'primeira', created_at: '2026-10-11T10:00:01.000Z' }),
          msg({ id: 'f2', status: 'failed', content: 'segunda', created_at: '2026-10-11T10:00:02.000Z' }),
        ]}
        onSendMessage={onSendMessage}
      />,
    );

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('2 mensagens não foram enviadas');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('segunda');
  });

  it('falha de mídia na última mensagem mostra só o aviso, sem botão de reenvio', () => {
    render(
      <SendErrorBanner
        messages={[
          msg({ id: 'f1', status: 'failed', content: 'texto antigo', created_at: '2026-10-11T10:00:01.000Z' }),
          msg({
            id: 'f2',
            status: 'failed',
            type: 'image',
            content: 'foto',
            created_at: '2026-10-11T10:00:02.000Z',
          }),
        ]}
        onSendMessage={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('2 mensagens não foram enviadas');
    expect(screen.queryByRole('button', { name: 'Enviar de novo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dispensar' })).toBeInTheDocument();
  });

  it('"Dispensar" esconde o banner e outra falha o traz de volta', () => {
    const onSendMessage = vi.fn();
    const primeira = msg({ id: 'f1', status: 'failed', content: 'oi', created_at: '2026-10-11T10:00:01.000Z' });
    const { rerender } = render(<SendErrorBanner messages={[primeira]} onSendMessage={onSendMessage} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(<SendErrorBanner messages={[primeira]} onSendMessage={onSendMessage} />);
    expect(screen.queryByRole('alert')).toBeNull();

    const nova = msg({ id: 'f2', status: 'failed', content: 'de novo', created_at: '2026-10-11T10:00:02.000Z' });
    rerender(<SendErrorBanner messages={[primeira, nova]} onSendMessage={onSendMessage} />);
    expect(screen.getByRole('alert')).toHaveTextContent('2 mensagens não foram enviadas');
  });
});
