import { supabase } from '@/integrations/supabase/client';
import type { Message } from '@/types/chat';

export type MarkUnreadLocalResult = 'ok' | 'sem_mensagem_do_contato' | 'erro';

/**
 * "Marcar como não lida" como estado do Zapp (P2-GO-6).
 *
 * A Evolution GO não tem rota para marcar conversa como não lida (a edge
 * responde `notSupported`), então a verdade passa a ser o Zapp: a mensagem do
 * contato volta a `is_read = false` e a conversa reaparece com o selo de não
 * lida na lista e no total da barra lateral (`inbox_unread_total`). O aviso ao
 * WhatsApp, quando o provedor suporta, é bônus.
 *
 * - Mensagem do contato: ela própria volta a não lida.
 * - Mensagem nossa: a última mensagem do contato da conversa volta a não lida
 *   (é o que o selo conta — "conversa com mensagem do contato não lida").
 */
export async function markUnreadInZapp(message: Pick<Message, 'id' | 'sender' | 'contact_id'>): Promise<MarkUnreadLocalResult> {
  let targetId: string | null = message.sender === 'contact' ? message.id : null;

  if (!targetId) {
    if (!message.contact_id) return 'sem_mensagem_do_contato';
    const { data, error } = await supabase
      .from('messages')
      .select('id')
      .eq('contact_id', message.contact_id)
      .eq('sender', 'contact')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return 'erro';
    if (!data?.id) return 'sem_mensagem_do_contato';
    targetId = data.id;
  }

  // PostgREST não lança: `{ error }` ou 0 linhas (RLS) NÃO são sucesso.
  const { data: updated, error: updateError } = await supabase
    .from('messages')
    .update({ is_read: false })
    .eq('id', targetId)
    .select('id');
  if (updateError || !updated || updated.length === 0) return 'erro';
  return 'ok';
}
