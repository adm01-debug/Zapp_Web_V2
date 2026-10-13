/**
 * t_8e895114 — "filtros salvos aparecem".
 *
 * O hook `useSavedFilters` existia desde sempre e não era usado em lugar
 * nenhum da inbox: o usuário podia salvar/reaplicar filtros no banco e não
 * havia tela para isso. Aqui a prova é a tela REAL (`InboxFilters`) sobre o
 * hook mockado com dados que vieram do banco.
 *
 * Cobre o que o revisor cobra: reaplicar devolve o período como `Date` (o JSON
 * do banco só guarda ISO) e o agente/fila/tipo de contato salvos voltam.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { InboxFilters, type InboxFiltersState } from '@/components/inbox/InboxFilters';
import type { SavedFilter } from '@/hooks/chat/useSavedFilters';

const saveFilter = vi.fn();
const deleteFilter = vi.fn();
let salvos: SavedFilter[] = [];

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: [{ id: 'ag-1', name: 'Ana' }] }),
}));

vi.mock('@/hooks/inbox/useInboxFilterTags', () => ({
  useInboxFilterTags: () => ({ data: [] }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: false }),
}));

vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: [{ id: 'q1', name: 'Suporte' }] }),
}));

vi.mock('@/hooks/chat/useSavedFilters', () => ({
  useSavedFilters: () => ({
    filters: salvos,
    isLoading: false,
    defaultFilter: salvos.find((f) => f.is_default),
    saveFilter,
    deleteFilter,
    isSaving: false,
  }),
}));

const VAZIO: InboxFiltersState = {
  status: [],
  tags: [],
  agentId: null,
  dateRange: { from: null, to: null },
};

const SALVO: SavedFilter = {
  id: 'f1',
  name: 'Não lidas de VIP',
  filters: {
    status: ['unread'],
    tags: ['t-vip'],
    agentId: 'ag-1',
    contactType: 'individual',
    queueId: 'q1',
    showAll: false,
    dateRange: {
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-07T23:59:59.999Z',
    },
  },
  is_default: true,
  is_shared: false,
  user_id: 'u1',
  created_at: '2026-10-01T00:00:00.000Z',
};

function abrirPopover() {
  fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
}

describe('InboxFilters — filtros salvos', () => {
  it('lista os filtros salvos e reaplica o que foi gravado', () => {
    salvos = [SALVO];
    const onFiltersChange = vi.fn();
    const onContactTypeChange = vi.fn();
    const onQueueChange = vi.fn();
    render(
      <InboxFilters
        filters={VAZIO}
        onFiltersChange={onFiltersChange}
        onContactTypeChange={onContactTypeChange}
        onQueueChange={onQueueChange}
      />,
    );
    abrirPopover();

    expect(screen.getByTestId('inbox-filtros-salvos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Não lidas de VIP' }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      status: ['unread'],
      tags: ['t-vip'],
      agentId: 'ag-1',
      dateRange: {
        from: new Date('2026-10-01T00:00:00.000Z'),
        to: new Date('2026-10-07T23:59:59.999Z'),
      },
    });
    expect(onContactTypeChange).toHaveBeenCalledWith('individual');
    expect(onQueueChange).toHaveBeenCalledWith('q1');
  });

  it('salva os filtros atuais com o nome digitado, datas em ISO', () => {
    salvos = [];
    saveFilter.mockClear();
    render(
      <InboxFilters
        filters={{
          status: ['unread'],
          tags: ['t-vip'],
          agentId: null,
          dateRange: { from: new Date('2026-10-01T00:00:00.000Z'), to: null },
        }}
        onFiltersChange={vi.fn()}
      />,
    );
    abrirPopover();

    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    fireEvent.change(screen.getByLabelText('Nome do filtro'), {
      target: { value: 'Minhas não lidas' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(saveFilter).toHaveBeenCalledWith({
      name: 'Minhas não lidas',
      filters: {
        status: ['unread'],
        tags: ['t-vip'],
        agentId: null,
        contactType: null,
        queueId: null,
        showAll: false,
        dateRange: { from: '2026-10-01T00:00:00.000Z', to: null },
      },
    });
    // o formulário fecha depois de salvar
    expect(screen.queryByLabelText('Nome do filtro')).not.toBeInTheDocument();
  });

  it('remove um filtro salvo pelo botão do item', () => {
    salvos = [SALVO];
    deleteFilter.mockClear();
    render(<InboxFilters filters={VAZIO} onFiltersChange={vi.fn()} />);
    abrirPopover();

    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Não lidas de VIP' }));
    expect(deleteFilter).toHaveBeenCalledWith('f1');
  });

  it('sem filtros salvos, avisa que não há nenhum', () => {
    salvos = [];
    render(<InboxFilters filters={VAZIO} onFiltersChange={vi.fn()} />);
    abrirPopover();

    expect(screen.getByText('Nenhum filtro salvo.')).toBeInTheDocument();
  });
});
