import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { useTeamChatPanel } from '../useTeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * TC-006 / SL-016 — a página ANTERIOR vinha de um `select` direto em
 * `team_messages` com embed de `profiles`
 * (`sender:profiles!team_messages_sender_id_fkey(...)`). A RLS de `profiles` é
 * 'own + admin', então para o agente o embed voltava `sender: null` e as
 * mensagens antigas apareciam sem nome nem foto. A paginação passa a usar a
 * mesma RPC achatada do histórico novo (`get_team_messages_page`), que resolve
 * o remetente no servidor (`sender_name`/`sender_avatar`), e o cursor composto
 * vai como `p_before_id`.
 */
const f = vi.hoisted(() => {
  const rpcCalls: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const tabelasLidas: string[] = [];
  const primeiraPagina = [
    {
      id: 'm-old-2', conversation_id: 'conv-a', sender_id: 'user-9', content: 'antiga 2',
      message_type: 'text', reply_to_id: null, media_url: null, media_type: null,
      media_bucket: null, media_path: null, is_edited: false,
      created_at: '2026-10-04T10:00:00+00:00', updated_at: '2026-10-04T10:00:00+00:00',
      sender_name: 'Zeca', sender_avatar: 'https://cdn.example/avatar-zeca.png',
    },
    {
      id: 'm-old-1', conversation_id: 'conv-a', sender_id: 'user-8', content: 'antiga 1',
      message_type: 'text', reply_to_id: null, media_url: null, media_type: null,
      media_bucket: null, media_path: null, is_edited: false,
      created_at: '2026-10-04T09:00:00+00:00', updated_at: '2026-10-04T09:00:00+00:00',
      sender_name: 'Ana', sender_avatar: 'https://cdn.example/avatar-ana.png',
    },
  ];
  // A RPC devolve DESC (mais novas primeiro) e JÁ achatada.
  const rpcResult: { data: unknown[]; error: null } = { data: primeiraPagina, error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'lt', 'or', 'order', 'limit', 'neq', 'in']) {
    builder[m] = (...args: unknown[]) => { void args; return builder; };
  }
  (builder as { then?: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return { rpcCalls, tabelasLidas, rpcResult, primeiraPagina, builder };
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
  useTeamMessages: () => ({
    // Mensagem mais nova já carregada: é ela que vira o cursor (`p_before_id`).
    messages: [{
      id: 'm-new', conversation_id: 'conv-a', sender_id: 'user-2', content: 'nova',
      message_type: 'text', media_url: null, media_type: null, reply_to_id: null,
      is_edited: false, created_at: '2026-10-04T12:00:00+00:00', updated_at: '2026-10-04T12:00:00+00:00',
    }],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/team-chat/useTeamMessageReactions', () => ({
  useTeamMessageReactions: () => ({ aggregate: () => [], toggle: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (nome: string, args: Record<string, unknown>) => {
      f.rpcCalls.push({ nome, args });
      return Promise.resolve(f.rpcResult);
    },
    from: (tabela: string) => {
      f.tabelasLidas.push(tabela);
      return f.builder;
    },
    storage: { from: vi.fn() },
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: vi.fn(),
  },
}));

const convA = { id: 'conv-a', type: 'group' } as TeamConversation;

describe('useTeamChatPanel — paginação usa cursor composto (created_at, id)', () => {
  beforeEach(() => {
    f.rpcCalls.length = 0;
    f.tabelasLidas.length = 0;
    f.rpcResult.data = [...f.primeiraPagina];
  });

  it('busca mensagens anteriores pelo cursor composto (id da mais antiga) via p_before_id, não por filtro created_at no cliente', async () => {
    const { result } = renderHook(() => useTeamChatPanel(convA));

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.fetchOlderMessages(); });

    const chamada = f.rpcCalls.find(c => c.nome === 'get_team_messages_page');
    expect(chamada, 'a paginação deve usar a RPC get_team_messages_page').toBeTruthy();
    expect(chamada!.args).toEqual({
      p_conversation_id: 'conv-a',
      // O `id` do cursor composto é o que o servidor usa como keyset.
      p_before_id: 'm-new',
      p_limit: 60,
    });
    // O caminho antigo (select direto com embed de profiles) não pode mais existir.
    expect(f.tabelasLidas, 'não deve haver leitura direta de team_messages').toEqual([]);
  });

  it('não volta a ler team_messages com embed de profiles (regressão do remetente nulo)', () => {
    const src = readFileSync(resolve('src/components/team-chat/useTeamChatPanel.ts'), 'utf8');
    expect(src).not.toContain("from('team_messages')");
    expect(src).not.toContain('team_messages_sender_id_fkey');
    expect(src).not.toContain('.or(`created_at.lt.');
  });

  it('traz nome e foto do remetente nas mensagens antigas, em ordem ASC', async () => {
    const { result } = renderHook(() => useTeamChatPanel(convA));

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.fetchOlderMessages(); });

    const ids = result.current.messages.map(m => m.id);
    expect(ids).toEqual(['m-old-1', 'm-old-2', 'm-new']);

    const antiga = result.current.messages.find(m => m.id === 'm-old-1');
    expect(antiga?.sender).toEqual({
      id: 'user-8',
      name: 'Ana',
      avatar_url: 'https://cdn.example/avatar-ana.png',
    });
  });

  it('avança o cursor a cada página e para quando a página volta vazia', async () => {
    const { result } = renderHook(() => useTeamChatPanel(convA));

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.fetchOlderMessages(); });
    expect(result.current.hasOlderMessages).toBe(true);

    f.rpcResult.data = [];
    await act(async () => { await result.current.fetchOlderMessages(); });

    const cursores = f.rpcCalls
      .filter(c => c.nome === 'get_team_messages_page')
      .map(c => c.args.p_before_id);
    // 1ª página: cursor inicial (mensagem mais nova); 2ª: a mais antiga recebida.
    expect(cursores).toEqual(['m-new', 'm-old-1']);
    expect(result.current.hasOlderMessages).toBe(false);
  });
});
