import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTeamChatPanel } from '../useTeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * TC-007 — o mute era LIDO de `user_settings.muted_conversations` (no painel) mas
 * ESCRITO em `team_conversation_members.is_muted` (em `useToggleMuteConversation`):
 * dois lugares diferentes, então o estado exibido não refletia o banco. A fonte
 * única passou a ser a membership. Estes dois testes provam a divergência: o valor
 * legado de `user_settings` é deliberadamente OPOSTO à membership e o painel precisa
 * seguir a membership.
 */
const h = vi.hoisted(() => ({
  settings: { muted_conversations: ['conv-a'] as string[] },
}));

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
  useUserSettings: () => ({ settings: h.settings, isLoading: false }),
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
  useTeamMessages: () => ({ messages: [], isLoading: false }),
}));

vi.mock('@/hooks/team-chat/useTeamMessageReactions', () => ({
  useTeamMessageReactions: () => ({}),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

const membro = (isMuted: boolean) => ({
  id: 'm1',
  conversation_id: 'conv-a',
  profile_id: 'user-1',
  joined_at: '2026-01-01T00:00:00Z',
  last_read_at: null,
  is_muted: isMuted,
});

const conversa = (isMuted: boolean): TeamConversation => ({
  id: 'conv-a',
  type: 'group',
  name: 'Grupo',
  avatar_url: null,
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  members: [membro(isMuted)],
});

describe('TC-007 — mute do Team Chat lê a membership (fonte única)', () => {
  it('mostra silenciada quando a membership diz is_muted=true (user_settings divergente e vazio)', () => {
    h.settings.muted_conversations = [];

    const { result } = renderHook(() => useTeamChatPanel(conversa(true)));

    expect(result.current.isMuted).toBe(true);
  });

  it('não mostra silenciada quando a membership diz is_muted=false (user_settings divergente listando a conversa)', () => {
    h.settings.muted_conversations = ['conv-a'];

    const { result } = renderHook(() => useTeamChatPanel(conversa(false)));

    expect(result.current.isMuted).toBe(false);
  });
});
