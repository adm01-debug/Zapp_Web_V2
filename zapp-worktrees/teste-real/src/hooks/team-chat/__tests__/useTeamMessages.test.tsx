import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão: `team_message_receipts.conversation_id` é NOT NULL (migration
 * 20260929440000_team_chat_e51_receipts_conversation_id_not_null_trigger.sql).
 * O upsert montado pelo hook precisa mandar a coluna, senão o Postgres rejeita
 * a linha e o recibo de leitura nunca é gravado.
 */
const f = vi.hoisted(() => ({
  upsert: vi.fn(() => Promise.resolve({ error: null })),
  membersUpdateEq: vi.fn(() => Promise.resolve({ error: null })),
  messages: [
    { id: 'm-2', sender_id: 'outro-profile', conversation_id: 'conv-1', content: 'oi' },
    { id: 'm-1', sender_id: 'profile-1', conversation_id: 'conv-1', content: 'meu' },
  ],
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: f.messages, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'team_message_receipts') {
        return { upsert: f.upsert };
      }
      return { update: () => ({ eq: () => ({ eq: f.membersUpdateEq }) }) };
    },
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: vi.fn(),
  },
}));

import { useTeamMessages } from '@/hooks/team-chat/useTeamMessages';

describe('useTeamMessages — recibo de leitura', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grava conversation_id em cada recibo (coluna NOT NULL)', () => {
    renderHook(() => useTeamMessages('conv-1'));

    expect(f.upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = f.upsert.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
      { onConflict: string },
    ];

    // Só a mensagem de outro remetente vira recibo.
    expect(payload).toHaveLength(1);
    expect(payload[0].message_id).toBe('m-2');
    expect(payload[0].profile_id).toBe('profile-1');
    expect(payload[0].status).toBe('read');
    expect(payload[0]).toMatchObject({ conversation_id: 'conv-1' });
    expect(options).toEqual({ onConflict: 'message_id,profile_id' });
  });
});
