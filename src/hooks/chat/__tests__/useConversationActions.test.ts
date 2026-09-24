import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

function resultChain(result: Record<string, unknown>) {
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

let contactsSelectResult: Record<string, unknown> = { data: { assigned_to: 'agent-original' }, error: null };
let contactsUpdateResult: Record<string, unknown> = { error: null };
const contactsUpdateCalls: unknown[] = [];

let pinnedInsertResult: Record<string, unknown> = { error: null };
let pinnedDeleteResult: Record<string, unknown> = { error: null };
let favoriteInsertResult: Record<string, unknown> = { error: null };
let favoriteDeleteResult: Record<string, unknown> = { error: null };
let snoozeInsertResult: Record<string, unknown> = { error: null };
const snoozeInsertCalls: unknown[] = [];

// favoriteContact/unfavoriteContact disparam _favBus, que aciona um
// loadFavorites() assíncrono em segundo plano (sincroniza outras instâncias
// do hook). Sem refletir o estado real aqui, esse refetch sempre lia []
// e sobrescrevia o setFavoriteIds otimista numa corrida — precisa espelhar
// inserts/deletes de verdade, não só devolver um resultado fixo.
let fakeFavoriteRows: Array<{ contact_id: string }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: vi.fn(() => resultChain({ data: { id: PROFILE_ID }, error: null })) };
      }
      if (table === 'pinned_conversations') {
        return {
          select: vi.fn(() => resultChain({ data: [], error: null })),
          insert: vi.fn(() => resultChain(pinnedInsertResult)),
          delete: vi.fn(() => resultChain(pinnedDeleteResult)),
        };
      }
      if (table === 'favorite_contacts') {
        return {
          select: vi.fn(() => resultChain({ data: fakeFavoriteRows, error: null })),
          insert: vi.fn((payload: { contact_id: string }) => {
            if (!favoriteInsertResult.error) fakeFavoriteRows = [...fakeFavoriteRows, { contact_id: payload.contact_id }];
            return resultChain(favoriteInsertResult);
          }),
          delete: vi.fn(() => {
            const chain: Record<string, unknown> = {};
            let filterContactId: string | undefined;
            chain.eq = vi.fn((column: string, value: string) => {
              if (column === 'contact_id') filterContactId = value;
              return chain;
            });
            chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
              if (!favoriteDeleteResult.error) {
                fakeFavoriteRows = fakeFavoriteRows.filter((r) => r.contact_id !== filterContactId);
              }
              return Promise.resolve(favoriteDeleteResult).then(resolve, reject);
            };
            return chain;
          }),
        };
      }
      if (table === 'conversation_snoozes') {
        return {
          select: vi.fn(() => resultChain({ data: [], error: null })),
          delete: vi.fn(() => resultChain({ error: null })),
          insert: vi.fn((payload: unknown) => {
            snoozeInsertCalls.push(payload);
            return resultChain(snoozeInsertResult);
          }),
        };
      }
      if (table === 'contacts') {
        return {
          select: vi.fn(() => resultChain(contactsSelectResult)),
          update: vi.fn((payload: unknown) => {
            contactsUpdateCalls.push(payload);
            return resultChain(contactsUpdateResult);
          }),
        };
      }
      return { select: vi.fn(() => resultChain({ data: [], error: null })) };
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));

import { useConversationActions } from '@/hooks/chat/useConversationActions';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';

let activeUnmount: (() => void) | null = null;
function renderActionsHook() {
  const rendered = renderHook(() => useConversationActions());
  activeUnmount = rendered.unmount;
  return rendered;
}

async function withProfileReady() {
  const rendered = renderActionsHook();
  await waitFor(() => expect(rendered.result.current.profileId).toBe(PROFILE_ID));
  return rendered;
}

