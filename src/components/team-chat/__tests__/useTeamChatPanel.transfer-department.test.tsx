import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTeamChatPanel } from '../useTeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * Cartão "transferir conversa de departamento" (item 3): o seletor só pode
 * aparecer para quem já pode transferir (admin/supervisor, `canTransfer`) E numa
 * conversa de departamento — o vínculo da conversa é o próprio departamento, não
 * o criador. Uma conversa de grupo continua sem o flag, mesmo para admin.
 */
const h = vi.hoisted(() => ({ role: 'admin' as string }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', role: h.role } }),
}));

vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false,
    currentMessageId: null, voiceId: 'v1', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn(),
  }),
  LOCAL_VOICE_ID: 'local',
}));

vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({ settings: { muted_conversations: [] }, isLoading: false }),
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

const conversa = (type: TeamConversation['type']): TeamConversation => ({
  id: 'conv-a',
  type,
  name: 'Conversa',
  avatar_url: null,
  created_by: 'user-2',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  members: [
    {
      id: 'm1',
      conversation_id: 'conv-a',
      profile_id: 'user-1',
      joined_at: '2026-01-01T00:00:00Z',
      last_read_at: null,
      is_muted: false,
    },
  ],
});

describe('useTeamChatPanel — canTransferDepartment', () => {
  it('libera para admin numa conversa de departamento', () => {
    h.role = 'admin';
    const { result } = renderHook(() => useTeamChatPanel(conversa('department')));
    expect(result.current.canTransferDepartment).toBe(true);
  });

  it('libera para supervisor numa conversa de departamento', () => {
    h.role = 'supervisor';
    const { result } = renderHook(() => useTeamChatPanel(conversa('department')));
    expect(result.current.canTransferDepartment).toBe(true);
  });

  it('não libera conversa de grupo, mesmo para admin (o vínculo é o departamento)', () => {
    h.role = 'admin';
    const { result } = renderHook(() => useTeamChatPanel(conversa('group')));
    expect(result.current.canTransferDepartment).toBe(false);
  });

  it('não libera para agente numa conversa de departamento', () => {
    h.role = 'agent';
    const { result } = renderHook(() => useTeamChatPanel(conversa('department')));
    expect(result.current.canTransferDepartment).toBe(false);
  });
});
