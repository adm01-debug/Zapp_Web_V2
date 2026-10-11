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
import { ConversationDeliverySummary, estadoDeEnvio } from '../ConversationDeliverySummary';

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

    expect(screen.getByRole('button', { name: /2 na fila/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3 com falha/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviando/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /confirmad/ })).toBeNull();
  });

  it('marca "enviando" quando a mensagem já foi reivindicada', () => {
    render(
      <ConversationDeliverySummary
        messages={[msg({ status: 'sending', delivery_claimed_at: '2026-10-11T10:00:01.000Z' })]}
      />,
    );
    expect(screen.getByRole('button', { name: /1 enviando/ })).toBeInTheDocument();
  });

  it('clicar numa pílula pede o foco naquele estado', () => {
    const onFocusState = vi.fn();
    render(
      <ConversationDeliverySummary
        messages={[msg({ status: 'failed' }), msg({ status: 'sending' })]}
        onFocusState={onFocusState}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /1 com falha/ }));
    expect(onFocusState).toHaveBeenCalledWith('failed');

    fireEvent.click(screen.getByRole('button', { name: /1 na fila/ }));
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

    const fila = screen.getByRole('button', { name: /1 na fila/ });
    const falha = screen.getByRole('button', { name: /1 com falha/ });

    fila.focus();
    fireEvent.keyDown(fila, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(falha);

    fireEvent.keyDown(falha, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(fila);
  });

  it('com movimento normal a pílula nasce fora do lugar (opacidade 0)', () => {
    render(<ConversationDeliverySummary messages={[msg({ status: 'failed' })]} />);
    const pilula = screen.getByRole('button', { name: /1 com falha/ });
    expect(pilula.style.opacity).toBe('0');
  });

  it('com reduzir movimento a pílula já nasce no estado final e ainda é clicável', () => {
    controle.reduzido = true;
    const onFocusState = vi.fn();
    render(
      <ConversationDeliverySummary messages={[msg({ status: 'failed' })]} onFocusState={onFocusState} />,
    );

    const pilula = screen.getByRole('button', { name: /1 com falha/ });
    expect(pilula.style.opacity).not.toBe('0');
    expect(pilula.style.transform).not.toContain('translate');

    fireEvent.click(pilula);
    expect(onFocusState).toHaveBeenCalledWith('failed');
  });
});