describe('useConversationActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactsSelectResult = { data: { assigned_to: 'agent-original' }, error: null };
    contactsUpdateResult = { error: null };
    contactsUpdateCalls.length = 0;
    pinnedInsertResult = { error: null };
    pinnedDeleteResult = { error: null };
    favoriteInsertResult = { error: null };
    favoriteDeleteResult = { error: null };
    fakeFavoriteRows = [];
    snoozeInsertResult = { error: null };
    snoozeInsertCalls.length = 0;
  });

  afterEach(() => {
    activeUnmount?.();
    activeUnmount = null;
    vi.useRealTimers();
  });

  describe('archiveContact', () => {
    it('desatribui o contato e oferece desfazer que restaura o assigned_to original', async () => {
      const { result } = await withProfileReady();

      await act(async () => {
        await result.current.archiveContact('contact-1');
      });

      expect(contactsUpdateCalls).toEqual([{ assigned_to: null }]);
      expect(undoToast).toHaveBeenCalledTimes(1);
      const undoArgs = (undoToast as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(undoArgs.message).toBe('Conversa arquivada');

      await act(async () => {
        await undoArgs.onUndo();
      });

      expect(contactsUpdateCalls).toEqual([
        { assigned_to: null },
        { assigned_to: 'agent-original' },
      ]);
    });

    it('em erro no update, mostra toast de erro e não oferece desfazer', async () => {
      contactsUpdateResult = { error: { message: 'falhou' } };
      const { result } = await withProfileReady();

      await act(async () => {
        await result.current.archiveContact('contact-1');
      });

      expect(toast.error).toHaveBeenCalledWith('Erro ao arquivar conversa');
      expect(undoToast).not.toHaveBeenCalled();
    });
  });

  describe('transferContact', () => {
    it('recusa transferência por conexão sem tocar o banco', async () => {
      const { result } = await withProfileReady();

      await act(async () => {
        await result.current.transferContact('contact-1', 'connection', 'conn-1');
      });

      expect(contactsUpdateCalls).toEqual([]);
      expect(toast.error).toHaveBeenCalledWith('Transferência por conexão ainda não é suportada');
    });

    it('transfere para outro atendente atualizando assigned_to', async () => {
      const { result } = await withProfileReady();

      await act(async () => {
        await result.current.transferContact('contact-1', 'agent', 'agent-2');
      });

      expect(contactsUpdateCalls).toEqual([{ assigned_to: 'agent-2' }]);
      expect(toast.success).toHaveBeenCalledWith('Chat transferido para outro atendente');
    });

    it('transfere para outra fila atualizando queue_id', async () => {
      const { result } = await withProfileReady();

      await act(async () => {
        await result.current.transferContact('contact-1', 'queue', 'queue-2');
      });

      expect(contactsUpdateCalls).toEqual([{ queue_id: 'queue-2' }]);
      expect(toast.success).toHaveBeenCalledWith('Chat transferido para outra fila');
    });

    it('em erro no update, mostra toast de erro', async () => {
      contactsUpdateResult = { error: { message: 'falhou' } };
      const { result } = await withProfileReady();

      await act(async () => {
        await result.current.transferContact('contact-1', 'agent', 'agent-2');
      });

      expect(toast.error).toHaveBeenCalledWith('Erro ao transferir conversa');
    });
  });

  describe('snoozeConversation', () => {
    // Ativa fake timers só DEPOIS do profileId carregar: withProfileReady()
    // usa waitFor (poll via setInterval real) internamente — sob fake timers
    // ela trava esperando um timer que nunca dispara. O restante das chamadas
    // do hook é só await de promises encadeadas (microtasks), que fake timers
    // não afeta.
    async function withProfileReadyAndFrozenClock(now: string) {
      const rendered = await withProfileReady();
      vi.useFakeTimers();
      vi.setSystemTime(new Date(now));
      return rendered;
    }

    it('1h adia por exatamente uma hora', async () => {
      const { result } = await withProfileReadyAndFrozenClock('2026-09-24T12:00:00Z');
      await act(async () => {
        await result.current.snoozeConversation('contact-1', '1h');
      });
      const payload = snoozeInsertCalls[0] as { snooze_until: string };
      const deltaMs = new Date(payload.snooze_until).getTime() - Date.now();
      expect(deltaMs).toBe(60 * 60 * 1000);
    });

    it('3h adia por exatamente três horas', async () => {
      const { result } = await withProfileReadyAndFrozenClock('2026-09-24T12:00:00Z');
      await act(async () => {
        await result.current.snoozeConversation('contact-1', '3h');
      });
      const payload = snoozeInsertCalls[0] as { snooze_until: string };
      const deltaMs = new Date(payload.snooze_until).getTime() - Date.now();
      expect(deltaMs).toBe(3 * 60 * 60 * 1000);
    });

    it('duração desconhecida cai no default de 1h', async () => {
      const { result } = await withProfileReadyAndFrozenClock('2026-09-24T12:00:00Z');
      await act(async () => {
        await result.current.snoozeConversation('contact-1', 'bogus');
      });
      const payload = snoozeInsertCalls[0] as { snooze_until: string };
      const deltaMs = new Date(payload.snooze_until).getTime() - Date.now();
      expect(deltaMs).toBe(60 * 60 * 1000);
    });

    it('tomorrow e nextweek marcam para as 9h e ficam no futuro', async () => {
      const { result } = await withProfileReadyAndFrozenClock('2026-09-24T12:00:00Z');

      await act(async () => {
        await result.current.snoozeConversation('contact-1', 'tomorrow');
      });
      const tomorrowPayload = snoozeInsertCalls[0] as { snooze_until: string };
      const tomorrowDate = new Date(tomorrowPayload.snooze_until);
      expect(tomorrowDate.getTime()).toBeGreaterThan(Date.now());
      expect(tomorrowDate.getHours()).toBe(9);

      await act(async () => {
        await result.current.snoozeConversation('contact-1', 'nextweek');
      });
      const nextweekPayload = snoozeInsertCalls[1] as { snooze_until: string };
      const nextweekDate = new Date(nextweekPayload.snooze_until);
      expect(nextweekDate.getTime()).toBeGreaterThan(tomorrowDate.getTime());
      expect(nextweekDate.getHours()).toBe(9);
    });

    it('atualiza snoozedIds após adiar com sucesso', async () => {
      const { result } = await withProfileReadyAndFrozenClock('2026-09-24T12:00:00Z');
      expect(result.current.isSnoozed('contact-1')).toBe(false);

      await act(async () => {
        await result.current.snoozeConversation('contact-1', '1h');
      });

      expect(result.current.isSnoozed('contact-1')).toBe(true);
    });
  });

  describe('pin/favorite', () => {
    it('pinConversation marca como fixado e mostra toast', async () => {
      const { result } = await withProfileReady();

      await act(async () => {
        await result.current.pinConversation('contact-1');
      });

      expect(result.current.isPinned('contact-1')).toBe(true);
      expect(toast.success).toHaveBeenCalledWith('Conversa fixada');
    });

    it('unpinConversation desfaz a fixação', async () => {
      const { result } = await withProfileReady();
      await act(async () => {
        await result.current.pinConversation('contact-1');
      });
      expect(result.current.isPinned('contact-1')).toBe(true);

      await act(async () => {
        await result.current.unpinConversation('contact-1');
      });
      expect(result.current.isPinned('contact-1')).toBe(false);
    });

    it('favoriteContact e unfavoriteContact alternam favoriteIds', async () => {
      const { result } = await withProfileReady();

      await act(async () => {
        await result.current.favoriteContact('contact-1');
      });
      // waitFor (não expect direto): favoriteContact dispara _favBus, que
      // aciona um loadFavorites() assíncrono em segundo plano — a asserção
      // precisa esperar esse refetch assentar, não só o retorno da própria
      // chamada.
      await waitFor(() => expect(result.current.isFavorite('contact-1')).toBe(true));

      await act(async () => {
        await result.current.unfavoriteContact('contact-1');
      });
      await waitFor(() => expect(result.current.isFavorite('contact-1')).toBe(false));
    });
  });
});
