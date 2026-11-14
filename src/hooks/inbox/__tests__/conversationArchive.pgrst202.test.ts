/**
 * Ordem de deploy (revisão do pacote 5): o front sai no merge e a RPC
 * `set_conversations_status` só nasce no apply da 20261113171300. Nesse
 * intervalo o banco responde PGRST202 e arquivar/desfazer não pode quebrar:
 * cai no UPDATE direto que o banco antigo ainda aceita.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  statuses: [] as Array<{ id: string; conversation_status: string }>,
  updated: [] as Array<{ id: string }>,
  updates: [] as Array<{ patch: Record<string, unknown>; ids: string[]; eq?: [string, string] }>,
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async () => ({ data: mocks.statuses, error: null }),
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
            select: async () => ({ data: mocks.updated, error: null }),
          };
          return builder;
        },
      }),
    }),
    rpc: mocks.rpc,
  },
}));

import { archiveConversations, moveConversationsStatus } from '../conversationArchive';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates = [];
  mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
});

describe('set_conversations_status ausente (PGRST202)', () => {
  it('arquivar cai no UPDATE direto e devolve o status anterior', async () => {
    mocks.statuses = [{ id: 'c1', conversation_status: 'open' }];
    mocks.updated = [{ id: 'c1' }];
    const anteriores = await archiveConversations(['c1']);
    expect(anteriores.get('c1')).toBe('open');
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0].patch.conversation_status).toBe('archived');
    expect(mocks.updates[0].ids).toEqual(['c1']);
  });

  it('com expectedCurrent só atualiza quem ainda está nesse estado', async () => {
    mocks.statuses = [
      { id: 'c1', conversation_status: 'archived' },
      { id: 'c2', conversation_status: 'open' },
    ];
    mocks.updated = [{ id: 'c1' }];
    const moved = await moveConversationsStatus(['c1', 'c2'], 'resolved', 'archived', true);
    expect(mocks.updates[0].ids).toEqual(['c1']);
    expect(mocks.updates[0].eq).toEqual(['conversation_status', 'archived']);
    expect([...moved.entries()]).toEqual([['c1', 'archived']]);
  });

  it('erro diferente de PGRST202 continua sendo erro (sem fallback)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sem permissão' } });
    mocks.statuses = [{ id: 'c1', conversation_status: 'open' }];
    await expect(moveConversationsStatus(['c1'], 'archived')).rejects.toMatchObject({ code: '42501' });
    expect(mocks.updates).toHaveLength(0);
  });
});
