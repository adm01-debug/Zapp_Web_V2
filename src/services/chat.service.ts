import { supabase } from '@/integrations/supabase/client';
import type { Message, MessageInsert } from '@/types/chat';
import { getLogger } from '@/lib/logger';

const log = getLogger('ChatService');

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
    
    return supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .range(from, to);
  }

  static async sendMessage(payload: MessageInsert) {
    const result = await supabase.from('messages').insert(payload).select().single();
    // Fire-and-forget link preview enrichment (only for text content without a preview already)
    const row = result.data as { id?: string; content?: string | null; link_preview?: unknown } | null;
    if (
      row?.id &&
      typeof row.content === 'string' &&
      row.content.length > 0 &&
      !row.link_preview
    ) {
      void enrichLinkPreview(row.id, row.content);
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
    const fileName = `${contactId}/${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from('audio-messages')
      .upload(fileName, blob, { contentType: 'audio/webm' });

    if (uploadError) throw uploadError;

    const { data: signedData, error: signError } = await supabase.storage
      .from('audio-messages')
      .createSignedUrl(fileName, 3600);

    if (signError) throw signError;
    return signedData.signedUrl;
  }
}
