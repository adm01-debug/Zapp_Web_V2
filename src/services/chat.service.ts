import { supabase } from '@/integrations/supabase/client';
import { formatoDeUpload } from '@/lib/audio/gravacaoFormato';
import type { Message } from '@/types/chat';

export type { Message };

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

  static async deleteMessage(messageId: string) {
    return supabase
      .from('messages')
      .update({ is_deleted: true, content: '[Mensagem apagada]' })
      .eq('id', messageId);
  }

  static async uploadAudio(contactId: string, blob: Blob) {
    // SL-072: extensão e Content-Type saem do mime REAL do blob (Safari grava
    // mp4/m4a, Firefox ogg) — antes todo objeto era rotulado como webm.
    const { extensao, contentType } = formatoDeUpload(blob.type);
    const fileName = `${contactId}/${Date.now()}.${extensao}`;
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
