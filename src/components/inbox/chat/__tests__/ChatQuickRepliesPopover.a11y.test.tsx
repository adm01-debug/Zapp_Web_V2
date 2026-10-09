import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ChatQuickRepliesPopover } from '../ChatQuickRepliesPopover';

vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => <span {...props}>{children}</span>,
}));

const replies = [
  { id: 'r1', title: 'Confirmado', shortcut: '/ok', content: 'Está confirmado!', category: 'general' },
];

describe('ChatQuickRepliesPopover — acessibilidade do botão fechar', () => {
  it('botão fechar tem nome acessível', () => {
    render(<ChatQuickRepliesPopover show={true} replies={replies} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Fechar respostas rápidas' })).toBeInTheDocument();
  });

  it('axe button-name não tem violações', async () => {
    const { container } = render(<ChatQuickRepliesPopover show={true} replies={replies} onSelect={vi.fn()} onClose={vi.fn()} />);
    const results = await axe(container, { rules: { 'button-name': { enabled: true } } });
    expect(results).toHaveNoViolations();
  });
});