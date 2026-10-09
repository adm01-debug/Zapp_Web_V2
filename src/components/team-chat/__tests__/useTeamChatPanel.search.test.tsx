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
const convB = { id: 'conv-b', type: 'group' } as TeamConversation;

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

  it('falha da RPC vira estado de erro, não "busca sem resultado"', async () => {
    // O defeito recusado: a falha era gravada como `results: []`, indistinguível
    // de uma busca legítima que não achou nada — a tela anunciava "Nenhuma
    // mensagem encontrada" para um servidor fora do ar.
    h.rpc.mockResolvedValue({ data: null, error: { message: 'RPC indisponível' } });

    const { result } = renderHook(() => useTeamChatPanel(convA));
    act(() => { result.current.setSearchQuery('contrato'); });
    await esperarDebounce();

    // O erro é exposto como estado próprio...
    expect(result.current.searchError).toBeTruthy();
    expect(result.current.searchError).toMatch(/não foi possível buscar/i);
    // ...e a resposta (com falha) NÃO deixa a tela presa em "buscando".
    expect(result.current.isSearching).toBe(false);
    // A lista vazia não é o veredito da busca: o aviso de erro é.
    expect(result.current.filteredMessages).toEqual([]);
  });

  it('a falha some quando a busca seguinte é bem-sucedida', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'RPC indisponível' } });
    const { result } = renderHook(() => useTeamChatPanel(convA));
    act(() => { result.current.setSearchQuery('contrato'); });
    await esperarDebounce();
    expect(result.current.searchError).toBeTruthy();

    h.rpc.mockResolvedValue({
      data: [{ id: 'm-antiga', sender_id: 'user-3', content: 'contrato assinado', created_at: '2026-01-05T09:00:00+00:00', sender_name: 'Ana' }],
      error: null,
    });
    act(() => { result.current.setSearchQuery('contrato renova'); });
    await esperarDebounce();

    expect(result.current.searchError).toBeNull();
    expect(result.current.filteredMessages.map(m => m.id)).toEqual(['m-antiga']);
  });

  it('a mesma busca que falhou não deixa o aviso na tela quando o servidor responde', async () => {
    // Trocar de conversa NÃO remonta o painel nem apaga o termo digitado: o efeito
    // roda de novo com o mesmo termo e a resposta chega. Enquanto a busca da
    // conversa nova está EM VOO, o aviso de falha da conversa anterior não pode
    // estar na tela (o painel é o mesmo componente, sem `key`).
    h.rpc.mockResolvedValue({ data: null, error: { message: 'RPC indisponível' } });
    const { result, rerender } = renderHook(
      ({ conv }: { conv: TeamConversation }) => useTeamChatPanel(conv),
      { initialProps: { conv: convA } },
    );
    act(() => { result.current.setSearchQuery('contrato'); });
    await esperarDebounce();
    expect(result.current.searchError).toBeTruthy();
    expect(result.current.filteredMessages).toEqual([]);

    // A busca de convB fica pendente: é o estado intermediário que separa a
    // falha de convA do resultado de convB.
    let liberarConvB: (v: { data: unknown[]; error: null }) => void = () => {};
    h.rpc.mockImplementation(() => new Promise(res => { liberarConvB = res as typeof liberarConvB; }));
    rerender({ conv: convB });
    await esperarDebounce();

    expect(h.rpc).toHaveBeenLastCalledWith('search_team_messages', {
      p_conversation_id: 'conv-b',
      p_query: 'contrato',
      p_limit: 50,
    });
    expect(result.current.searchError).toBeNull();
    expect(result.current.isSearching).toBe(true);
    expect(result.current.filteredMessages).toEqual([]);

    await act(async () => {
      liberarConvB({
        data: [{ id: 'm-b', sender_id: 'user-4', content: 'contrato novo', created_at: '2026-10-09T09:00:00+00:00', sender_name: 'Caio' }],
        error: null,
      });
    });

    expect(result.current.searchError).toBeNull();
    expect(result.current.isSearching).toBe(false);
    expect(result.current.filteredMessages.map(m => m.id)).toEqual(['m-b']);
  });

  it('resultado da conversa anterior não vaza para a conversa nova enquanto a busca dela está pendente', async () => {
    h.rpc.mockResolvedValue({
      data: [{ id: 'm-a', sender_id: 'user-3', content: 'contrato assinado', created_at: '2026-01-05T09:00:00+00:00', sender_name: 'Ana' }],
      error: null,
    });
    const { result, rerender } = renderHook(
      ({ conv }: { conv: TeamConversation }) => useTeamChatPanel(conv),
      { initialProps: { conv: convA } },
    );
    act(() => { result.current.setSearchQuery('contrato'); });
    await esperarDebounce();
    expect(result.current.filteredMessages.map(m => m.id)).toEqual(['m-a']);

    // O mesmo termo continua digitado em convB, cuja busca ainda não respondeu.
    let liberarConvB: (v: { data: unknown[]; error: null }) => void = () => {};
    h.rpc.mockImplementation(() => new Promise(res => { liberarConvB = res as typeof liberarConvB; }));
    rerender({ conv: convB });
    await esperarDebounce();

    expect(result.current.filteredMessages).toEqual([]);
    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      liberarConvB({
        data: [{ id: 'm-b', sender_id: 'user-4', content: 'contrato novo', created_at: '2026-10-09T09:00:00+00:00', sender_name: 'Caio' }],
        error: null,
      });
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.filteredMessages.map(m => m.id)).toEqual(['m-b']);
  });
});
