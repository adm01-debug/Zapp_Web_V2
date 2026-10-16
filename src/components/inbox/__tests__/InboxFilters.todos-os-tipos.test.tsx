import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { InboxFilters, InboxFiltersState } from '@/components/inbox/InboxFilters';

/**
 * Painel de filtros da Inbox:
 *  - 'Todos os tipos' é ausência de filtro: escolhê-lo entrega `null` (antes
 *    entregava a string 'all', que o badge contava como filtro ativo e o botão
 *    inicial não marcava).
 *  - Os botões-alternância (status, tipo de contato, período) anunciam o estado
 *    com `aria-pressed`, agrupados por `role="group"` com rótulo.
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
  useQueues: () => ({ queues: [], loading: false }),
}));

const SEM_FILTROS: InboxFiltersState = {
  status: [],
  tags: [],
  agentId: null,
  dateRange: { from: null, to: null },
};

function abrirPopover() {
  fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
}

/** O badge do gatilho é o único lugar onde o texto '1' aparece. */
function badgeDoGatilho() {
  const gatilho = screen.getByRole('button', { name: /Filtros/ });
  return within(gatilho).queryByText('1');
}

function renderFiltros(props: Partial<ComponentProps<typeof InboxFilters>> = {}) {
  return render(
    <InboxFilters
      filters={SEM_FILTROS}
      onFiltersChange={vi.fn()}
      selectedContactType={null}
      onContactTypeChange={vi.fn()}
      {...props}
    />,
  );
}

describe('InboxFilters — "Todos os tipos" não conta como filtro', () => {
  it('sem tipo escolhido o badge não aparece e "Todos os tipos" fica pressionado', () => {
    renderFiltros({ selectedContactType: null });
    abrirPopover();

    expect(badgeDoGatilho()).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Todos os tipos', pressed: true }),
    ).toBeInTheDocument();
  });

  it('com um tipo escolhido o badge mostra 1 e o tipo fica pressionado', () => {
    renderFiltros({ selectedContactType: 'cliente' });
    abrirPopover();

    expect(badgeDoGatilho()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Clientes', pressed: true })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Todos os tipos', pressed: false }),
    ).toBeInTheDocument();
  });

  it("o valor legado 'all' também conta como ausência de filtro", () => {
    renderFiltros({ selectedContactType: 'all' });
    abrirPopover();

    expect(badgeDoGatilho()).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Todos os tipos', pressed: true }),
    ).toBeInTheDocument();
  });

  it('escolher "Todos os tipos" entrega null, e não a string "all"', () => {
    const onContactTypeChange = vi.fn();
    renderFiltros({ selectedContactType: 'cliente', onContactTypeChange });
    abrirPopover();

    fireEvent.click(screen.getByRole('button', { name: 'Todos os tipos' }));

    expect(onContactTypeChange).toHaveBeenCalledWith(null);
  });

  it('escolher "Parceiros" entrega o valor parceiro', () => {
    const onContactTypeChange = vi.fn();
    renderFiltros({ onContactTypeChange });
    abrirPopover();

    fireEvent.click(screen.getByRole('button', { name: 'Parceiros' }));

    expect(onContactTypeChange).toHaveBeenCalledWith('parceiro');
  });
});

describe('InboxFilters — estado acessível das alternâncias', () => {
  it('as alternâncias ficam em grupos rotulados', () => {
    renderFiltros();
    abrirPopover();

    expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Tipo de Contato' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Período' })).toBeInTheDocument();
  });

  it('o status marcado se anuncia como pressionado e alterna ao clicar', () => {
    const onFiltersChange = vi.fn();
    renderFiltros({ filters: { ...SEM_FILTROS, status: ['unread'] }, onFiltersChange });
    abrirPopover();

    const naoLidas = screen.getByRole('button', { name: /Não lidas/, pressed: true });
    expect(naoLidas).toBeInTheDocument();

    fireEvent.click(naoLidas);
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: [] }),
    );
  });
});
