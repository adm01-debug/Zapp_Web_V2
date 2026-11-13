/**
 * Decisão do dono (2026-11-13): conversa 'waiting' não pode ser arquivada.
 * Prova o helper canônico de arquivamento e os predicados usados pela tela.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  statuses: [] as Array<{ id: string; conversation_status: string }>,
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async () => ({ data: mocks.statuses, error: null }),
      }),
    }),
    rpc: mocks.rpc,
  },
}));

import {
  archiveConversations,
  canArchiveConversation,
  isWaitingArchiveError,
  WAITING_CANNOT_ARCHIVE_MESSAGE,
} from '../conversationArchive';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [{ contact_id: 'c1', previous_status: 'open' }], error: null });
});

describe('arquivar conversa aguardando (decisão do dono 2026-11-13)', () => {
  it('canArchiveConversation: waiting e archived não; open/resolved sim', () => {
    expect(canArchiveConversation('waiting')).toBe(false);
    expect(canArchiveConversation('archived')).toBe(false);
    expect(canArchiveConversation('open')).toBe(true);
    expect(canArchiveConversation('resolved')).toBe(true);
  });

  it('archiveConversations recusa antes de chamar o banco quando alguma está aguardando', async () => {
    mocks.statuses = [{ id: 'c1', conversation_status: 'waiting' }];
    await expect(archiveConversations(['c1'])).rejects.toThrow(WAITING_CANNOT_ARCHIVE_MESSAGE);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('archiveConversations segue normal para conversa em atendimento', async () => {
    mocks.statuses = [{ id: 'c1', conversation_status: 'open' }];
    const anteriores = await archiveConversations(['c1']);
    expect(anteriores.get('c1')).toBe('open');
    expect(mocks.rpc).toHaveBeenCalledWith('set_conversations_status', { p_contact_ids: ['c1'], p_next: 'archived' });
  });

  it('isWaitingArchiveError reconhece a recusa do banco e a do front', () => {
    expect(isWaitingArchiveError({ message: 'conversation_waiting_cannot_be_archived', code: '23514' })).toBe(true);
    expect(isWaitingArchiveError(new Error(WAITING_CANNOT_ARCHIVE_MESSAGE))).toBe(true);
    expect(isWaitingArchiveError(new Error('rede caiu'))).toBe(false);
    expect(isWaitingArchiveError(null)).toBe(false);
  });
});
