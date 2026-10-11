import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InputPreviewBars } from '../InputPreviewBars';
import { Message } from '@/types/chat';

// `useReducedMotion` do framer-motion lê um singleton inicializado uma única vez,
// então trocar matchMedia no meio do arquivo não funciona. Só o hook é trocado; o
// resto do framer-motion segue real e as asserções são sobre o DOM produzido.
const reduceMotion = { value: true };

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    sender: 'contact',
    content: 'Mensagem original',
    timestamp: new Date('2026-10-11T10:00:00Z'),
    status: 'delivered',
    type: 'text',
    ...overrides,
  } as Message;
}

const EDITING = makeMsg({ id: 'm1', content: 'Mensagem original' });

function setup() {
  render(
    <InputPreviewBars
      replyToMessage={null}
      editingMessage={EDITING}
      onCancelReply={vi.fn()}
      onCancelEdit={vi.fn()}
    />,
  );
  return screen.getByTestId('edit-mode-bar');
}

describe('InputPreviewBars — movimento reduzido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('com movimento reduzido a barra de edição não anima altura (só opacidade)', () => {
    reduceMotion.value = true;

    const bar = setup();

    expect(bar.style.height).toBe('');
    expect(screen.getByText('Modo de edição')).toBeInTheDocument();
  });

  it('sem movimento reduzido a barra de edição entra por altura suave', () => {
    reduceMotion.value = false;

    const bar = setup();

    expect(bar.style.height).toBe('0px');
  });
});
