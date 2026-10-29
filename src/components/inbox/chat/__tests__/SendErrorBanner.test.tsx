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

  it('falha de audio/interativa: so o aviso, sem botao de reenvio', () => {
    render(
      <SendErrorBanner
        messages={[
          msg({ id: 'a1', status: 'failed', type: 'audio', content: '', created_at: '2026-10-11T10:00:01.000Z' }),
          msg({ id: 'i1', status: 'failed', type: 'interactive', content: 'botao', created_at: '2026-10-11T10:00:02.000Z' }),
        ]}
        onSendMessage={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('2 mensagens');
    expect(screen.queryByRole('button', { name: 'Enviar de novo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dispensar' })).toBeInTheDocument();
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

  it('"Dispensar" esconde o banner e "Desfazer" o traz de volta', async () => {
    render(<SendErrorBanner messages={[msg({ status: 'failed', content: 'oi' })]} onSendMessage={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('Esc com o foco dentro do banner dispensa', async () => {
    render(<SendErrorBanner messages={[msg({ status: 'failed', content: 'oi' })]} onSendMessage={vi.fn()} />);
    const banner = screen.getByRole('alert');

    fireEvent.keyDown(banner, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('Esc fora do banner não dispensa', () => {
    render(<SendErrorBanner messages={[msg({ status: 'failed', content: 'oi' })]} onSendMessage={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('saída é animada: após Dispensar o banner permanece durante o exit e depois sai', async () => {
    render(<SendErrorBanner messages={[msg({ status: 'failed', content: 'oi' })]} onSendMessage={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 3000 });
  });

  it('falhas zerando: o alerta fica durante o exit e só então sai (AnimatePresence sempre montado)', async () => {
    const comFalha = msg({ status: 'failed', content: 'oi' });
    const { rerender } = render(<SendErrorBanner messages={[comFalha]} onSendMessage={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<SendErrorBanner messages={[]} onSendMessage={vi.fn()} />);
    // Sem o `return null`, o alerta continua no DOM enquanto o `exit` roda...
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // ...e sai depois.
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 3000 });
  });

  it('com reduzir movimento a saída é só por opacidade (sem translate)', async () => {
    controle.reduzido = true;
    const comFalha = msg({ status: 'failed', content: 'oi' });
    const { rerender } = render(<SendErrorBanner messages={[comFalha]} onSendMessage={vi.fn()} />);
    expect(screen.getByRole('alert').style.transform).not.toContain('translate');

    rerender(<SendErrorBanner messages={[]} onSendMessage={vi.fn()} />);
    expect(screen.getByRole('alert').style.transform).not.toContain('translate');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 3000 });
  });

  it('desmontar durante o envio não agenda estado depois', async () => {
    const agendados = vi.spyOn(globalThis, 'setTimeout');
    try {
      let resolver: () => void = () => {};
      const porta = new Promise<void>((r) => { resolver = r; });
      const { unmount } = render(
        <SendErrorBanner messages={[msg({ status: 'failed', content: 'oi' })]} onSendMessage={() => porta} />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
      unmount();
      await act(async () => { resolver(); });

      const doReenvio = agendados.mock.calls.filter((c) => c[1] === 1200);
      expect(doReenvio).toHaveLength(0);
    } finally {
      agendados.mockRestore();
    }
  });

  it('outra falha depois de dispensar traz o banner de volta', async () => {
    const primeira = msg({ id: 'f1', status: 'failed', content: 'oi', created_at: '2026-10-11T10:00:01.000Z' });
    const { rerender } = render(<SendErrorBanner messages={[primeira]} onSendMessage={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());

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
