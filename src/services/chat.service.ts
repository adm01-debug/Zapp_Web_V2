import { supabase } from '@/integrations/supabase/client';
import type { Message, MessageInsert } from '@/types/chat';
import { getLogger } from '@/lib/logger';
import { sendOutboundMessage, type OutboundMessageType } from './outbound-message.service';

const log = getLogger('ChatService');

/**
 * Mime e extensão do áudio pelo CONTEÚDO do blob (`blob.type`), não por um
 * `.webm`/`audio/webm` fixo. O MediaRecorder escolhe o mimeType conforme o
 * navegador (Chrome/Android → audio/webm, Firefox → audio/ogg, Safari → audio/mp4);
 * subir tudo como webm fazia o objeto do bucket mentir sobre o próprio formato.
 * Sem tipo reconhecível, cai no webm — o que a gravação do app produz hoje.
 */
const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

export const DEFAULT_AUDIO_MIME = 'audio/webm';

/** Deriva `{ contentType, extension }` do áudio a partir do tipo do blob. */
export function resolveAudioUploadMeta(
  blob: Pick<Blob, 'type'> | null | undefined
): { contentType: string; extension: string } {
  const base = (blob?.type ?? '').split(';')[0]!.trim().toLowerCase();
  const contentType = base.startsWith('audio/') ? base : DEFAULT_AUDIO_MIME;
  return { contentType, extension: AUDIO_EXTENSION_BY_MIME[contentType] ?? 'webm' };
}

// Extract first http(s) URL from message content
const URL_REGEX = /https?:\/\/[^\s<>"'`]+/i;

async function enrichLinkPreview(messageId: string, content: string): Promise<void> {
  const match = content.match(URL_REGEX);
  if (!match) return;
  const url = match[0].replace(/[).,;!?]+$/, '');
  try {
    const { data, error } = await supabase.functions.invoke('fetch-link-preview', {
      body: { url },
    });
    if (error || !data?.preview) return;
    await supabase
      .from('messages')
      .update({ link_preview: data.preview })
      .eq('id', messageId);
  } catch (err) {
    log.error('Failed to enrich link preview', err);
  }
}

export type { Message, MessageInsert };

export class ChatService {
  static async fetchMessages(contactId: string, page = 0, pageSize = 1000) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const result = await supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contactId)
      // Paginar no banco a partir do fim da conversa. Ordenar ASC antes do
      // range fazia a primeira pagina conter as mensagens mais antigas.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    return {
      ...result,
      // O ChatPanel consome a lista em ordem cronologica.
      data: result.data ? [...result.data].reverse() : result.data,
    };
  }

  /**
   * Busca a pagina imediatamente anterior usando cursor estavel. Diferente de
   * OFFSET, novas mensagens recebidas por realtime nao deslocam a janela e nao
   * fazem uma mensagem antiga ser pulada durante o carregamento incremental.
   */
  static async fetchMessagesBefore(
    contactId: string,
    before: { createdAt: string; id: string },
    pageSize = 1000,
  ) {
    const result = await supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contactId)
      .or(`created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize);

    return {
      ...result,
      data: result.data ? [...result.data].reverse() : result.data,
    };
  }

  static async sendMessage(payload: MessageInsert) {
    if (payload.sender !== 'agent' || !payload.contact_id || !payload.content) {
      throw new Error('ChatService.sendMessage aceita apenas mensagens de agente com contato e conteúdo.');
    }
    const messageType = payload.message_type as OutboundMessageType;
    if (!['text', 'image', 'audio', 'video', 'document', 'sticker', 'location'].includes(messageType)) {
      throw new Error(`Tipo de mensagem não suportado pelo envio seguro: ${payload.message_type}`);
    }
    const result = await sendOutboundMessage({
      contactId: payload.contact_id,
      content: payload.content,
      messageType,
      mediaUrl: payload.media_url,
      replyToId: payload.reply_to_id,
      whatsappConnectionId: payload.whatsapp_connection_id,
    });
    if (messageType === 'text' && payload.content.length > 0 && !payload.link_preview) {
      void enrichLinkPreview(result.id, payload.content);
    }
    return result;
  }

  static async markAsRead(messageId: string) {
    return supabase.from('messages').update({ is_read: true }).eq('id', messageId);
  }

  static async deleteMessage(messageId: string) {
    return supabase
      .from('messages')
      .update({ is_deleted: true, content: '[Mensagem apagada]' })
      .eq('id', messageId);
  }

  static async uploadAudio(contactId: string, blob: Blob) {
    const { contentType, extension } = resolveAudioUploadMeta(blob);
    const fileName = `${contactId}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('audio-messages')
      .upload(fileName, blob, { contentType });

    if (uploadError) throw uploadError;

    // Persist a stable object locator, never a short-lived signed URL. The
    // player and the Evolution proxy exchange it for a fresh signed URL only
    // when they need to read the private object.
    const { data: publicUrlData } = supabase.storage
      .from('audio-messages')
      .getPublicUrl(fileName);

    if (!publicUrlData?.publicUrl) throw new Error('Failed to create audio object reference');
    return publicUrlData.publicUrl;
  }
}
