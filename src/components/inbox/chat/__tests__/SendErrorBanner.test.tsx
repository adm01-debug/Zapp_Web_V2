/**
 * SendErrorBanner — aviso de mensagem não enviada (paridade V3, parte 1 do chat).
 *
 * O componente REAL é montado; o reenvio é provado pelo `onSendMessage` (mensagem nova). A prova de
 * movimento instrumenta o framer-motion via `useReducedMotion`: com "reduzir movimento" o banner já
 * nasce no lugar, sem estado inicial de animação.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types/chat';
import { SendErrorBanner } from '../SendErrorBanner';

const controle = vi.hoisted(() => ({ reduzido: false }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => controle.reduzido };
});

beforeEach(() => {
  controle.reduzido = false;
});

function msg(over: Partial<Message> = {}): Message {
  return {
    id: 'm-' + Math.random().toString(36).slice(2),
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
  it('sem falha não renderiza nada', () => {
    const { container } = render(<SendErrorBanner messages={[msg({ status: 'sent' })]} onSendMessage={vi.fn()} />);
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

  it('o botão de reenvio vira spinner e depois check de enviado', async () => {
    let resolver: () => void = () => {};
    const onSendMessage = vi.fn(() => new Promise<void>((r) => { resolver = r; }));
    render(<SendErrorBanner messages={[msg({ status: 'failed', content: 'oi' })]} onSendMessage={onSendMessage} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(screen.getByRole('button', { name: /Enviando/ })).toBeDisabled();

    await act(async () => { resolver(); });
    await waitFor(() => expect(screen.getByRole('button', { name: /Enviado/ })).toBeInTheDocument());
  });

  it('última falha de mídia: só o aviso, sem botão de reenvio', () => {
    render(
      <SendErrorBanner
        messages={[
          msg({ id: 'f1', status: 'failed', content: 'texto', created_at: '2026-10-11T10:00:01.000Z' }),
          msg({ id: 'f2', status: 'failed', type: 'image', created_at: '2026-10-11T10:00:02.000Z' }),
        ]}
        onSendMessage={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('2 mensagens não foram enviadas');
    expect(screen.queryByRole('button', { name: 'Enviar de novo' })).toBeNull();
  });

  it('"Dispensar" esconde o banner e "Desfazer" o traz de volta', () => {
    render(<SendErrorBanner messages={[msg({ status: 'failed', content: 'oi' })]} onSendMessage={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('Esc também dispensa', () => {
    render(<SendErrorBanner messages={[msg({ status: 'failed', content: 'oi' })]} onSendMessage={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('outra falha depois de dispensar traz o banner de volta', () => {
    const primeira = msg({ id: 'f1', status: 'failed', content: 'oi', created_at: '2026-10-11T10:00:01.000Z' });
    const { rerender } = render(<SendErrorBanner messages={[primeira]} onSendMessage={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(
      <SendErrorBanner
        messages={[primeira, msg({ id: 'f2', status: 'failed', content: 'nova', created_at: '2026-10-11T10:00:02.000Z' })]}
        onSendMessage={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('2 mensagens não foram enviadas');
  });

  it('com movimento normal o banner nasce deslocado (opacidade 0)', () => {
    render(<SendErrorBanner messages={[msg({ status: 'failed', content: 'oi' })]} onSendMessage={vi.fn()} />);
    expect(screen.getByRole('alert').style.opacity).toBe('0');
  });

  it('com reduzir movimento o banner já nasce no lugar', () => {
    controle.reduzido = true;
    render(<SendErrorBanner messages={[msg({ status: 'failed', content: 'oi' })]} onSendMessage={vi.fn()} />);

    const banner = screen.getByRole('alert');
    expect(banner.style.opacity).not.toBe('0');
    expect(banner.style.transform).not.toContain('translate');
  });
});
