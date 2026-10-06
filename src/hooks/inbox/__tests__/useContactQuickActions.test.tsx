import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useContactQuickActions } from '../useContactQuickActions';
import type { ConversationContact } from '@/types/chat';

const h = vi.hoisted(() => {
  const state = { error: null as { message: string } | null };
  const eq = vi.fn(() => Promise.resolve({ error: state.error }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  });
  return { state, eq, update, from, toast };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: h.from } }));
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
  await waitFor(() => expect(h.update.mock.calls.length).toBeGreaterThanOrEqual(2));
}

describe('useContactQuickActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.error = null;
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

  it('block grava a tag Bloqueado (idempotente) e o Desfazer a remove', async () => {
    const c = makeContact({ tags: [] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.block(); });
    expect(h.update).toHaveBeenCalledWith({ tags: ['Bloqueado'] });
    await clickUndo();
    expect(h.update).toHaveBeenLastCalledWith({ tags: [] });

    vi.clearAllMocks();
    const c2 = makeContact({ tags: ['Bloqueado'] });
    const { result: again } = renderHook(() => useContactQuickActions(c2));
    await act(async () => { await again.current.block(); });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast.info).toHaveBeenCalled();
  });

  it('archive grava conversation_status archived e o Desfazer restaura o status anterior', async () => {
    const c = makeContact({ conversation_status: 'pending' });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.archive(); });
    expect(h.update).toHaveBeenCalledWith({ conversation_status: 'archived' });
    expect(result.current.conversationStatus).toBe('archived');
    await clickUndo();
    expect(h.update).toHaveBeenLastCalledWith({ conversation_status: 'pending' });
    await waitFor(() => expect(result.current.conversationStatus).toBe('pending'));
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

  it('addTag preserva as existentes e removeTag tira só a pedida', async () => {
    const c = makeContact({ tags: ['Cliente', 'Raro'] });
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => { await result.current.addTag('  Novo  '); });
    expect(h.update).toHaveBeenCalledWith({ tags: ['Cliente', 'Raro', 'Novo'] });
    await act(async () => { await result.current.removeTag('Raro'); });
    expect(h.update).toHaveBeenLastCalledWith({ tags: ['Cliente', 'Novo'] });
  });
});
