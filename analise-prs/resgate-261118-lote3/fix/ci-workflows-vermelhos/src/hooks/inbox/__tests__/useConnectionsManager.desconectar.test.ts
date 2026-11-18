/**
 * t_cce2f0f7 — `useConnectionsManager.handleDisconnect` anunciava a falha DUAS
 * vezes (toast do `use-toast` aqui + toast do sonner dentro do `withToast` da
 * Evolution) e engolia o resultado, então o diálogo fechava como se a sessão
 * tivesse caído.
 *
 * O sujeito é o hook REAL; a dublagem é a fronteira de rede (Supabase), o
 * cliente Evolution e os avisos. Depois do conserto: uma única origem de
 * aviso (o sonner do `withToast`/`disconnectInstance`) e um retorno booleano
 * que a tela usa para decidir se fecha o diálogo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const m = vi.hoisted(() => ({
  rows: [] as unknown[],
  updateError: null as unknown,
  disconnectInstance: vi.fn(),
  toast: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: m.rows, error: null }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: m.updateError }),
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
  createLogger: () => ({ error: m.logError, debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: vi.fn(),
    connectInstance: vi.fn(),
    getInstanceStatus: vi.fn(),
    disconnectInstance: m.disconnectInstance,
    deleteInstance: vi.fn(),
  }),
}));

import { useConnectionsManager, type WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager';

const CONEXAO: WhatsAppConnection = {
  id: 'A',
  name: 'Conexão A',
  phone_number: '5511999999999',
  instance_id: 'inst-A',
  status: 'connected',
  qr_code: null,
  is_default: true,
  created_at: '2026-10-05T00:00:00.000Z',
};

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
  m.updateError = null;
});

describe('useConnectionsManager — desconectar', () => {
  it('sucesso derruba a instância, marca a conexão e devolve true — sem toast duplicado', async () => {
    m.disconnectInstance.mockResolvedValue(undefined);
    const result = await mount();

    let retorno: boolean | undefined;
    await act(async () => {
      retorno = await result.current.handleDisconnect(CONEXAO);
    });

    expect(m.disconnectInstance).toHaveBeenCalledWith('inst-A');
    expect(retorno).toBe(true);
    // O aviso é um só: o sonner do `withToast` dentro de `disconnectInstance`.
    expect(m.toast).not.toHaveBeenCalled();
  });

  it('a Evolution recusa: devolve false, registra o erro e não anuncia de novo pelo use-toast', async () => {
    m.disconnectInstance.mockRejectedValue(new Error('Evolution GO indisponível'));
    const result = await mount();

    let retorno: boolean | undefined;
    await act(async () => {
      retorno = await result.current.handleDisconnect(CONEXAO);
    });

    expect(retorno).toBe(false);
    expect(m.logError).toHaveBeenCalled();
    // Nada de segundo toast: quem avisa é o withToast da Evolution.
    expect(m.toast).not.toHaveBeenCalled();
  });

  it('o vínculo local não atualiza: devolve false e re-sincroniza o estado real', async () => {
    m.disconnectInstance.mockResolvedValue(undefined);
    m.updateError = { message: 'sem permissão' };
    const result = await mount();

    let retorno: boolean | undefined;
    await act(async () => {
      retorno = await result.current.handleDisconnect(CONEXAO);
    });

    expect(retorno).toBe(false);
    expect(m.logError).toHaveBeenCalled();
    expect(m.toast).not.toHaveBeenCalled();
  });

  it('conexão sem instance_id não chama a Evolution e devolve false (nada caiu)', async () => {
    const result = await mount();

    let retorno: boolean | undefined;
    await act(async () => {
      retorno = await result.current.handleDisconnect({ ...CONEXAO, instance_id: null });
    });

    expect(m.disconnectInstance).not.toHaveBeenCalled();
    expect(retorno).toBe(false);
  });
});
