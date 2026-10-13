import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp';

vi.mock('@/hooks/ui/useCustomShortcuts', () => ({
  useCustomShortcuts: () => ({ shortcuts: [], formatShortcut: () => '' }),
}));

type AnyProps = Record<string, unknown> & { children?: ReactNode };
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: AnyProps) => <>{children}</>,
  TooltipTrigger: ({ children }: AnyProps) => <>{children}</>,
  TooltipContent: ({ children }: AnyProps) => <>{children}</>,
  TooltipProvider: ({ children }: AnyProps) => <>{children}</>,
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: AnyProps) => <div>{children}</div>,
  PopoverTrigger: ({ children }: AnyProps) => <>{children}</>,
  PopoverContent: ({ children }: AnyProps) => <div>{children}</div>,
}));

describe('KeyboardShortcutsHelp — gatilho só de ícone com nome acessível (A11Y-13)', () => {
  it('nomeia o botão de atalhos de teclado', () => {
    render(<KeyboardShortcutsHelp />);
    expect(screen.getByRole('button', { name: 'Atalhos de teclado' })).toBeInTheDocument();
  });
});
