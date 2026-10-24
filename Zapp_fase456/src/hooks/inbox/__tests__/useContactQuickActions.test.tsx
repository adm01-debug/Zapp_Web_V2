import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useContactQuickActions } from '../useContactQuickActions';
import type { ConversationContact } from '@/types/chat';

const h = vi.hoisted(() => {
  const state = {
    error: null as { message: string } | null,
    rows: {} as Record<string, unknown>,
    invokeError: null as { message: string } | null,
  };
  const eq = vi.fn(() => Promise.resolve({ error: state.error }));
  const update = vi.fn(() => ({ eq }));
  // Cadeia de select usada por useChatMediaSending (resolvedor de instância):
  // select(...) → eq(...) → { maybeSingle | single | limit → maybeSingle }
  let currentTable = '';
  const terminal = (): Record<string, unknown> => ({
    maybeSingle: async () => ({ data: state.rows[currentTable] ?? null, error: null }),
    single: async () => ({ data: state.rows[currentTable] ?? null, error: null }),
    limit: () => terminal(),
  });
  const select = vi.fn(() => ({ eq: vi.fn(() => terminal()) }));
  const from = vi.fn((table: string) => {
    currentTable = table;
    return { update, select };
  });
  // supabase.functions.invoke — fronteira real do useEvolutionApiCore.callApi
  const invoke = vi.fn(async (_fn: string, _opts?: unknown) =>
    state.invokeError
      ? { data: null, error: state.invokeError }
      : { data: { ok: true }, error: null });
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  });
  return { state, eq, update, select, from, invoke, toast };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from, functions: { invoke: h.invoke } },
}));
vi.mock('sonner', () => ({ toast: h.toast }));

function makeContact(over: Partial<ConversationContact> = {}): ConversationContact {
  return {
    id: 'c1',
    name: 'Maria Silva',
    phone: '+5511999999999',
    tags: [],
    conversation_status: 'open',
    ...over,
  };
}

/** Clica no "Desfazer" do último undoToast emitido (o toast é mockado). */
async function clickUndo() {
  const call = h.toast.mock.calls[h.toast.mock.calls.length - 1];
  expect(call?.[1]?.action?.onClick).toBeTypeOf('function');
  await act(async () => {
    call[1].action.onClick();
  });
}

const invokeCalls = () =>
  h.invoke.mock.calls.map((c) => (c[1] as { body: Record<string, unknown> }).body);

describe('useContactQuickActions (ordem de 12/10: tags de contato não existem)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.error = null;
    h.state.invokeError = null;
    h.state.rows = {
      contacts: { assigned_to: 'agent-9', whatsapp_connection_id: 'conn-1' },
      whatsapp_connections: { instance_id: 'inst-1' },
    };
  });

  it('o hook não expõe tags nem as ações de tag/VIP (a função de tags não existe)', () => {
    const c = makeContact({ tags: ['Cliente', 'VIP', 'Bloqueado'] });
    const { result } = renderHook(() => useContactQuickActions(c));
    expect(result.current).not.toHaveProperty('tags');
    expect(result.current).not.toHaveProperty('addTag');
    expect(result.current).not.toHaveProperty('removeTag');
    expect(result.current).not.toHaveProperty('markVip');
  });

  it('block bloqueia de verdade na Evolution (update-block-status) e NÃO escreve em contacts', async () => {
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    // A instância é resolvida pelo fluxo real (contacts.whatsapp_connection_id
    // → whatsapp_connections.instance_id) e o bloqueio real vai para a edge.
    expect(h.from).toHaveBeenCalledWith('whatsapp_connections');
    expect(invokeCalls()).toContainEqual(
      expect.objectContaining({
        instanceName: 'inst-1',
        number: '5511999999999@s.whatsapp.net',
        status: 'block',
      }),
    );
    // Nenhuma coluna de tags é tocada: o hook não faz update nenhum em
    // contacts (a leitura de whatsapp_connection_id é do resolvedor de
    // instância, não deste hook).
    expect(h.update).not.toHaveBeenCalled();
  });

  it('o Desfazer do bloqueio chama unblock real na Evolution', async () => {
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    await clickUndo();
    expect(invokeCalls().map((b) => b.status)).toEqual(['block', 'unblock']);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('block sem conexão resolvível: toast.error e nenhuma chamada nem escrita', async () => {
    h.state.rows = {
      contacts: { assigned_to: 'agent-9', whatsapp_connection_id: null },
      whatsapp_connections: null, // nem a conexão do contato nem o fallback "connected"
    };
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalled();
  });

  it('erro na chamada de bloqueio: toast.error e nenhum Desfazer oferecido', async () => {
    h.state.invokeError = { message: 'edge 500' };
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    expect(h.toast.error).toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled(); // nenhum undoToast
    expect(h.update).not.toHaveBeenCalled();
  });

  it('dois cliques de Bloquear concorrentes disparam uma única chamada de bloqueio', async () => {
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => {
      await Promise.all([result.current.block(), result.current.block()]);
    });
    expect(invokeCalls().filter((b) => b.status === 'block')).toHaveLength(1);
  });
});
