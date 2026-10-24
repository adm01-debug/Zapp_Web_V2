import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

// Cartão t_90dcdcc8, item 2 [refazer 1]: o card de grupo selecionável para broadcast era uma
// Card/div com onClick só de mouse — impossível selecionar só com teclado. A primeira
// tentativa (role="button" no Card inteiro) criou `nested-interactive` sério, porque o
// Card contém o menu "Ações do grupo" e o Select de categoria. Padrão copiado do
// ContactListItem.tsx: Card com onClick (mouse) + Checkbox REAL por card
// ("Selecionar <nome>"/"Desmarcar <nome>") — operável por teclado e leitor de tela,
// sem interativo aninhado.
//
// O que a recusa mandou corrigir aqui:
// - primitivos de UI REAIS: Card, Button, Select e DropdownMenu NÃO são dublados
//   (só dados: supabase, useAuth, toast, feedback e componentes decorativos);
// - sel (SelectTrigger real — em jsdom, exige o stub do pointerdown);
// - axe real com o filtro de impactos sérios do aceite + teste de controle.

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
});

const mockData = vi.hoisted(() => ({
  grupos: [
    {
      id: 'g1',
      group_id: '1@g.us',
      name: 'Meu Grupo',
      description: 'Desc',
      participant_count: 10,
      avatar_url: null,
      is_admin: true,
      whatsapp_connection_id: 'c1',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    },
  ],
  conexoes: [{ id: 'c1', name: 'WPP', phone_number: '5511', instance_id: 'inst-1' }],
}));

// Mock por TABELA (não por ordem de chamada): refetch/realtime repetem a mesma
// resposta, então a grade nunca some no meio do teste.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: vi.fn().mockReturnValue({
        order: vi
          .fn()
          .mockResolvedValue(
            table === 'whatsapp_groups'
              ? { data: mockData.grupos, error: null }
              : { data: mockData.conexoes, error: null }
          ),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
    functions: { invoke: vi.fn() },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: {}, profile: null, loading: false }),
  AuthProvider: ({ children }: { children?: import('react').ReactNode }) => children,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: { children?: import('react').ReactNode } & Record<string, unknown>) => (
      <div {...props}>{children}</div>
    ),
    span: ({
      children,
      ...props
    }: { children?: import('react').ReactNode } & Record<string, unknown>) => (
      <span {...props}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: { children?: import('react').ReactNode }) => children,
  useReducedMotion: () => false,
  MotionConfig: ({ children }: { children?: import('react').ReactNode }) => children,
}));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/ui/empty-state', () => ({
  EmptyState: ({ title }: { title?: string }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
    </div>
  ),
}));
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title?: string; actions?: import('react').ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));
vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({
    warning: vi.fn(),
    withFeedback: vi.fn(async (fn: () => Promise<void>, opts?: { onSuccess?: () => void }) => {
      try {
        await fn();
        opts?.onSuccess?.();
      } catch {
        /* noop */
      }
    }),
  }),
}));

import { GroupsView } from '@/components/groups/GroupsView';

async function renderGrupos() {
  render(<GroupsView />);
  await screen.findByText('Meu Grupo');
}

/**
 * O checkbox de seleção ("Selecionar <nome>"/"Desmarcar <nome>") é o controle
 * de teclado do card. O botão interno ("Ações do grupo ...") e o Select de
 * categoria continuam existindo — por isso a busca é pelo papel `checkbox`.
 */
function checkboxDoGrupo(nome: string | RegExp) {
  // ATENÇÃO: `{ name }` aqui capturaria o global `window.name` ('' no jsdom),
  // não o parâmetro — por isso o explícito `name: nome`.
  return screen.findByRole('checkbox', { name: nome });
}

/** Impactos sérios segundo o aceite (mesma régua da skill de a11y do repo). */
const SERIOUS = new Set(['critical', 'serious']);
const ids = (violations: { id: string }[]) => violations.map((v) => v.id).sort();

describe('GroupsView — card de grupo selecionável por teclado (t_90dcdcc8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('o card do grupo tem checkbox de seleção com nome acessível', async () => {
    await renderGrupos();
    const box = await checkboxDoGrupo('Selecionar Meu Grupo');
    expect(box).toHaveAttribute('aria-checked', 'false');
  });

  it('checkbox é alcançável por teclado (foco) e alterna a seleção', async () => {
    await renderGrupos();
    const box = await checkboxDoGrupo('Selecionar Meu Grupo');

    // Teclado chega ao controle: Tab para nele (o jsdom não sintetiza o `click`
    // que o navegador dispara no Espaço/Enter sobre um <button> nativo — esse
    // comportamento é da plataforma e o Checkbox Radix é um <button> real).
    box.focus();
    expect(document.activeElement).toBe(box);

    fireEvent.click(box);
    expect(
      await screen.findByRole('button', { name: 'Enviar para 1 grupo(s)' })
    ).toBeInTheDocument();
    expect(await checkboxDoGrupo('Desmarcar Meu Grupo')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(await checkboxDoGrupo('Desmarcar Meu Grupo'));
    expect(
      screen.queryByRole('button', { name: 'Enviar para 1 grupo(s)' })
    ).not.toBeInTheDocument();
    expect(await checkboxDoGrupo('Selecionar Meu Grupo')).toHaveAttribute('aria-checked', 'false');
  });

  it('o filtro de categoria (Select real) tem nome acessível', async () => {
    await renderGrupos();
    expect(screen.getByRole('combobox', { name: 'Filtrar por categoria' })).toBeInTheDocument();
  });
});

describe('GroupsView — axe: sem violação séria (t_90dcdcc8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a grade de grupos não tem violações critical/serious', async () => {
    await renderGrupos();

    const results = await axe(document.body);
    expect({
      ...results,
      violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
    }).toHaveNoViolations();
  });

  /**
   * Controle: prova que o matcher acusa violação REAL. Um `<button>` só de ícone
   * sem nome viola `button-name` (critical) — é exatamente o defeito corrigido.
   * Se o axe nunca rodasse, o controle (e o teste acima) deixariam de reprovar.
   */
  it('controle: um botão só de ícone sem nome CONTÉM button-name', async () => {
    render(
      <button type="button">
        <span data-testid="icone" />
      </button>
    );
    const results = await axe(document.body);

    expect(ids(results.violations)).toContain('button-name');
  });
});
