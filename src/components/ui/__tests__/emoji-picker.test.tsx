import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmojiPicker, QuickReactionPicker } from '@/components/ui/emoji-picker';
import React from 'react';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get(_target, prop) {
        return (props: Record<string, unknown>) => {
          const { children, ...rest } = props;
          // Preserva a tag real para o item continuar sendo um botão de verdade
          const Tag = prop === 'div' ? 'div' : 'button';
          return <Tag {...rest}>{children as React.ReactNode}</Tag>;
        };
      },
    },
  ),
}));

const onSelect = vi.fn();

describe('EmojiPicker — botão do seletor tem nome acessível', () => {
  it('o botão que abre o seletor tem aria-label "Inserir emoji"', () => {
    render(<EmojiPicker onEmojiSelect={onSelect} />);
    const btn = screen.getByRole('button', { name: /inserir emoji/i });
    expect(btn).toBeDefined();
  });

  it('o botão do QuickReactionPicker também tem nome acessível quando sem trigger', () => {
    render(<QuickReactionPicker onReact={onSelect} />);
    const btn = screen.getByRole('button', { name: /inserir emoji/i });
    expect(btn).toBeDefined();
  });
});