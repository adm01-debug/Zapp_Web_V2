import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// TRA-005 / item 66 do BACKLOG_VERIFICADO:
//   "Excluir conexão pode esconder falha na GO e apagar o vínculo local".
// Prova que handleDelete (a) NÃO apaga o vínculo local quando a Evolution GO
// recusa a exclusão, (b) expõe "exclusão pendente" quando a GO apaga mas o
// vínculo local sobra, e (c) só confirma sucesso quando as duas etapas saem.
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  deleteFn: vi.fn(),
  eq: vi.fn(),
  channel: vi.fn(),
  toast: vi.fn(),
  deleteInstance: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    channel: (...args: unknown[]) => mocks.channel(...args),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/lib/logger', () => ({
  log: {
    error: (...args: unknown[]) => mocks.logError(...args),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock do hook da Evolution API: é ele quem rejeita quando a GO recusa a
// exclusão (withToast relança o erro de callApi — ver useEvolutionApiCore).
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: vi.fn(),
    connectInstance: vi.fn(),
    getInstanceStatus: vi.fn(),
    disconnectInstance: vi.fn(),
    deleteInstance: (...args: unknown[]) => mocks.deleteInstance(...args),
  }),
}));

import { useConnectionsManager, type WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager';

const CONNECTION: WhatsAppConnection = {
  id: 'c1',
  name: 'Vendas',
  phone_number: '5511999999999',
  instance_id: 'inst-1',
  status: 'connected',
  qr_code: null,
  is_default: true,
  created_at: '2026-10-05T00:00:00.000Z',
};

function toastTitles(): (string | undefined)[] {
  return mocks.toast.mock.calls.map((call) => (call[0] as { title?: string }).title);
}

async function mount() {
  const { result } = renderHook(() => useConnectionsManager());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: [CONNECTION], error: null });
  mocks.deleteFn.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockResolvedValue({ error: null });
  mocks.from.mockImplementation(() => ({ select: mocks.select, delete: mocks.deleteFn }));
  mocks.channel.mockImplementation(() => ({ on: () => ({ subscribe: () => ({}) }) }));
  mocks.deleteInstance.mockResolvedValue({ ok: true });
});

describe('useConnectionsManager.handleDelete (TRA-005)', () => {
  it('não apaga o vínculo local nem anuncia sucesso quando a GO recusa a exclusão', async () => {
    mocks.deleteInstance.mockRejectedValue(new Error('Evolution GO recusou a exclusão'));
    const result = await mount();

    await act(async () => {
      await result.current.handleDelete(CONNECTION);
    });

    expect(mocks.deleteInstance).toHaveBeenCalledWith('inst-1');
    // Defeito original: catch vazio engolia a rejeição e o DELETE local rodava.
    expect(mocks.deleteFn).not.toHaveBeenCalled();
    expect(toastTitles()).not.toContain('Conexão removida');
    expect(toastTitles()).toContain('Erro ao excluir');
    // Vínculo local preservado (estado recuperável).
    expect(result.current.connections.map((c) => c.id)).toContain('c1');
  });

  it('marca exclusão pendente quando a GO apaga a instância mas o vínculo local permanece', async () => {
    mocks.deleteInstance.mockResolvedValue({ ok: true });
    mocks.eq.mockResolvedValue({ error: { message: 'permission denied' } });
    const result = await mount();

    await act(async () => {
      await result.current.handleDelete(CONNECTION);
    });

    expect(mocks.deleteInstance).toHaveBeenCalledWith('inst-1');
    expect(toastTitles()).toContain('Exclusão pendente');
    expect(toastTitles()).not.toContain('Conexão removida');
    expect(result.current.connections.map((c) => c.id)).toContain('c1');
  });

  it('confirma a exclusão só quando a GO e o vínculo local saem', async () => {
    mocks.deleteInstance.mockResolvedValue({ ok: true });
    mocks.eq.mockResolvedValue({ error: null });
    const result = await mount();

    await act(async () => {
      await result.current.handleDelete(CONNECTION);
    });

    expect(mocks.deleteInstance).toHaveBeenCalledWith('inst-1');
    expect(toastTitles()).toContain('Conexão removida');
    expect(toastTitles()).not.toContain('Exclusão pendente');
    expect(result.current.connections.map((c) => c.id)).not.toContain('c1');
  });

  it('linha órfã sem instance_id: apaga só o vínculo local, sem chamar a GO', async () => {
    const orphan: WhatsAppConnection = { ...CONNECTION, instance_id: null };
    const result = await mount();

    await act(async () => {
      await result.current.handleDelete(orphan);
    });

    expect(mocks.deleteInstance).not.toHaveBeenCalled();
    expect(mocks.deleteFn).toHaveBeenCalled();
    expect(toastTitles()).toContain('Conexão removida');
  });
});
