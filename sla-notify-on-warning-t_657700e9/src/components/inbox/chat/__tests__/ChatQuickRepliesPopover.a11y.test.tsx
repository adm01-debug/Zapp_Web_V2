import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { axe } from 'vitest-axe';
import { ChatQuickRepliesPopover } from '../ChatQuickRepliesPopover';

// O botão X do popover de respostas rápidas só tem ícone: sem `aria-label` o
// leitor de tela anuncia "botão" sem nome (R2-INB-035). O teste falha se o
// `aria-label` for removido e também prova que o clique continua fechando.

vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => <span {...props}>{children}</span>,
}));

const replies = [
  { id: 'r1', title: 'Confirmado', shortcut: '/ok', content: 'Está confirmado!', category: 'general' },
];

describe('ChatQuickRepliesPopover — acessibilidade do botão fechar', () => {
  it('botão fechar tem nome acessível', () => {
    render(<ChatQuickRepliesPopover show replies={replies} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Fechar respostas rápidas' })).toBeInTheDocument();
  });

  it('clicar no botão fechar chama onClose', () => {
    const onClose = vi.fn();
    render(<ChatQuickRepliesPopover show replies={replies} onSelect={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar respostas rápidas' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('axe button-name não tem violações', async () => {
    const { container } = render(<ChatQuickRepliesPopover show replies={replies} onSelect={vi.fn()} onClose={vi.fn()} />);
    const results = await axe(container, { runOnly: { type: 'rule', values: ['button-name'] } });
    expect(results).toHaveNoViolations();
  });
});
