import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QuickReactionBar } from '../MessageReactions';

vi.mock('@/hooks/chat/useMessageReactions', () => ({
  useMessageReactions: () => ({
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
    hasReacted: () => false,
    currentProfileId: 'p1',
  }),
}));

type AnyProps = Record<string, unknown> & { children?: ReactNode };
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: AnyProps) => <div>{children}</div>,
  PopoverTrigger: ({ children }: AnyProps) => <>{children}</>,
  PopoverContent: ({ children }: AnyProps) => <div>{children}</div>,
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: AnyProps) => <>{children}</>,
  TooltipTrigger: ({ children }: AnyProps) => <>{children}</>,
  TooltipContent: ({ children }: AnyProps) => <>{children}</>,
  TooltipProvider: ({ children }: AnyProps) => <>{children}</>,
}));
vi.mock('framer-motion', () => {
  const passthrough =
    (tag: 'div' | 'button') =>
    ({ children, ...props }: AnyProps) => {
      const Tag = tag;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <Tag {...(props as any)}>{children}</Tag>;
    };
  return { motion: { div: passthrough('div'), button: passthrough('button') } };
});

describe('QuickReactionBar — botão "mais reações" com nome acessível (A11Y-13)', () => {
  it('nomeia o botão que abre o seletor de reações', () => {
    render(<QuickReactionBar messageId="m1" />);
    expect(screen.getByRole('button', { name: 'Mais reações' })).toBeInTheDocument();
  });
});
