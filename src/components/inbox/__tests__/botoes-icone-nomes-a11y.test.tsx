/**
 * A11y (UK-13/UK-13b) — botões de ícone do inbox precisam de nome acessível.
 *
 * Prova: renderiza o componente REAL e exige o nome acessível no DOM
 * (`getByRole('button', { name })` casa pelo nome acessível calculado, não por classe).
 * Vermelho antes: sem `aria-label`, o único nome era o ícone (lucide = svg decorativo),
 * então a consulta por role+nome não encontrava nada.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplatesWithVariables } from '@/components/inbox/TemplatesWithVariables';
import { InteractiveMessageBuilder } from '@/components/inbox/InteractiveMessageBuilder';
import { KeyboardShortcutsHelp } from '@/components/inbox/KeyboardShortcutsHelp';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u1', email: 'test@test.com' }, profile: null, loading: false })),
}));

const template = {
  id: 't1',
  title: 'Boas-vindas',
  content: 'Olá {{nome}}, tudo bem?',
  category: 'geral',
  shortcut: null,
  is_global: false,
  use_count: 3,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('inbox — botões de ícone com nome acessível (UK-13/UK-13b)', () => {
  it('TemplatesWithVariables: editar e usar template são anunciados', () => {
    render(
      <TemplatesWithVariables
        templates={[template]}
        onUseTemplate={vi.fn()}
        contactData={{ name: 'Ana' }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Editar template' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar template' })).toBeInTheDocument();
  });

  it('InteractiveMessageBuilder: remover botão da composição é anunciado', () => {
    render(<InteractiveMessageBuilder open onOpenChange={vi.fn()} onSend={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/digite o corpo da mensagem/i), {
      target: { value: 'Escolha uma opção' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^resposta$/i }));
    fireEvent.change(screen.getByPlaceholderText(/título do botão/i), {
      target: { value: 'Atendimento' },
    });

    expect(screen.getByRole('button', { name: 'Remover botão 1' })).toBeInTheDocument();
  });

  it('KeyboardShortcutsHelp: o gatilho do popover é anunciado', () => {
    render(<KeyboardShortcutsHelp />);

    expect(screen.getByRole('button', { name: 'Atalhos de teclado' })).toBeInTheDocument();
  });
});
