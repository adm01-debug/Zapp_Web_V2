import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TC-010 (#165) — "marcação de leitura e envio podem perder estado após erro
 * silencioso" — revalidado em SL-016, quando a gravação passou a ser UMA RPC
 * (`mark_team_conversation_read`) em vez de dois writes separados.
 *
 * O hook fixava a chave em `markedRef` ANTES de concluir a gravação e
 * descartava o resultado (`.then()` sem callback). Resultado: um erro de
 * rede/RLS não era notado, a `markedRef` já estava avançada e o efeito NUNCA
 * mais tentava gravar — a conversa ficava "lida" só na tela, sem recibo no
 * banco, sem retentativa e sem log.
 *
 * A prova é a contagem de chamadas da RPC: com a falha, o ciclo seguinte tem de
 * tentar de novo (marcação não avançou); com o sucesso, o ciclo seguinte não
 * regrava (marcação avançou).
 */
const f = vi.hoisted(() => {
  const state = { failWrites: false, marcas: 0 };
  return {
    state,
    rpc: vi.fn((nome: string) => {
      if (nome !== 'mark_team_conversation_read') return Promise.resolve({ data: null, error: null });
      state.marcas += 1;
      return Promise.resolve({
        data: null,
        error: state.failWrites ? { message: 'rls negou' } : null,
      });
    }),
    messages: [
      { id: 'm-2', sender_id: 'outro-profile', conversation_id: 'conv-1', content: 'oi' },
      { id: 'm-1', sender_id: 'profile-1', conversation_id: 'conv-1', content: 'meu' },
    ],
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: f.messages, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: f.rpc,
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: vi.fn(),
  },
}));

import { useTeamMessages } from '@/hooks/team-chat/useTeamMessages';

// Deixa as promessas da gravação resolverem antes de observar o próximo ciclo.
const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

describe('useTeamMessages — persistência da marcação de leitura (TC-010/SL-016)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.state.failWrites = false;
    f.state.marcas = 0;
  });

  it('marca a leitura pela RPC e fixa a marcação: o ciclo seguinte não regrava', async () => {
    const { rerender } = renderHook(() => useTeamMessages('conv-1'));

    await waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(1));
    expect(f.rpc).toHaveBeenCalledWith('mark_team_conversation_read', {
      p_conversation_id: 'conv-1',
    });
    await flush();

    rerender();
    await flush();

    expect(f.rpc).toHaveBeenCalledTimes(1);
  });

  it('NÃO fixa a marcação quando a gravação falha — o ciclo seguinte tenta de novo', async () => {
    f.state.failWrites = true;
    const { rerender } = renderHook(() => useTeamMessages('conv-1'));

    await waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(1));
    await flush();

    // A gravação falhou (rede/RLS): a leitura não pode ficar marcada como
    // salva. O próximo ciclo do efeito tem de tentar gravar outra vez.
    rerender();
    await waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(2));
  });
});
