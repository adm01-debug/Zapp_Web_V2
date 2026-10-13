import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * B2 (12/10/2026) — cartão t_b8ea21c0, especialista Hugo (area-front-hooks).
 * Prova três coisas do gerente de conexões:
 *   (a) o telefone é validado/normalizado NO FRONT antes de chamar a Edge
 *       (DDD inexistente vira motivo na tela, não 400 do create-connection);
 *   (b) o code INSTANCE_GONE do delete-instance é estado a reconciliar, não
 *       erro: limpa o vínculo local e anuncia "Conexão removida";
 *   (c) desconectar/excluir/definir padrão invalidam os cards que exibem o
 *       status (talkx-connection-status / catalog-send-readiness).
 */
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  deleteFn: vi.fn(),
  eq: vi.fn(),
  updateFn: vi.fn(),
  updateEq: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
  toast: vi.fn(),
  createConnection: vi.fn(),
  deleteInstance: vi.fn(),
  disconnectInstance: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    rpc: (...args: unknown[]) => mocks.rpc(...args),
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

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: (...args: unknown[]) => mocks.createConnection(...args),
    connectInstance: vi.fn(),
    getInstanceStatus: vi.fn(),
    disconnectInstance: (...args: unknown[]) => mocks.disconnectInstance(...args),
    deleteInstance: (...args: unknown[]) => mocks.deleteInstance(...args),
  }),
}));

import { useConnectionsManager, type WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager';
import { queryClient } from '@/lib/queryClient';

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

async function definirTelefone(result: Awaited<ReturnType<typeof mount>>, phone_number: string) {
  await act(async () => {
    result.current.setNewConnection({ name: 'Vendas', phone_number });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: [CONNECTION], error: null });
  mocks.deleteFn.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockResolvedValue({ error: null });
  mocks.updateFn.mockReturnValue({ eq: mocks.updateEq });
  mocks.updateEq.mockResolvedValue({ error: null });
  mocks.from.mockImplementation(() => ({
    select: mocks.select,
    delete: mocks.deleteFn,
    update: mocks.updateFn,
  }));
  mocks.channel.mockImplementation(() => ({ on: () => ({ subscribe: () => ({}) }) }));
  mocks.rpc.mockResolvedValue({ data: 'c1', error: null });
  mocks.createConnection.mockResolvedValue({});
  mocks.deleteInstance.mockResolvedValue({ ok: true });
  mocks.disconnectInstance.mockResolvedValue({ ok: true });
});

describe('useConnectionsManager.handleAddConnection — telefone validado no front', () => {
  it('recusa DDD inexistente sem chamar a Edge e mostra o motivo', async () => {
    const result = await mount();
    await definirTelefone(result, '10987654321');

    await act(async () => { await result.current.handleAddConnection(); });

    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(toastTitles()).toContain('Número de telefone inválido');
    const chamadas = mocks.toast.mock.calls;
    const ultimo = chamadas[chamadas.length - 1]?.[0] as { description?: string };
    expect(ultimo.description).toContain('DDD 10');
  });

  it('recusa número curto demais sem chamar a Edge', async () => {
    const result = await mount();
    await definirTelefone(result, '11987');

    await act(async () => { await result.current.handleAddConnection(); });

    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(toastTitles()).toContain('Número de telefone inválido');
  });

  it('normaliza para E.164 (com o nono dígito) antes de criar a conexão', async () => {
    const result = await mount();
    await definirTelefone(result, '(11) 8765-4321');

    await act(async () => { await result.current.handleAddConnection(); });

    expect(mocks.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ phone_number: '+5511987654321' })
    );
    expect(toastTitles()).toContain('Conexão criada!');
  });
});

describe('useConnectionsManager.handleDelete — code INSTANCE_GONE', () => {
  it('trata INSTANCE_GONE como já removida: limpa o vínculo local e não anuncia erro', async () => {
    mocks.deleteInstance.mockRejectedValue(
      Object.assign(new Error('A instância não existe mais na Evolution API.'), { code: 'INSTANCE_GONE' })
    );
    const result = await mount();

    await act(async () => { await result.current.handleDelete(CONNECTION); });

    // A Edge já apagou a linha; o DELETE local roda como limpeza idempotente.
    expect(mocks.deleteFn).toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenCalledWith('id', 'c1');
    expect(toastTitles()).toContain('Conexão removida');
    expect(toastTitles()).not.toContain('Erro ao excluir');
  });

  it('erro real (sem code) continua erro: mantém a conexão e re-sincroniza', async () => {
    mocks.deleteInstance.mockRejectedValue(new Error('Evolution GO recusou a exclusão'));
    const result = await mount();

    await act(async () => { await result.current.handleDelete(CONNECTION); });

    expect(mocks.deleteFn).not.toHaveBeenCalled();
    expect(toastTitles()).toContain('Erro ao excluir');
  });
});

describe('useConnectionsManager — invalida o status exibido nos cards', () => {
  it('excluir invalida talkx-connection-status e catalog-send-readiness', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const result = await mount();

    await act(async () => { await result.current.handleDelete(CONNECTION); });

    expect(spy).toHaveBeenCalledWith({ queryKey: ['talkx-connection-status'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['catalog-send-readiness'] });
    spy.mockRestore();
  });

  it('desconectar invalida o status exibido', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const result = await mount();

    await act(async () => { await result.current.handleDisconnect(CONNECTION); });

    expect(mocks.disconnectInstance).toHaveBeenCalledWith('inst-1');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['talkx-connection-status'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['catalog-send-readiness'] });
    spy.mockRestore();
  });

  it('definir padrão invalida o status exibido', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const result = await mount();

    await act(async () => { await result.current.handleSetDefault('c1'); });

    expect(mocks.rpc).toHaveBeenCalledWith('set_default_whatsapp_connection', { p_connection_id: 'c1' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['talkx-connection-status'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['catalog-send-readiness'] });
    spy.mockRestore();
  });
});
