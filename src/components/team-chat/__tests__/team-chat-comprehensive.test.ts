import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_TEAM_CHAT_FILE_SIZE,
  canCreateTeamConversation,
  getTeamChatFileSizeError,
  getTeamChatNotificationBody,
  shouldNotifyTeamMessage,
} from '@/lib/teamChatRules';

const mutationsSrc = readFileSync(
  join(__dirname, '..', '..', '..', 'hooks', 'team-chat', 'useTeamChatMutations.ts'),
  'utf-8',
);

describe('Team Chat — autenticação', () => {
  it('useSendTeamMessage valida auth antes do insert', () => {
    const authIdx = mutationsSrc.indexOf("if (!profile) throw new Error('Not authenticated')");
    const sendIdx = mutationsSrc.indexOf("from('team_messages').insert");
    expect(authIdx).toBeGreaterThanOrEqual(0);
    expect(sendIdx).toBeGreaterThanOrEqual(0);
    expect(authIdx).toBeLessThan(sendIdx);
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
