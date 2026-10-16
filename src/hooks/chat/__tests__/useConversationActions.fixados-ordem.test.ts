/**
 * Ordem das conversas fixadas (`loadPinned` do `useConversationActions`).
 *
 * O alvo é o HOOK REAL; a fronteira dublada é a rede (cliente Supabase). O dublê da
 * consulta grava cada `.order()` encadeado, então o caso prova a ORDEM que o hook pede
 * ao banco, não o que a tela desenha.
 *
 * Antes: `.select('contact_id').eq('pinned_by', pid)` sem `order` — o Postgres devolve as
 * linhas na ordem que quiser, então o conjunto de fixadas não tinha ordem estável entre
 * duas leituras (e o `position` gravado sempre 0 não servia de critério). Agora a leitura
 * pede `created_at` crescente com `contact_id` como desempate determinístico, e o
 * `pinnedIds` é montado nessa ordem.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const PROFILE_ID = 'profile-1';

const mocks = vi.hoisted(() => ({
  orders: [] as Array<[string, Record<string, unknown> | undefined]>,
  pinnedRows: [] as Array<{ contact_id: string }>,
}));

function resultChain(result: Record<string, unknown>) {
  const obj: Record<string, unknown> = {};
  obj.eq = vi.fn(() => obj);
  obj.gt = vi.fn(() => obj);
  obj.select = vi.fn(() => obj);
  obj.in = vi.fn(() => obj);
  obj.single = vi.fn(() => obj);
  obj.order = vi.fn((column: string, opts?: Record<string, unknown>) => {
    // Só a consulta de fixadas interessa aqui; as demais tabelas também encadeiam order.
    if (mocks.pinnedRows.length >= 0) mocks.orders.push([column, opts]);
    return obj;
  });
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: vi.fn(() => resultChain({ data: { id: PROFILE_ID }, error: null })) };
      }
      if (table === 'pinned_conversations') {
        return { select: vi.fn(() => resultChain({ data: mocks.pinnedRows, error: null })) };
      }
      if (table === 'favorite_contacts') {
        return { select: vi.fn(() => resultChain({ data: [], error: null })) };
      }
      if (table === 'conversation_snoozes') {
        return { select: vi.fn(() => resultChain({ data: [], error: null })) };
      }
      return { select: vi.fn(() => resultChain({ data: [], error: null })) };
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));

import { useConversationActions } from '@/hooks/chat/useConversationActions';

describe('useConversationActions — ordem das fixadas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orders.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lê as fixadas por created_at crescente com contact_id como desempate', async () => {
    mocks.pinnedRows = [{ contact_id: 'c2' }, { contact_id: 'c1' }];
    const { result, unmount } = renderHook(() => useConversationActions());

    await waitFor(() => expect(result.current.profileId).toBe(PROFILE_ID));
    await waitFor(() => expect(result.current.pinnedIds.size).toBe(2));

    expect(mocks.orders).toContainEqual(['created_at', { ascending: true }]);
    expect(mocks.orders).toContainEqual(['contact_id', { ascending: true }]);
    // O desempate é o ÚLTIMO critério: sem ele, duas linhas com o mesmo instante de
    // criação voltam em ordem indefinida entre duas leituras.
    expect(mocks.orders[mocks.orders.length - 1]).toEqual(['contact_id', { ascending: true }]);
    unmount();
  });

  it('monta o conjunto de fixadas na ordem que o banco devolveu', async () => {
    mocks.pinnedRows = [{ contact_id: 'c3' }, { contact_id: 'c1' }, { contact_id: 'c2' }];
    const { result, unmount } = renderHook(() => useConversationActions());

    await waitFor(() => expect(result.current.pinnedIds.size).toBe(3));

    expect([...result.current.pinnedIds]).toEqual(['c3', 'c1', 'c2']);
    unmount();
  });
});
