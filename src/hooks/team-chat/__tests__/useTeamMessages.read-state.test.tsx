import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TC-010 (#165) — "marcação de leitura e envio podem perder estado após erro
 * silencioso".
 *
 * O hook fixava a chave em `markedRef` ANTES de concluir os writes e
 * descartava o resultado deles (`.then()` sem callback). Resultado: um erro de
 * rede/RLS no upsert do recibo não era notado, a `markedRef` já estava
 * avançada e o efeito NUNCA mais tentava gravar — a conversa ficava "lida" só
 * na tela, sem recibo no banco, sem retentativa e sem log.
 *
 * A prova é a contagem de escritas: com a falha, o ciclo seguinte tem de
 * tentar de novo (marcação não avançou); com o sucesso, o ciclo seguinte não
 * regrava (marcação avançou).
 */
const f = vi.hoisted(() => {
  const state = { failWrites: false, upserts: 0 };
  return {
    state,
    upsert: vi.fn(() => {
      state.upserts += 1;
      return Promise.resolve({ error: state.failWrites ? { message: 'rls negou' } : null });
    }),
    membersUpdate: vi.fn(() => Promise.resolve({ error: state.failWrites ? { message: 'rls negou' } : null })),
    messages: [
      { id: 'm-2', sender_id: 'outro-profile', conversation_id: 'conv-1', content: 'oi' },
      { id: 'm-1', sender_id: 'profile-1', conversation_id: 'conv-1', content: 'meu' },
    ],
  };
});

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
      return { update: () => ({ eq: () => ({ eq: f.membersUpdate }) }) };
    },
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: vi.fn(),
  },
}));

import { useTeamMessages } from '@/hooks/team-chat/useTeamMessages';

// Deixa as promessas dos writes resolverem antes de observar o próximo ciclo.
const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

describe('useTeamMessages — persistência do recibo de leitura (TC-010)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.state.failWrites = false;
    f.state.upserts = 0;
  });

  it('grava o recibo e fixa a marcação: o ciclo seguinte não regrava', async () => {
    const { rerender } = renderHook(() => useTeamMessages('conv-1'));

    await waitFor(() => expect(f.upsert).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(f.membersUpdate).toHaveBeenCalledTimes(1));
    await flush();

    rerender();
    await flush();

    expect(f.upsert).toHaveBeenCalledTimes(1);
    expect(f.membersUpdate).toHaveBeenCalledTimes(1);
  });

  it('NÃO fixa a marcação quando a gravação falha — o ciclo seguinte tenta de novo', async () => {
    f.state.failWrites = true;
    const { rerender } = renderHook(() => useTeamMessages('conv-1'));

    await waitFor(() => expect(f.upsert).toHaveBeenCalledTimes(1));
    await flush();

    // A gravação falhou (rede/RLS): a leitura não pode ficar marcada como
    // salva. O próximo ciclo do efeito tem de tentar gravar outra vez.
    rerender();
    await waitFor(() => expect(f.upsert).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(f.membersUpdate).toHaveBeenCalledTimes(2));
  });
});
