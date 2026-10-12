import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { axe } from 'vitest-axe';
import { MessageTemplates } from '../MessageTemplates';

// Contrato de acessibilidade dos botões de ícone do MessageTemplates (R2-INB-035).
// Os botões de editar/excluir e o X do formulário não têm texto visível: sem
// `aria-label` eles chegam ao leitor de tela com nome vazio (violação
// `button-name` do axe). Estes testes pinam o nome acessível de cada um — e
// falham (vermelho) se o `aria-label` for removido.

const templates = [
  { id: 't1', title: 'Olá, tudo bem?', content: 'Olá, como posso ajudar?', shortcut: '/ola', category: 'saudacao', use_count: 5 },
  { id: 't2', title: 'Orçamento de brindes', content: 'Segue o orçamento.', shortcut: '/orc', category: 'vendas', use_count: 2 },
];

vi.mock('@/hooks/chat/useMessageTemplates', () => ({
  useMessageTemplates: vi.fn(() => ({
    templates,
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
  motion: { div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

// O dialog real só monta o conteúdo quando `open`; o mock imita isso para o
// teste provar que os nomes acessíveis existem na tela realmente aberta.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => <span {...props}>{children}</span>,
}));

function abrirDialogo() {
  const view = render(<MessageTemplates onSelectTemplate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Templates de mensagem' }));
  return view;
}

describe('MessageTemplates — acessibilidade dos botões', () => {
  it('cada template tem botão editar com nome acessível contendo o próprio título', () => {
    abrirDialogo();
    expect(screen.getByRole('button', { name: 'Editar template: Olá, tudo bem?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar template: Orçamento de brindes' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Editar template: / })).toHaveLength(templates.length);
  });

  it('cada template tem botão excluir com nome acessível contendo o próprio título', () => {
    abrirDialogo();
    expect(screen.getByRole('button', { name: 'Excluir template: Olá, tudo bem?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir template: Orçamento de brindes' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Excluir template: / })).toHaveLength(templates.length);
  });

  it('botão X do formulário tem nome acessível', () => {
    abrirDialogo();
    expect(screen.queryByRole('button', { name: 'Fechar formulário' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Novo/ }));
    expect(screen.getByRole('button', { name: 'Fechar formulário' })).toBeInTheDocument();
  });

  it('o clique no botão editar ainda abre o formulário de edição', () => {
    abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: 'Editar template: Olá, tudo bem?' }));
    expect(screen.getByRole('heading', { name: 'Editar Template' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar formulário' })).toBeInTheDocument();
  });

  it('axe button-name não tem violações (diálogo e formulário abertos)', async () => {
    const { container } = abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: /Novo/ }));
    const results = await axe(container, { runOnly: { type: 'rule', values: ['button-name'] } });
    expect(results).toHaveNoViolations();
  });
});
