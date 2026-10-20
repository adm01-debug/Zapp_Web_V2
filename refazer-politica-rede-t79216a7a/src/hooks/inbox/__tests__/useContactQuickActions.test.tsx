import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useContactQuickActions } from '../useContactQuickActions';
import type { ConversationContact } from '@/types/chat';

const h = vi.hoisted(() => {
  const state = {
    error: null as { message: string } | null,
    failNextUpdate: false,
    rows: {} as Record<string, unknown>,
    invokeError: null as { message: string } | null,
  };
  const eq = vi.fn(() => {
    if (state.failNextUpdate) {
      state.failNextUpdate = false;
      return Promise.resolve({ error: { message: 'check_violation' } });
    }
    return Promise.resolve({ error: state.error });
  });
  const update = vi.fn(() => ({ eq }));
  // Cadeia de select usada por useChatMediaSending/archiveContact:
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

describe('useContactQuickActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.error = null;
    h.state.failNextUpdate = false;
    h.state.invokeError = null;
    h.state.rows = {
      contacts: { assigned_to: 'agent-9', whatsapp_connection_id: 'conn-1' },
      whatsapp_connections: { instance_id: 'inst-1' },
    };
  });

  it('markVip grava a tag VIP em contacts.tags com UMA escrita', async () => {
    const c = makeContact({ tags: ['Cliente'] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.markVip(); });
    expect(h.from).toHaveBeenCalledWith('contacts');
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ tags: ['Cliente', 'VIP'] });
    expect(h.eq).toHaveBeenCalledWith('id', 'c1');
    expect(result.current.tags).toEqual(['Cliente', 'VIP']);
  });

  it('markVip é idempotente: "vip" já presente em outra caixa não duplica nem escreve', async () => {
    const c = makeContact({ tags: ['vip'] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.markVip(); });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast.info).toHaveBeenCalled();
    expect(result.current.tags).toEqual(['vip']);
  });

  it('o Desfazer do VIP executa a escrita reversa real (remove a tag)', async () => {
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.markVip(); });
    expect(h.update).toHaveBeenCalledWith({ tags: ['VIP'] });
    await clickUndo();
    expect(h.update).toHaveBeenLastCalledWith({ tags: [] });
    await waitFor(() => expect(result.current.tags).toEqual([]));
  });

  it('block bloqueia de verdade na Evolution (update-block-status) e grava a tag Bloqueado', async () => {
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
    expect(h.update).toHaveBeenCalledWith({ tags: ['Bloqueado'] });
    expect(result.current.tags).toEqual(['Bloqueado']);
  });

  it('o Desfazer do bloqueio chama unblock real na Evolution e remove a tag', async () => {
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    await clickUndo();
    await waitFor(() =>
      expect(invokeCalls().map((b) => b.status)).toEqual(['block', 'unblock']),
    );
    expect(h.update).toHaveBeenLastCalledWith({ tags: [] });
    await waitFor(() => expect(result.current.tags).toEqual([]));
  });

  it('block sem conexão resolvível: toast.error e nenhuma escrita nem chamada de bloqueio', async () => {
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
    expect(result.current.tags).toEqual([]);
  });

  it('erro na chamada de bloqueio: não grava a tag nem oferece Desfazer', async () => {
    h.state.invokeError = { message: 'edge 500' };
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    expect(h.toast.error).toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled(); // nenhum undoToast
    expect(result.current.tags).toEqual([]);
  });

  it('falha na escrita da tag após o bloqueio reverte o bloqueio real (não fica bloqueado invisível)', async () => {
    h.state.failNextUpdate = true; // a escrita da tag em contacts falha
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    await waitFor(() =>
      expect(invokeCalls().map((b) => b.status)).toEqual(['block', 'unblock']),
    );
    expect(h.toast.error).toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled(); // nenhum undoToast de sucesso
    expect(result.current.tags).toEqual([]);
  });

  it('block é idempotente: tag Bloqueado já presente não chama Evolution nem escreve', async () => {
    const c = makeContact({ tags: ['Bloqueado'] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast.info).toHaveBeenCalled();
  });

  it('dois cliques de Bloquear concorrentes disparam uma única chamada de bloqueio', async () => {
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => {
      await Promise.all([result.current.block(), result.current.block()]);
    });
    expect(invokeCalls().filter((b) => b.status === 'block')).toHaveLength(1);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('erro do banco vira toast.error, estado não muda e nenhum Desfazer é oferecido', async () => {
    h.state.error = { message: 'row-level security' };
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.markVip(); });
    expect(h.toast.error).toHaveBeenCalled();
    expect(result.current.tags).toEqual([]);
    // undoToast é a função `toast` em si (chamada direta); toast.error é método.
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('removeTag("Bloqueado") chama unblock real antes de remover a tag visual', async () => {
    const c = makeContact({ tags: ['Cliente', 'Bloqueado', 'VIP'] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.removeTag('bloqueado'); });
    expect(invokeCalls()).toContainEqual(
      expect.objectContaining({
        instanceName: 'inst-1',
        number: '5511999999999@s.whatsapp.net',
        status: 'unblock',
      }),
    );
    expect(h.update).toHaveBeenCalledWith({ tags: ['Cliente', 'VIP'] });
    expect(result.current.tags).toEqual(['Cliente', 'VIP']);
  });

  it('addTag("Bloqueado") redireciona para o bloqueio real; não grava como tag comum', async () => {
    const c = makeContact({ tags: ['Cliente'] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.addTag('  bloqueado  '); });
    expect(invokeCalls()).toContainEqual(
      expect.objectContaining({
        instanceName: 'inst-1',
        number: '5511999999999@s.whatsapp.net',
        status: 'block',
      }),
    );
    expect(h.update).toHaveBeenCalledWith({ tags: ['Cliente', 'Bloqueado'] });
    expect(h.update).not.toHaveBeenCalledWith({ tags: ['Cliente', 'bloqueado'] });
    expect(result.current.tags).toEqual(['Cliente', 'Bloqueado']);
  });

  it('addTag preserva as existentes e removeTag tira só a pedida', async () => {
    const c = makeContact({ tags: ['Cliente', 'Raro'] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.addTag('  Novo  '); });
    expect(h.update).toHaveBeenCalledWith({ tags: ['Cliente', 'Raro', 'Novo'] });
    await act(async () => { await result.current.removeTag('Raro'); });
    expect(h.update).toHaveBeenLastCalledWith({ tags: ['Cliente', 'Novo'] });
  });
});
