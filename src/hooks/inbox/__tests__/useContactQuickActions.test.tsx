import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useContactQuickActions } from '../useContactQuickActions';
import type { ConversationContact } from '@/types/chat';

const h = vi.hoisted(() => {
  const state = {
    rpcError: null as { message: string } | null,
    failNextRpc: false,
    rows: {} as Record<string, unknown>,
    invokeError: null as { message: string } | null,
  };
  // Cadeia de select usada por useChatMediaSending (contacts →
  // whatsapp_connections.instance_id), a mesma do bloqueio real.
  let currentTable = '';
  const terminal = (): Record<string, unknown> => ({
    maybeSingle: async () => ({ data: state.rows[currentTable] ?? null, error: null }),
    single: async () => ({ data: state.rows[currentTable] ?? null, error: null }),
    limit: () => terminal(),
  });
  const select = vi.fn(() => ({ eq: vi.fn(() => terminal()) }));
  const from = vi.fn((table: string) => {
    currentTable = table;
    return { select };
  });
  // supabase.rpc — fronteira real das RPCs set_contact_vip / set_contact_blocked
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (state.failNextRpc) {
      state.failNextRpc = false;
      return { data: null, error: { message: 'check_violation' } };
    }
    if (state.rpcError) return { data: null, error: state.rpcError };
    const data = fn === 'set_contact_blocked'
      ? (args.p_blocked ? '2026-01-01T00:00:00.000Z' : null)
      : true;
    return { data, error: null };
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
  return { state, select, from, rpc, invoke, toast };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from, functions: { invoke: h.invoke }, rpc: h.rpc },
}));
vi.mock('sonner', () => ({ toast: h.toast }));

function makeContact(over: Partial<ConversationContact> = {}): ConversationContact {
  return {
    id: 'c1',
    name: 'Maria Silva',
    phone: '5511999999999',
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

describe('useContactQuickActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.rpcError = null;
    h.state.failNextRpc = false;
    h.state.invokeError = null;
    h.state.rows = {
      contacts: { assigned_to: 'agent-9', whatsapp_connection_id: 'conn-1' },
      whatsapp_connections: { instance_id: 'inst-1' },
    };
  });

  it('markVip marca o VIP pela RPC set_contact_vip (nunca escreve contacts.tags)', async () => {
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.markVip(); });
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith('set_contact_vip', { p_contact_id: 'c1', p_is_vip: true });
    // Nenhum update direto em contacts (tags não existem mais no produto).
    expect(h.from).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isVip).toBe(true));
  });

  it('markVip é idempotente: já VIP não chama a RPC nem oferece Desfazer', async () => {
    const c = makeContact({ is_vip: true });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.markVip(); });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.toast.info).toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(result.current.isVip).toBe(true);
  });

  it('o Desfazer do VIP executa a RPC reversa real (p_is_vip=false)', async () => {
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.markVip(); });
    expect(h.rpc).toHaveBeenLastCalledWith('set_contact_vip', { p_contact_id: 'c1', p_is_vip: true });
    await clickUndo();
    expect(h.rpc).toHaveBeenLastCalledWith('set_contact_vip', { p_contact_id: 'c1', p_is_vip: false });
    await waitFor(() => expect(result.current.isVip).toBe(false));
  });

  it('block bloqueia de verdade na Evolution e grava blocked_at pela RPC', async () => {
    const c = makeContact();
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
    expect(h.rpc).toHaveBeenCalledWith('set_contact_blocked', { p_contact_id: 'c1', p_blocked: true });
    await waitFor(() => expect(result.current.blockedAt).toBeTruthy());
  });

  it('o Desfazer do bloqueio chama unblock real na Evolution e limpa blocked_at pela RPC', async () => {
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    await clickUndo();
    await waitFor(() =>
      expect(invokeCalls().map((b) => b.status)).toEqual(['block', 'unblock']),
    );
    expect(h.rpc).toHaveBeenLastCalledWith('set_contact_blocked', { p_contact_id: 'c1', p_blocked: false });
    await waitFor(() => expect(result.current.blockedAt).toBeNull());
  });

  it('block sem conexão resolvível: toast.error e nenhuma RPC nem chamada de bloqueio', async () => {
    h.state.rows = {
      contacts: { assigned_to: 'agent-9', whatsapp_connection_id: null },
      whatsapp_connections: null, // nem a conexão do contato nem o fallback "connected"
    };
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalled();
    expect(result.current.blockedAt).toBeNull();
  });

  it('erro na chamada de bloqueio: não grava blocked_at nem oferece Desfazer', async () => {
    h.state.invokeError = { message: 'edge 500' };
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    expect(h.toast.error).toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled(); // nenhum undoToast
    expect(result.current.blockedAt).toBeNull();
  });

  it('falha na RPC após o bloqueio reverte o bloqueio real (não fica bloqueado invisível)', async () => {
    h.state.failNextRpc = true; // a RPC set_contact_blocked falha
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    await waitFor(() =>
      expect(invokeCalls().map((b) => b.status)).toEqual(['block', 'unblock']),
    );
    expect(h.toast.error).toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled(); // nenhum undoToast de sucesso
    expect(result.current.blockedAt).toBeNull();
  });

  it('block é idempotente: blocked_at já preenchido não chama Evolution nem RPC', async () => {
    const c = makeContact({ blocked_at: '2026-01-01T00:00:00.000Z' });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.toast.info).toHaveBeenCalled();
    expect(result.current.blockedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('dois cliques de Bloquear concorrentes disparam uma única chamada de bloqueio', async () => {
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => {
      await Promise.all([result.current.block(), result.current.block()]);
    });
    expect(invokeCalls().filter((b) => b.status === 'block')).toHaveLength(1);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it('erro da RPC no VIP vira toast.error, estado não muda e nenhum Desfazer é oferecido', async () => {
    h.state.rpcError = { message: 'row-level security' };
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.markVip(); });
    expect(h.toast.error).toHaveBeenCalled();
    expect(result.current.isVip).toBe(false);
    // undoToast é a função `toast` em si (chamada direta); toast.error é método.
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('o hook não expõe mais tags/addTag/removeTag (função removida do produto)', () => {
    const { result } = renderHook(() => useContactQuickActions(makeContact()));
    expect(Object.keys(result.current).sort()).toEqual(['block', 'blockedAt', 'isVip', 'markVip']);
  });
});
