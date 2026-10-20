import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { openMenu } from './contactDeleteFixtures';

type Result = { data?: unknown; error: unknown };

const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  updates: [] as { payload: Record<string, unknown>; filter: [string, unknown] }[],
  tagsById: {} as Record<string, string[]>,
  updateError: null as unknown,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: db.rpc,
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          single: async (): Promise<Result> => ({ data: { tags: db.tagsById[id] ?? [] }, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        const record = (filter: [string, unknown]): Promise<Result> => {
          db.updates.push({ payload, filter });
          return Promise.resolve({ error: db.updateError });
        };
        return {
          eq: (col: string, value: unknown) => record([col, value]),
          in: (col: string, values: unknown) => record([col, values]),
        };
      },
    }),
  },
}));

import { BulkActionsBar } from '../BulkActionsBar';

function setup(extra: Partial<React.ComponentProps<typeof BulkActionsBar>> = {}) {
  const props = {
    selectedIds: ['a', 'b'],
    onClearSelection: vi.fn(),
    onActionComplete: vi.fn(),
    onCountersChanged: vi.fn(),
    availableTags: ['vip'],
    availableAgents: [{ id: 'ag-1', name: 'Bia' }],
    ...extra,
  };
  render(<BulkActionsBar {...props} />);
  return props;
}

function pick(trigger: RegExp, item: string) {
  openMenu(screen.getByRole('button', { name: trigger }));
  fireEvent.click(screen.getByRole('menuitem', { name: item }));
}

describe('BulkActionsBar — ações em lote (etapa 81)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.updates = [];
    db.tagsById = {};
    db.updateError = null;
  });

  it('não renderiza sem seleção', () => {
    setup({ selectedIds: [] });
    expect(screen.queryByText(/selecionado/)).not.toBeInTheDocument();
  });

  it('Tag acrescenta a tag só em quem ainda não tem', async () => {
    db.tagsById = { a: ['antiga'], b: ['vip'] };
    const props = setup();
    pick(/^Tag$/, 'vip');

    await waitFor(() => expect(props.onActionComplete).toHaveBeenCalled());
    expect(db.updates).toEqual([{ payload: { tags: ['antiga', 'vip'] }, filter: ['id', 'a'] }]);
  });

  it('Atribuir grava assigned_to em todos os selecionados', async () => {
    const props = setup();
    pick(/Atribuir/, 'Bia');

    await waitFor(() => expect(props.onActionComplete).toHaveBeenCalled());
    expect(db.updates).toEqual([{ payload: { assigned_to: 'ag-1' }, filter: ['id', ['a', 'b']] }]);
    expect(toast.success).toHaveBeenCalledWith('2 contatos atribuídos a Bia');
  });

  it('Tipo grava contact_type e atualiza os contadores', async () => {
    const props = setup({ canChangeType: true });
    pick(/Tipo/, 'Fornecedor');

    await waitFor(() => expect(props.onCountersChanged).toHaveBeenCalled());
    expect(db.updates).toEqual([{ payload: { contact_type: 'fornecedor' }, filter: ['id', ['a', 'b']] }]);
  });

  it('Excluir usa a RPC delete_contacts (soft-delete), limpa a seleção e atualiza contadores', async () => {
    db.rpc.mockResolvedValue({ data: 2, error: null });
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /Excluir/ }));

    await waitFor(() => expect(props.onClearSelection).toHaveBeenCalled());
    expect(db.rpc).toHaveBeenCalledWith('delete_contacts', { p_ids: ['a', 'b'] });
    expect(db.updates).toEqual([]);
    expect(props.onCountersChanged).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('2 contatos removidos');
  });

  it('Excluir parcial avisa quantos o banco recusou', async () => {
    db.rpc.mockResolvedValue({ data: 1, error: null });
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Excluir/ }));

    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('1 de 2 contatos removidos', expect.anything()));
  });

  it.each([
    ['0 linhas', { data: 0, error: null }],
    ['null', { data: null, error: null }],
  ])('Excluir com RPC devolvendo %s é falha: não limpa seleção nem anuncia sucesso', async (_name, response) => {
    db.rpc.mockResolvedValue(response);
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /Excluir/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nenhum contato foi excluído. Verifique se você tem permissão.'));
    expect(props.onClearSelection).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
