import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MessageTemplates } from '../MessageTemplates';

vi.mock('@/hooks/chat/useMessageTemplates', () => ({
  useMessageTemplates: vi.fn(() => ({
    templates: [
      { id: 't1', title: 'Olá, tudo bem?', content: 'Olá, como posso ajudar?', shortcut: '/ola', category: 'saudacao', use_count: 5 },
    ],
    isLoading: false,
    fetchTemplates: vi.fn(),
    addTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    incrementUseCount: vi.fn(),
  })),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u1', email: 'test@test.com' } })),
}));

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/motion', () => ({
  motion: { div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div> },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => <span {...props}>{children}</span>,
}));

describe('MessageTemplates — acessibilidade dos botões', () => {
  it('botão editar tem nome acessível com o título do template', () => {
    render(<MessageTemplates onSelectTemplate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Editar template: Olá, tudo bem?/ })).toBeInTheDocument();
  });

  it('botão excluir tem nome acessível com o título do template', () => {
    render(<MessageTemplates onSelectTemplate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Excluir template: Olá, tudo bem?/ })).toBeInTheDocument();
  });

  it('axe button-name não tem violações', async () => {
    const { container } = render(<MessageTemplates onSelectTemplate={vi.fn()} />);
    const results = await axe(container, { rules: { 'button-name': { enabled: true } } });
    expect(results).toHaveNoViolations();
  });
});