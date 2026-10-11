/**
 * ConversationDeliverySummary — pílulas de entrega da conversa (paridade V3, parte 1 do chat).
 *
 * O componente REAL é montado (nada de mock do resumo). A prova de movimento instrumenta o
 * `motion.button` do framer-motion: com "reduzir movimento" (`useReducedMotion`) o componente
 * renderiza um `<button>` comum, sem estado inicial de animação.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types/chat';
import { ConversationDeliverySummary } from '../ConversationDeliverySummary';
import { estadoDeEnvio, type EstadoDeEnvio } from '../messageSendTimeline';

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

describe('ConversationDeliverySummary — estado de cada mensagem', () => {
  it('classifica queued, inFlight, failed e confirmed pela mesma régua do resumo', () => {
    expect(estadoDeEnvio(msg({ status: 'sending' }))).toBe('queued');
    expect(estadoDeEnvio(msg({ status: 'sending', delivery_claimed_at: '2026-10-11T10:00:01.000Z' }))).toBe('inFlight');
    expect(estadoDeEnvio(msg({ status: 'failed' }))).toBe('failed');
    expect(estadoDeEnvio(msg({ status: 'delivered' }))).toBe('confirmed');
  });

  it('casos-limite seguem o resumo: claim invalido e fila, contato nao casa, final com claim e confirmado', () => {
    expect(estadoDeEnvio(msg({ status: 'sending', delivery_claimed_at: 'nao-data' }))).toBe('queued');
    expect(estadoDeEnvio(msg({ status: 'sending', delivery_claimed_at: '' }))).toBe('queued');
    expect(estadoDeEnvio(msg({ sender: 'contact', status: 'sending' }))).toBe('confirmed');
    expect(estadoDeEnvio(msg({ status: 'sent', delivery_claimed_at: '2026-10-11T10:00:01.000Z' }))).toBe('confirmed');
    expect(estadoDeEnvio(msg({ status: 'failed', delivery_claimed_at: '2026-10-11T10:00:01.000Z' }))).toBe('failed');
  });

  it('contagem por estadoDeEnvio bate com summarizeDeliveryProgress no mesmo lote', async () => {
    const { summarizeDeliveryProgress } = await import('../messageSendTimeline');
    const mensagens = [
      msg({ id: 'q1', status: 'sending' }),
      msg({ id: 'q2', status: 'sending', delivery_claimed_at: 'nao-data' }),
      msg({ id: 'v1', status: 'sending', delivery_claimed_at: '2026-10-11T10:00:01.000Z' }),
      msg({ id: 'f1', status: 'failed' }),
      msg({ id: 'ok1', status: 'sent' }),
      msg({ id: 'ok2', status: 'delivered', delivery_claimed_at: '2026-10-11T10:00:01.000Z' }),
      msg({ id: 'c1', sender: 'contact', status: 'sending' }),
    ];
    const resumo = summarizeDeliveryProgress(mensagens);
    const conta = (estado: EstadoDeEnvio) => mensagens.filter((m) => estadoDeEnvio(m) === estado).length;
    expect(conta('queued')).toBe(resumo.queued);
    expect(conta('inFlight')).toBe(resumo.inFlight);
    expect(conta('failed')).toBe(resumo.failed);
  });
});

describe('ConversationDeliverySummary — tela', () => {
  it('sem fila, envio ou falha não renderiza nada', () => {
    const { container } = render(
      <ConversationDeliverySummary messages={[msg({ status: 'delivered' }), msg({ status: 'sent' })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra só as pílulas com valor maior que zero', () => {
    render(
      <ConversationDeliverySummary
        messages={[
          msg({ id: 'q1', status: 'sending' }),
          msg({ id: 'q2', status: 'sending' }),
          msg({ id: 'f1', status: 'failed' }),
          msg({ id: 'f2', status: 'failed' }),
          msg({ id: 'f3', status: 'failed' }),
          msg({ id: 'ok', status: 'delivered' }),
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Ir para a primeira mensagem na fila (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir para a primeira mensagem com falha (3)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviando/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /confirmad/ })).toBeNull();
  });

  it('marca "enviando" quando a mensagem já foi reivindicada', () => {
    render(
      <ConversationDeliverySummary
        messages={[msg({ status: 'sending', delivery_claimed_at: '2026-10-11T10:00:01.000Z' })]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ir para a primeira mensagem enviando (1)' })).toBeInTheDocument();
  });

  it('o nome acessível é a AÇÃO pedida com a contagem, nos dois ramos (animado e estático)', () => {
    const { unmount } = render(
      <ConversationDeliverySummary
        messages={[msg({ status: 'failed' }), msg({ status: 'failed' }), msg({ status: 'sending' })]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ir para a primeira mensagem com falha (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir para a primeira mensagem na fila (1)' })).toBeInTheDocument();
    unmount();

    controle.reduzido = true; // ramo estático: <button> comum
    render(<ConversationDeliverySummary messages={[msg({ status: 'failed' })]} />);
    expect(screen.getByRole('button', { name: 'Ir para a primeira mensagem com falha (1)' })).toBeInTheDocument();
  });

  it('clicar numa pílula pede o foco naquele estado', () => {
    const onFocusState = vi.fn();
    render(
      <ConversationDeliverySummary
        messages={[msg({ status: 'failed' }), msg({ status: 'sending' })]}
        onFocusState={onFocusState}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ir para a primeira mensagem com falha (1)' }));
    expect(onFocusState).toHaveBeenCalledWith('failed');

    fireEvent.click(screen.getByRole('button', { name: 'Ir para a primeira mensagem na fila (1)' }));
    expect(onFocusState).toHaveBeenCalledWith('queued');
  });

  it('a região é aria-live="polite"', () => {
    render(<ConversationDeliverySummary messages={[msg({ status: 'failed' })]} />);
    const regiao = screen.getByTestId('conversation-delivery-summary');
    expect(regiao).toHaveAttribute('aria-live', 'polite');
    expect(regiao).toHaveAttribute('role', 'status');
  });

  it('as setas movem o foco entre as pílulas', () => {
    render(
      <ConversationDeliverySummary
        messages={[msg({ status: 'sending' }), msg({ status: 'failed' })]}
      />,
    );

    const fila = screen.getByRole('button', { name: 'Ir para a primeira mensagem na fila (1)' });
    const falha = screen.getByRole('button', { name: 'Ir para a primeira mensagem com falha (1)' });

    fila.focus();
    fireEvent.keyDown(fila, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(falha);

    fireEvent.keyDown(falha, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(fila);
  });

  it('com movimento normal a pílula nasce fora do lugar (opacidade 0)', () => {
    render(<ConversationDeliverySummary messages={[msg({ status: 'failed' })]} />);
    const pilula = screen.getByRole('button', { name: 'Ir para a primeira mensagem com falha (1)' });
    expect(pilula.style.opacity).toBe('0');
  });

  it('com reduzir movimento a pílula já nasce no estado final e ainda é clicável', () => {
    controle.reduzido = true;
    const onFocusState = vi.fn();
    render(
      <ConversationDeliverySummary messages={[msg({ status: 'failed' })]} onFocusState={onFocusState} />,
    );

    const pilula = screen.getByRole('button', { name: 'Ir para a primeira mensagem com falha (1)' });
    expect(pilula.style.opacity).not.toBe('0');
    expect(pilula.style.transform).not.toContain('translate');

    fireEvent.click(pilula);
    expect(onFocusState).toHaveBeenCalledWith('failed');
  });
});
