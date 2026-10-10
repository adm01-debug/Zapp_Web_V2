import type { ReactNode } from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A11Y-02 — controles sem nome acessível no módulo de chatbot.
 *
 * Os primitivos de UI (`Button`, `Switch`, `Select`, `Dialog`) são os REAIS do
 * projeto: só o hook de dados é dublado. É assim que o axe enxerga o markup de
 * verdade — um `Switch` mockado como `<button role="switch">` esconderia o
 * defeito, porque quem dá o nome é o mesmo `aria-label` que o Radix repassa.
 *
 * O defeito aqui: o `SelectTrigger` do diálogo "Novo Fluxo" (o seletor citado em
 * `ChatbotFlowsView.tsx:295`), o `Switch` de cada cartão e os três botões só de
 * ícone não tinham nome acessível. O critério é o nome do fluxo/no do campo.
 */

const flows = [
  {
    id: 'f1',
    name: 'Fluxo de Boas-vindas',
    description: 'Saudação inicial',
    is_active: true,
    trigger_type: 'keyword' as const,
    trigger_value: 'olá',
    nodes: [],
    edges: [],
    variables: {},
    whatsapp_connection_id: null,
    created_by: null,
    execution_count: 5,
    last_executed_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'f2',
    name: 'Fluxo de Suporte',
    description: null,
    is_active: false,
    trigger_type: 'first_message' as const,
    trigger_value: null,
    nodes: [],
    edges: [],
    variables: {},
    whatsapp_connection_id: null,
    created_by: null,
    execution_count: 0,
    last_executed_at: null,
    created_at: '2026-10-02T00:00:00.000Z',
    updated_at: '2026-10-02T00:00:00.000Z',
  },
];

vi.mock('@/hooks/integrations/useChatbotFlows', () => ({
  useChatbotFlows: () => ({
    flows,
    isLoading: false,
    createFlow: { mutate: vi.fn(), isPending: false },
    updateFlow: { mutate: vi.fn() },
    deleteFlow: { mutate: vi.fn() },
    toggleFlow: { mutate: vi.fn() },
  }),
}));

// framer-motion só é usado como `motion.div` + `AnimatePresence` nesta view.
vi.mock('framer-motion', () => {
  const MotionDiv = ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  return {
    motion: { div: MotionDiv },
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

import { ChatbotFlowsView } from '@/components/chatbot/ChatbotFlowsView';

/** Impactos sérios segundo o aceite (mesma régua da skill de a11y do repo). */
const SERIOUS = new Set(['critical', 'serious']);
const ids = (violations: { id: string }[]) => violations.map((v) => v.id).sort();

/** `<main>` = o container real da view no app; sem landmark o axe acusa `region`. */
const renderView = () =>
  render(
    <main>
      <ChatbotFlowsView />
    </main>,
  );

afterEach(() => cleanup());

describe('ChatbotFlowsView — nome acessível dos controles (A11Y-02)', () => {
  it('o Switch de cada fluxo tem nome "Ativar <fluxo>"', () => {
    renderView();

    for (const nome of ['Fluxo de Boas-vindas', 'Fluxo de Suporte']) {
      expect(screen.getByRole('switch', { name: `Ativar ${nome}` })).toBeInTheDocument();
    }
  });

  it('os botões só de ícone (editar, duplicar, excluir) nomeiam o fluxo', () => {
    renderView();

    for (const nome of ['Fluxo de Boas-vindas', 'Fluxo de Suporte']) {
      expect(screen.getByRole('button', { name: `Editar fluxo ${nome}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Duplicar fluxo ${nome}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Excluir fluxo ${nome}` })).toBeInTheDocument();
    }
  });

  it('o seletor "Tipo de gatilho" do diálogo de criação tem nome acessível', () => {
    renderView();

    // O seletor só existe com o diálogo aberto.
    fireEvent.click(screen.getByRole('button', { name: /Novo Fluxo/ }));

    expect(screen.getByRole('combobox', { name: 'Tipo de gatilho' })).toBeInTheDocument();
  });
});

describe('ChatbotFlowsView — axe: sem violação séria (A11Y-02)', () => {
  it('a tela com os fluxos não tem violações critical/serious', async () => {
    renderView();

    const results = await axe(document.body);
    expect({
      ...results,
      violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
    }).toHaveNoViolations();
  });

  it('o diálogo de criação aberto não tem violações critical/serious', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Novo Fluxo/ }));

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
      </button>,
    );
    const results = await axe(document.body);

    expect(ids(results.violations)).toContain('button-name');
  });
});
