/**
 * TemplatesWithVariables — atendente real na variável `{{atendente}}`.
 *
 * O painel apresentacional (`TemplatesWithVariables`) recebe `agentName` por prop,
 * como `contactData`, e por isso renderiza SEM AuthProvider (é o que o teste de
 * a11y do inbox, de outro cartão, exige). Quem lê o AuthProvider é o
 * `TemplatesWithVariablesComAtendente` — provado aqui com perfil de verdade.
 *
 * Vermelho antes: o painel chamava `useAuth` direto e estourava
 * "useAuth must be used within an AuthProvider" quando renderizado sem provider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TemplatesWithVariables, TemplatesWithVariablesComAtendente } from '@/components/inbox/TemplatesWithVariables';

const mockAuth = vi.hoisted(() => ({ profile: null as { name: string } | null }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: mockAuth.profile }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

const template = {
  id: 't1',
  title: 'Boas-vindas',
  content: 'Olá {{nome}}, aqui é {{atendente}}.',
  category: 'geral',
  shortcut: null,
  is_global: false,
  use_count: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

/** Clica no botão de usar template pela própria tela (ícone Copy do card). */
function clicaUsarTemplate(container: HTMLElement) {
  const botao = container.querySelector('svg.lucide-copy')?.closest('button');
  expect(botao).not.toBeNull();
  fireEvent.click(botao as HTMLButtonElement);
}

describe('TemplatesWithVariables — {{atendente}} do atendente logado', () => {
  beforeEach(() => {
    mockAuth.profile = { name: 'Íris Atendente' };
  });

  it('ComAtendente preenche {{atendente}} com profiles.name e mantém os dados do contato', () => {
    const onUseTemplate = vi.fn();
    const { container } = render(
      <TemplatesWithVariablesComAtendente
        templates={[template]}
        onUseTemplate={onUseTemplate}
        contactData={{ name: 'Ana' }}
      />,
    );

    clicaUsarTemplate(container);

    expect(onUseTemplate).toHaveBeenCalledWith('Olá Ana, aqui é Íris Atendente.', {});
  });

  it('sem perfil logado, {{atendente}} fica pendente (nada de nome inventado)', () => {
    mockAuth.profile = null;
    const onUseTemplate = vi.fn();
    const { container } = render(
      <TemplatesWithVariablesComAtendente
        templates={[template]}
        onUseTemplate={onUseTemplate}
        contactData={{ name: 'Ana' }}
      />,
    );

    clicaUsarTemplate(container);

    expect(onUseTemplate).toHaveBeenCalledWith('Olá Ana, aqui é {{atendente}}.', {});
  });

  it('o painel apresentacional usa o agentName da prop e não precisa de provider', () => {
    const onUseTemplate = vi.fn();
    const { container } = render(
      <TemplatesWithVariables
        templates={[template]}
        onUseTemplate={onUseTemplate}
        contactData={{ name: 'Ana' }}
        agentName="Íris Atendente"
      />,
    );

    clicaUsarTemplate(container);

    expect(onUseTemplate).toHaveBeenCalledWith('Olá Ana, aqui é Íris Atendente.', {});
  });
});
