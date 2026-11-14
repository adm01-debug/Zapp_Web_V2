/**
 * Ordem de deploy (revisão do pacote 5): o front sai no merge e a RPC
 * `set_conversations_status` só nasce no apply da 20261113171300. Nesse
 * intervalo o banco responde PGRST202 e arquivar/desfazer não pode quebrar:
 * cai no UPDATE direto que o banco antigo ainda aceita.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  /** Estado de `contacts.conversation_status` no banco falso. */
  db: new Map<string, string>(),
  updates: [] as Array<{ patch: Record<string, unknown>; ids: string[]; eq?: [string, string] }>,
  rpc: vi.fn(),
}));

/**
 * FSM VIGENTE em produção antes da 20261113171300 (gatilho trg_contacts_fsm_transition,
 * corpo de 20260929560000; conferido com pg_get_functiondef em 2026-11-14). Transição
 * fora dela derruba o UPDATE inteiro com 23514, como no Postgres.
 */
const FSM_ANTIGA: Record<string, string[]> = {
  open: ['pending', 'waiting', 'resolved', 'closed', 'archived'],
  pending: ['open', 'waiting', 'resolved', 'closed', 'archived'],
  waiting: ['open', 'pending', 'resolved', 'closed', 'archived'],
  resolved: ['open', 'pending', 'closed', 'archived'],
  closed: ['open', 'pending', 'archived'],
  archived: ['open', 'pending'],
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => ({
          data: ids.filter((id) => mocks.db.has(id)).map((id) => ({ id, conversation_status: mocks.db.get(id) })),
          error: null,
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        in: (_col: string, ids: string[]) => {
          const call: { patch: Record<string, unknown>; ids: string[]; eq?: [string, string] } = { patch, ids };
          mocks.updates.push(call);
          const builder = {
            eq: (col: string, value: string) => {
              call.eq = [col, value];
              return builder;
            },
            select: async () => {
              const next = String(patch.conversation_status);
              const alvo = ids.filter((id) => mocks.db.has(id) && (!call.eq || mocks.db.get(id) === call.eq[1]));
              for (const id of alvo) {
                const atual = mocks.db.get(id) as string;
                if (atual !== next && !(FSM_ANTIGA[atual] ?? []).includes(next)) {
                  return {
                    data: null,
                    error: { code: '23514', message: `Invalid conversation_status transition: ${atual} -> ${next}` },
                  };
                }
              }
              for (const id of alvo) mocks.db.set(id, next);
              return { data: alvo.map((id) => ({ id })), error: null };
            },
          };
          return builder;
        },
      }),
    }),
    rpc: mocks.rpc,
  },
}));

import {
  archiveConversations,
  moveConversationsStatus,
  RESTORE_RESOLVED_UNAVAILABLE_MESSAGE,
  restoreConversationStatuses,
} from '../conversationArchive';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates = [];
  mocks.db = new Map();
  mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
});

describe('set_conversations_status ausente (PGRST202)', () => {
  it('arquivar cai no UPDATE direto e devolve o status anterior', async () => {
    mocks.db.set('c1', 'open');
    const anteriores = await archiveConversations(['c1']);
    expect(anteriores.get('c1')).toBe('open');
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0].patch.conversation_status).toBe('archived');
    expect(mocks.updates[0].ids).toEqual(['c1']);
  });

  it('com expectedCurrent só atualiza quem ainda está nesse estado', async () => {
    mocks.db.set('c1', 'open');
    mocks.db.set('c2', 'waiting');
    const moved = await moveConversationsStatus(['c1', 'c2'], 'archived', 'open');
    expect(mocks.updates[0].ids).toEqual(['c1']);
    expect(mocks.updates[0].eq).toEqual(['conversation_status', 'open']);
    expect([...moved.entries()]).toEqual([['c1', 'open']]);
    expect(mocks.db.get('c2')).toBe('waiting');
  });

  it('desfazer de encerrada (restore) é recusado sem mexer no status', async () => {
    mocks.db.set('c1', 'archived');
    await expect(moveConversationsStatus(['c1'], 'resolved', 'archived', true)).rejects.toThrow(
      RESTORE_RESOLVED_UNAVAILABLE_MESSAGE,
    );
    expect(mocks.updates).toHaveLength(0);
    expect(mocks.db.get('c1')).toBe('archived');
  });

  it('Desfazer de aberta devolve a open pelo UPDATE direto', async () => {
    mocks.db.set('c1', 'archived');
    mocks.db.set('c2', 'open'); // reaberta por mensagem nova: não é tocada
    await restoreConversationStatuses(
      new Map([
        ['c1', 'open'],
        ['c2', 'open'],
      ]),
    );
    expect(Object.fromEntries(mocks.db)).toEqual({ c1: 'open', c2: 'open' });
    expect(mocks.updates.map((u) => u.ids)).toEqual([['c1']]);
  });

  it('erro diferente de PGRST202 continua sendo erro (sem fallback)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sem permissão' } });
    mocks.db.set('c1', 'open');
    await expect(moveConversationsStatus(['c1'], 'archived')).rejects.toMatchObject({ code: '42501' });
    expect(mocks.updates).toHaveLength(0);
  });
});
