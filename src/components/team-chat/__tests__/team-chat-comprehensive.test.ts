import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_TEAM_CHAT_FILE_SIZE,
  canCreateTeamConversation,
  getTeamChatFileSizeError,
  getTeamChatNotificationBody,
  shouldNotifyTeamMessage,
} from '@/lib/teamChatRules';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * O bloco de autenticacao lia `useTeamChatMutations.ts` como TEXTO
 * (`readFileSync` + `indexOf`) e comparava a posicao das strings. Isso nao
 * exercita o hook: passa com o guard removido (a string ainda existe no
 * arquivo) e quebra com qualquer reformatacao. Aqui a fronteira Supabase e
 * dublada e o hook de producao e CHAMADO.
 */
const f = vi.hoisted(() => {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  return { inserts, perfil: { id: 'eu', role: 'admin' } as { id: string; role: string } | null };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const no: Record<string, unknown> = {};
      no.insert = (payload: Record<string, unknown>) => {
        f.inserts.push({ table, payload });
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'msg-1' }, error: null }) }) };
      };
      no.update = () => no;
      no.eq = () => no;
      return no;
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: f.perfil }) }));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { useSendTeamMessage } from '@/hooks/team-chat/useTeamChatMutations';

describe('Team Chat — autenticação', () => {
  beforeEach(() => {
    f.inserts.length = 0;
  });

  it('useSendTeamMessage recusa o envio sem perfil e não chega ao banco', async () => {
    f.perfil = null;
    const { result } = renderHook(() => useSendTeamMessage(), { wrapper: TestQueryWrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ conversationId: 'conversa', content: 'oi' }),
      ).rejects.toThrow('Not authenticated');
    });

    expect(f.inserts).toEqual([]);
  });

  it('useSendTeamMessage grava a mensagem quando há perfil', async () => {
    f.perfil = { id: 'eu', role: 'admin' };
    const { result } = renderHook(() => useSendTeamMessage(), { wrapper: TestQueryWrapper });

    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'conversa', content: 'oi' });
    });

    expect(f.inserts).toHaveLength(1);
    expect(f.inserts[0].table).toBe('team_messages');
    expect(f.inserts[0].payload.sender_id).toBe('eu');
  });
});

describe('Team Chat — regras usadas pela produção', () => {
  const notification = {
    senderId: 'colega', profileId: 'eu', documentHidden: false,
    activeConversationId: 'outra', conversationId: 'conversa',
    membership: { is_muted: false },
  };

  it.each([
    ['própria', { senderId: 'eu' }, false],
    ['ativa e visível', { activeConversationId: 'conversa' }, false],
    ['ativa, documento oculto', { activeConversationId: 'conversa', documentHidden: true }, true],
    ['sem membership', { membership: null }, false],
    ['silenciada', { membership: { is_muted: true } }, false],
    ['mute nulo', { membership: { is_muted: null } }, true],
  ] as const)('decide notificação: %s', (_caso, change, expected) => {
    expect(shouldNotifyTeamMessage({ ...notification, ...change })).toBe(expected);
  });

  it.each([
    ['image', '📷 Imagem'], ['audio', '🎤 Áudio'], ['audio_meme', '🎤 Áudio'],
    ['video', '🎥 Vídeo'], ['sticker', '🎨 Figurinha'], ['document', '📎 Documento'],
  ])('gera label para %s', (type, expected) => {
    expect(getTeamChatNotificationBody(type, 'texto')).toBe(expected);
  });

  it('usa e trunca o texto sem mídia ou com tipo desconhecido', () => {
    const content = 'a'.repeat(120);
    expect(getTeamChatNotificationBody(null, content)).toBe('a'.repeat(100));
    expect(getTeamChatNotificationBody('futuro', content)).toBe('a'.repeat(100));
  });

  it.each([
    ['direct', 0, null, false], ['direct', 1, null, true],
    ['group', 1, null, false], ['group', 2, null, true],
    ['department', 0, null, false], ['department', 0, 'dep-1', true],
  ] as const)('valida criação %s com %i membro(s)', (type, selectedMemberCount, selectedDepartmentId, expected) => {
    expect(canCreateTeamConversation({ type, selectedMemberCount, selectedDepartmentId })).toBe(expected);
  });

  it('rejeita arquivo vazio e acima de 10 MiB, mas aceita o limite', () => {
    expect(getTeamChatFileSizeError(0)).toBe('empty');
    expect(getTeamChatFileSizeError(MAX_TEAM_CHAT_FILE_SIZE)).toBeNull();
    expect(getTeamChatFileSizeError(MAX_TEAM_CHAT_FILE_SIZE + 1)).toBe('too-large');
  });
});

describe('Team Chat — lacunas sem prova comportamental', () => {
  it.todo('persistência e invalidação das mutations');
  it.todo('renderização de mídia, lista e acessibilidade');
});
