import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTeamChatPanel } from '../useTeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * SL-082 — a busca do painel filtrava SÓ as mensagens já carregadas (as mais
 * novas + as páginas abertas): um termo que só existia numa mensagem antiga
 * nunca era achado e o contador mentia. Agora o termo vai ao servidor pela RPC
 * `search_team_messages`, que varre a conversa inteira.
 *
 * O teste usa uma mensagem carregada ('bom dia') que NÃO contém o termo e uma
 * mensagem antiga ('contrato assinado') que só existe no retorno do servidor:
 * antes da correção a lista filtrada voltava vazia.
 */
const h = vi.hoisted(() => {
  const rpc = vi.fn();
  const carregadas = [
    {
      id: 'm-nova', conversation_id: 'conv-a', sender_id: 'user-2', content: 'bom dia',
      message_type: 'text', media_url: null, media_type: null, reply_to_id: null,
      is_edited: false, status: 'sent', created_at: '2026-10-08T12:00:00+00:00',
      updated_at: '2026-10-08T12:00:00+00:00',
      sender: { id: 'user-2', name: 'Bia', avatar_url: null },
    },
  ];
  return { rpc, carregadas };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', role: 'admin' } }),
}));

vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false,
    currentMessageId: null, voiceId: 'v1', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({ settings: {}, isLoading: false }),
}));

vi.mock('@/hooks/chat/useTeamChat', () => ({
  useSendTeamMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTeamMessage: () => ({ mutateAsync: vi.fn() }),
  useEditTeamMessage: () => ({ mutateAsync: vi.fn() }),
  useToggleMuteConversation: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/team-chat/useTeamChatMutations', () => ({
  useRenameConversation: () => ({ mutateAsync: vi.fn() }),
  useRemoveConversationMember: () => ({ mutateAsync: vi.fn() }),
  useLeaveConversation: () => ({ mutateAsync: vi.fn() }),
  useDeleteConversation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/team-chat/useTeamMessages', () => ({
  useTeamMessages: () => ({ messages: h.carregadas, isLoading: false }),
}));

vi.mock('@/hooks/team-chat/useTeamMessageReactions', () => ({
  useTeamMessageReactions: () => ({ aggregate: () => [], toggle: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: h.rpc, from: vi.fn(), storage: { from: vi.fn() } },
}));

const convA = { id: 'conv-a', type: 'group' } as TeamConversation;

/** Deixa o debounce de 400 ms da busca vencer e os microtasks do RPC correrem. */
async function esperarDebounce() {
  await act(async () => { await new Promise(r => setTimeout(r, 500)); });
}

describe('useTeamChatPanel — busca server-side (SL-082)', () => {
  beforeEach(() => { h.rpc.mockReset(); });

  it('manda o termo ao servidor e exibe a mensagem antiga que não está carregada', async () => {
    h.rpc.mockResolvedValue({
      data: [
        {
          id: 'm-antiga', sender_id: 'user-3', content: 'contrato assinado',
          created_at: '2026-01-05T09:00:00+00:00', sender_name: 'Ana',
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useTeamChatPanel(convA));
    act(() => { result.current.setSearchQuery('contrato'); });
    await esperarDebounce();

    expect(h.rpc).toHaveBeenCalledWith('search_team_messages', {
      p_conversation_id: 'conv-a',
      p_query: 'contrato',
      p_limit: 50,
    });
    // O termo não existe em nenhuma mensagem carregada: só o servidor podia achar.
    expect(result.current.filteredMessages.map(m => m.id)).toEqual(['m-antiga']);
    expect(result.current.filteredMessages[0].sender?.name).toBe('Ana');
  });

  it('sem termo não chama o servidor e mantém as mensagens carregadas', async () => {
    const { result } = renderHook(() => useTeamChatPanel(convA));
    await esperarDebounce();

    expect(h.rpc).not.toHaveBeenCalled();
    expect(result.current.filteredMessages.map(m => m.id)).toEqual(['m-nova']);
  });

  it('não anuncia resultado antes da resposta: fica "buscando" e a lista vazia', async () => {
    let liberarResposta: (v: { data: unknown[]; error: null }) => void = () => {};
    h.rpc.mockImplementation(() => new Promise(res => { liberarResposta = res as typeof liberarResposta; }));

    const { result } = renderHook(() => useTeamChatPanel(convA));
    act(() => { result.current.setSearchQuery('contrato'); });
    await esperarDebounce();

    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(result.current.isSearching).toBe(true);
    expect(result.current.filteredMessages).toEqual([]);

    await act(async () => { liberarResposta({ data: [], error: null }); });

    expect(result.current.isSearching).toBe(false);
  });
});
