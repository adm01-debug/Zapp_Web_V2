import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InboxFilters } from '@/components/inbox/InboxFilters';

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
});