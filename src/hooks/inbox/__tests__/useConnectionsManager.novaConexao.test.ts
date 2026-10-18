/**
 * Formulário de nova conexão — `useConnectionsManager.handleAddConnection`.
 *
 * O sujeito é o hook REAL; a dublagem é a fronteira de rede (Supabase) e o
 * cliente Evolution (`useEvolutionApi`), que grava o que o hook pede. Prova a
 * validação dos campos, o que vai no payload (nome da instância, `is_default`
 * só quando é a primeira) e o que a tela faz quando a criação falha.
 *
 * Cartão: falta teste do formulário de nova conexão na V2.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const m = vi.hoisted(() => ({
  rows: [] as unknown[],
  writeError: null as unknown,
  createConnection: vi.fn(),
  toast: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: m.rows, error: null }),
      }),
    }),
    channel: () => {
      const canal = { on: () => canal, subscribe: () => canal, unsubscribe: () => canal };
      return canal;
    },
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: m.toast }));
vi.mock('@/lib/logger', () => ({
  log: { error: m.logError, debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: m.createConnection,
    connectInstance: vi.fn(),
    getInstanceStatus: vi.fn(),
    disconnectInstance: vi.fn(),
    deleteInstance: vi.fn(),
  }),
}));

import { useConnectionsManager, type WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager';

const CONEXAO: WhatsAppConnection = {
  id: 'A',
  name: 'Conexão A',
  phone_number: '5511999999999',
  instance_id: 'inst-A',
  status: 'disconnected',
  qr_code: null,
  is_default: true,
  created_at: '2026-10-05T00:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function mount() {
  const { result } = renderHook(() => useConnectionsManager());
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.rows = [];
  m.createConnection.mockResolvedValue({ connection: null });
});

describe('useConnectionsManager — nova conexão', () => {
  it('nome vazio não cria nada e avisa o operador', async () => {
    const result = await mount();
    act(() => {
      result.current.setNewConnection({ name: '', phone_number: '5511999999999' });
      result.current.setIsAddDialogOpen(true);
    });

    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(m.createConnection).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro', variant: 'destructive' }),
    );
    expect(result.current.isAddDialogOpen).toBe(true);
  });

  it('telefone vazio não cria nada', async () => {
    const result = await mount();
    act(() => {
      result.current.setNewConnection({ name: 'Loja', phone_number: '' });
    });

    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(m.createConnection).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro' }));
  });

  it('sucesso cria a conexão como padrão (primeira), fecha o diálogo e limpa o formulário', async () => {
    const result = await mount();
    act(() => {
      result.current.setNewConnection({ name: 'Loja Centro', phone_number: '5511999999999' });
      result.current.setIsAddDialogOpen(true);
    });

    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(m.createConnection).toHaveBeenCalledTimes(1);
    const payload = m.createConnection.mock.calls[0][0];
    expect(payload).toMatchObject({
      name: 'Loja Centro',
      phone_number: '5511999999999',
      is_default: true, // única conexão
    });
    // Nome de instância é derivado do nome (slug) + sufixo numérico.
    expect(payload.instanceName).toMatch(/^loja_centro_\d{6}$/);

    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Conexão criada!' }),
    );
    expect(result.current.isAddDialogOpen).toBe(false);
    expect(result.current.newConnection).toEqual({ name: '', phone_number: '' });
    expect(result.current.isCreating).toBe(false);
  });

  it('com conexão já existente a nova não vira padrão', async () => {
    m.rows = [CONEXAO];
    const result = await mount();
    act(() => {
      result.current.setNewConnection({ name: 'Filial', phone_number: '5511888888888' });
    });

    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(m.createConnection.mock.calls[0][0]).toMatchObject({ is_default: false });
  });

  it('“Criando...” fica ligado enquanto o provedor não responde', async () => {
    const d = deferred<{ connection: null }>();
    m.createConnection.mockReturnValue(d.promise);

    const result = await mount();
    act(() => {
      result.current.setNewConnection({ name: 'Loja', phone_number: '5511999999999' });
    });

    let pendente: Promise<void> | undefined;
    await act(async () => {
      pendente = result.current.handleAddConnection();
    });
    expect(result.current.isCreating).toBe(true);

    await act(async () => {
      d.resolve({ connection: null });
      await pendente;
    });
    expect(result.current.isCreating).toBe(false);
  });

  it('falha ao criar mantém o diálogo aberto, mostra o motivo e nunca anuncia sucesso', async () => {
    m.createConnection.mockRejectedValue(new Error('Evolution GO indisponível'));

    const result = await mount();
    act(() => {
      result.current.setNewConnection({ name: 'Loja', phone_number: '5511999999999' });
      result.current.setIsAddDialogOpen(true);
    });

    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao criar conexão',
        description: 'Evolution GO indisponível',
        variant: 'destructive',
      }),
    );
    expect(m.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Conexão criada!' }));
    expect(result.current.isAddDialogOpen).toBe(true);
    expect(result.current.isCreating).toBe(false);
    expect(m.logError).toHaveBeenCalled();
  });

  it.todo('UI-07: telefone em formato inválido é bloqueado antes de criar (hoje só vazio é barrado)');
});
