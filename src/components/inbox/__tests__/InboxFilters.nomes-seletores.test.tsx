import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { InboxFilters } from '@/components/inbox/InboxFilters';

/**
 * N-045 — os filtros da lista de conversas (fila, responsável, tipo de contato e
 * "mostrar todos") não tinham nome para o leitor de tela.
 *
 * O `SelectTrigger` do Radix é um `<button role="combobox">` cujo conteúdo só
 * aparece quando há valor escolhido: com um valor selecionado e um `<SelectValue
 * placeholder>` sem filhos, o gatilho fica SEM texto (o texto do item escolhido é
 * portado para dentro do value node com `aria-hidden`). O `<Switch>` também é um
 * botão sem conteúdo. Os dois ficam sem nome acessível — por isso o `aria-label`.
 */

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: [] }),
}));

vi.mock('@/hooks/inbox/useInboxFilterTags', () => ({
  useInboxFilterTags: () => ({ data: [] }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: false, roles: ['admin'] }),
}));

vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: [{ id: 'q1', name: 'Suporte' }], loading: false }),
}));

// N-045 fala dos seletores; os filtros salvos (t_8e895114) puxam react-query e
// não têm relação com o nome acessível — ficam de fora do render do teste.
vi.mock('@/hooks/chat/useSavedFilters', () => ({
  useSavedFilters: () => ({
    filters: [],
    isLoading: false,
    defaultFilter: undefined,
    saveFilter: vi.fn(),
    deleteFilter: vi.fn(),
    isSaving: false,
  }),
}));

describe('InboxFilters — nomes acessíveis nos seletores', () => {
  const baseProps = {
    filters: { status: [], tags: [], agentId: null, dateRange: { from: null, to: null } },
    onFiltersChange: vi.fn(),
    showAll: true,
    onShowAllChange: vi.fn(),
    onQueueChange: vi.fn(),
    onContactTypeChange: vi.fn(),
  };

  function abrirPopover() {
    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
  }

  it('o seletor de fila tem aria-label', () => {
    render(<InboxFilters {...baseProps} />);
    abrirPopover();
    expect(screen.getByRole('combobox', { name: 'Fila' })).toBeInTheDocument();
  });

  it('o seletor de agente tem aria-label', () => {
    render(<InboxFilters {...baseProps} />);
    abrirPopover();
    expect(screen.getByRole('combobox', { name: 'Agente' })).toBeInTheDocument();
  });

  it('o switch "mostrar todos" tem aria-label', () => {
    render(<InboxFilters {...baseProps} />);
    abrirPopover();
    expect(screen.getByRole('switch', { name: 'Mostrar todos' })).toBeInTheDocument();
  });

  it('o axe não acusa `button-name` com o painel de filtros aberto', async () => {
    render(<InboxFilters {...baseProps} />);
    abrirPopover();

    // O conteúdo do Popover do Radix vive em um portal preso ao <body>, fora do
    // container do render() — por isso o axe roda sobre o documento inteiro.
    const results = await axe(document.body, {
      runOnly: { type: 'rule', values: ['button-name'] },
    });

    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
