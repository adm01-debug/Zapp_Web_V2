import type { WhatsAppStatusMessage } from '@/hooks/integrations/useWhatsAppStatus';

/** Duração de cada story antes de avançar sozinho (5 s, como no WhatsApp). */
export const STORY_DURATION_MS = 5000;

export type StoryMediaKind = 'image' | 'video' | 'text';

/**
 * Chave estável de um status (usada para marcar visto e como `key` de lista).
 * O id vem do `key.id` da Evolution; sem ele, cai no id do registro/índice.
 * `index` é opcional para servir de identidade de dependência sem precisar da posição.
 */
export function storyKeyOf(message: WhatsAppStatusMessage, index = 0): string {
  return message.key?.id ?? message.messageId ?? message.id ?? `status-${index}`;
}

/** Tipo de mídia do status — o viewer só busca mídia sob demanda para imagem/vídeo. */
export function storyMediaKind(message: WhatsAppStatusMessage): StoryMediaKind {
  if (message.message?.videoMessage) return 'video';
  if (message.message?.imageMessage) return 'image';
  return 'text';
}

/** Legenda/texto do status, quando houver. */
export function storyCaption(message: WhatsAppStatusMessage): string | null {
  const media = message.message?.imageMessage ?? message.message?.videoMessage;
  const caption = media?.caption?.trim();
  if (caption) return caption;
  const text = message.message?.extendedTextMessage?.text ?? message.message?.conversation;
  return text?.trim() || null;
}
