import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatQuickRepliesPopover } from '../ChatQuickRepliesPopover';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// `useReducedMotion` do framer-motion lê um singleton inicializado uma única vez,
// então trocar matchMedia no meio do arquivo não funciona. Só o hook é trocado; o
// resto do framer-motion segue real e as asserções são sobre o DOM produzido.
const reduceMotion = { value: true };

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

const REPLIES = [
  { id: 'r1', title: 'Boas-vindas', shortcut: '/bomdia', content: 'Bom dia!', category: 'saudacao' },
];

function setup() {
  render(<ChatQuickRepliesPopover show replies={REPLIES} onSelect={vi.fn()} onClose={vi.fn()} />);
  return screen.getByTestId('quick-replies-popover');
}

describe('ChatQuickRepliesPopover — movimento reduzido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('com movimento reduzido o painel não se desloca (nenhuma escala na entrada)', () => {
    reduceMotion.value = true;

    const panel = setup();

    expect(panel.style.transform).toBe('');
    expect(screen.getByText('Sugestões Rápidas')).toBeInTheDocument();
  });

  it('sem movimento reduzido o painel entra com a escala do zappPopoverVariants', () => {
    reduceMotion.value = false;

    const panel = setup();

    expect(panel.style.transform).toContain('scale');
  });
});
