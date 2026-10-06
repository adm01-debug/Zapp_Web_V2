export const MAX_TEAM_CHAT_FILE_SIZE = 10 * 1024 * 1024;

export type TeamChatFileSizeError = 'empty' | 'too-large' | null;

export function getTeamChatFileSizeError(size: number): TeamChatFileSizeError {
  if (size === 0) return 'empty';
  if (size > MAX_TEAM_CHAT_FILE_SIZE) return 'too-large';
  return null;
}

type ConversationType = 'direct' | 'group' | 'department';

export function canCreateTeamConversation({
  type,
  selectedMemberCount,
  selectedDepartmentId,
}: {
  type: ConversationType;
  selectedMemberCount: number;
  selectedDepartmentId: string | null;
}): boolean {
  if (type === 'department') return selectedDepartmentId !== null;
  if (type === 'group') return selectedMemberCount >= 2;
  return selectedMemberCount >= 1;
}

export function shouldNotifyTeamMessage({
  senderId,
  profileId,
  documentHidden,
  activeConversationId,
  conversationId,
  membership,
}: {
  senderId: string;
  profileId: string;
  documentHidden: boolean;
  activeConversationId: string | null;
  conversationId: string;
  membership: { is_muted: boolean | null } | null;
}): boolean {
  if (senderId === profileId) return false;
  if (!documentHidden && activeConversationId === conversationId) return false;
  return membership !== null && !membership.is_muted;
}

export function getTeamChatNotificationBody(mediaType: string | null, content: string): string {
  switch (mediaType) {
    case 'image':
      return '📷 Imagem';
    case 'audio':
    case 'audio_meme':
      return '🎤 Áudio';
    case 'video':
      return '🎥 Vídeo';
    case 'sticker':
      return '🎨 Figurinha';
    case 'document':
      return '📎 Documento';
    default:
      return content.slice(0, 100);
  }
}
