import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Prova do adiamento (snoozeConversation) quanto à ORDEM da gravação:
// a linha nova é inserida ANTES de a antiga ser removida, de modo que uma
// inserção recusada preserve o adiamento anterior. Também prova o aviso
// destrutivo quando a gravação falha.

function chain(result: Record<string, unknown>) {
  const obj: Record<string, unknown> = {};
  obj.eq = vi.fn(() => obj);
  obj.gt = vi.fn(() => obj);
  obj.order = vi.fn(() => obj);
  obj.single = vi.fn(() => obj);
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

const PROFILE_ID = 'profile-1';

let snoozeSelectResult: Record<string, unknown> = { data: [], error: null };
let snoozeInsertResult: Record<string, unknown> = { error: null };
const snoozeInsertCalls: unknown[] = [];
const snoozeDeleteCalls: Record<string, unknown>[] = [];
// Ordem global das escritas: prova que insert antecede delete.
const writeOrder: string[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: vi.fn(() => chain({ data: { id: PROFILE_ID }, error: null })) };
      }
      if (table === 'conversation_snoozes') {
        return {
          select: vi.fn(() => chain(snoozeSelectResult)),
          insert: vi.fn((payload: unknown) => {
            writeOrder.push('insert');
            snoozeInsertCalls.push(payload);
            return chain(snoozeInsertResult);
          }),
          delete: vi.fn(() => {
            const obj: Record<string, unknown> = {};
            const filters: Record<string, unknown> = {};
            obj.eq = vi.fn((column: string, value: unknown) => {
              filters[column] = value;
              return obj;
            });
            obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
              writeOrder.push('delete');
              snoozeDeleteCalls.push({ ...filters });
              return Promise.resolve({ error: null }).then(resolve, reject);
            };
            return obj;
          }),
        };
      }
      return { select: vi.fn(() => chain({ data: [], error: null })) };
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));

import { useConversationActions } from '@/hooks/chat/useConversationActions';
import { toast } from 'sonner';

let activeUnmount: (() => void) | null = null;

async function withProfileReady() {
  const rendered = renderHook(() => useConversationActions());
  activeUnmount = rendered.unmount;
  await waitFor(() => expect(rendered.result.current.profileId).toBe(PROFILE_ID));
  return rendered;
}

describe('useConversationActions — gravação do adiamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snoozeSelectResult = { data: [], error: null };
    snoozeInsertResult = { error: null };
    snoozeInsertCalls.length = 0;
    snoozeDeleteCalls.length = 0;
    writeOrder.length = 0;
  });

  afterEach(() => {
    activeUnmount?.();
    activeUnmount = null;
  });

  it('falha na gravação: avisa o usuário e NÃO remove o adiamento anterior', async () => {
    // Já existe um adiamento anterior; a inserção da nova linha é recusada.
    snoozeSelectResult = { data: [{ id: 'snooze-antigo' }], error: null };
    snoozeInsertResult = { error: { message: 'new row violates row-level security policy' } };
    const { result } = await withProfileReady();

    await act(async () => {
      await result.current.snoozeConversation('contact-1', 'nextweek');
    });

    // Aviso destrutivo claro.
    expect(toast.error).toHaveBeenCalledWith('Erro ao adiar conversa. Tente novamente.');
    // A inserção foi tentada; o delete da linha anterior NUNCA rodou.
    expect(writeOrder).toEqual(['insert']);
    expect(snoozeDeleteCalls).toEqual([]);
    // Nada de sucesso fictício nem estado otimista.
    expect(toast.success).not.toHaveBeenCalled();
    expect(result.current.isSnoozed('contact-1')).toBe(false);
  });

  it('sucesso: insere a nova linha e só depois remove a anterior, com aviso de êxito', async () => {
    snoozeSelectResult = { data: [{ id: 'snooze-antigo' }], error: null };
    const { result } = await withProfileReady();

    await act(async () => {
      await result.current.snoozeConversation('contact-1', 'nextweek');
    });

    expect(writeOrder).toEqual(['insert', 'delete']);
    expect(snoozeInsertCalls).toHaveLength(1);
    expect(snoozeDeleteCalls).toEqual([{ id: 'snooze-antigo' }]);
    expect(toast.success).toHaveBeenCalledWith('Conversa adiada');
    expect(result.current.isSnoozed('contact-1')).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('sem adiamento anterior: só insere (nada a remover) e não chama delete', async () => {
    snoozeSelectResult = { data: [], error: null };
    const { result } = await withProfileReady();

    await act(async () => {
      await result.current.snoozeConversation('contact-1', '1h');
    });

    expect(writeOrder).toEqual(['insert']);
    expect(snoozeDeleteCalls).toEqual([]);
    expect(result.current.isSnoozed('contact-1')).toBe(true);
  });
});
