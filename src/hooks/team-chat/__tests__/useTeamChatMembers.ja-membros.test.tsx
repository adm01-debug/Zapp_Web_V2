import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * HZ2-017 — quando todos os escolhidos já eram membros, a mutação não inseria
 * nada mas anunciava "0 membro(s) adicionado(s)" como sucesso e invalidava o
 * cache. Aqui a fronteira mockada é o cliente Supabase e o toast.
 */
const h = vi.hoisted(() => ({
  insert: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: (...args: unknown[]) => h.insert(...args) }),
  },
}));

vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [], isLoading: false }) }));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => h.toastSuccess(...args),
    info: (...args: unknown[]) => h.toastInfo(...args),
    error: (...args: unknown[]) => h.toastError(...args),
  },
}));

import { useAddConversationMembers } from '@/hooks/team-chat/useTeamChatMembers';

const existing = new Set(['p1']);

function setup(onSuccess = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(
    () => useAddConversationMembers({ conversationId: 'c1', existingMemberIds: existing, onSuccess }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { ...view, invalidate, onSuccess };
}

beforeEach(() => {
  h.insert.mockReset();
  h.insert.mockResolvedValue({ error: null });
  h.toastSuccess.mockReset();
  h.toastInfo.mockReset();
  h.toastError.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useAddConversationMembers — todos já são membros (HZ2-017)', () => {
  it('avisa e não insere nem invalida o cache', async () => {
    const { result, invalidate, onSuccess } = setup();

    await act(async () => { await result.current.mutateAsync(['p1']); });

    expect(h.insert).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.toastInfo).toHaveBeenCalledWith('Esses usuários já fazem parte da conversa');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('quando há membro novo, insere, invalida e avisa quantos entraram', async () => {
    const { result, invalidate, onSuccess } = setup();

    await act(async () => { await result.current.mutateAsync(['p1', 'p2']); });

    expect(h.insert).toHaveBeenCalledTimes(1);
    expect(h.insert).toHaveBeenCalledWith([{ conversation_id: 'c1', profile_id: 'p2' }]);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(h.toastSuccess).toHaveBeenCalledWith('1 membro(s) adicionado(s)');
    expect(h.toastInfo).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(1);
  });
});
