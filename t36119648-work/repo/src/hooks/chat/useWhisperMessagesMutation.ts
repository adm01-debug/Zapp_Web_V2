import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { notificarSussurroEnviado } from './useWhisperCount';

/**
 * Motivo da recusa do sussurro — o compositor avisa a causa certa em vez de um
 * "erro genérico", e cada causa tem um caminho de correção diferente para o usuário.
 */
export type MotivoRecusaSussurro = 'contato_invalido' | 'sem_responsavel' | 'sem_perfil' | 'falha';

export type ResultadoSussurro = { ok: true } | { ok: false; motivo: MotivoRecusaSussurro };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `contacts.id` é uuid; um id não-uuid nunca chega ao insert (o PostgREST estouraria o cast). */
export function ehUuid(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && UUID_RE.test(valor);
}

export interface EnviarSussurroParams {
  /** Conversa sobre a qual o sussurro fala (`whisper_messages.contact_id`). */
  contactId: string;
  /** Corpo do sussurro — texto puro; sussurro não transporta anexo nem mídia. */
  content: string;
}

/**
 * Sussurro (nota interna) do compositor — lado DADOS e ENVIO.
 *
 * `whisper_messages` exige `sender_id` (perfil de quem escreve), `target_agent_id`
 * (destinatário) e `contact_id` — todos NOT NULL, com FK para `profiles`/`contacts`.
 * Por isso:
 *  - o destinatário é o RESPONSÁVEL ATUAL da conversa (`contacts.assigned_to`);
 *  - sem responsável NÃO existe a quem endereçar e a inserção é recusada
 *    (`sem_responsavel`) — não há "fila" representável nesta tabela (nenhum perfil
 *    de fila existe e `target_agent_id` não aceita nulo). O texto do usuário é
 *    preservado para ele escolher um destinatário no painel de sussurro.
 *
 * A gravação é feita AQUI e nunca pelo caminho de envio do canal: o sussurro não
 * sai para o WhatsApp. O hook não usa react-query de propósito — ele é chamado de
 * dentro de `useChatPanelHandlers`, que também monta em testes sem QueryClientProvider.
 */
export function useWhisperMessagesMutation() {
  const [isSendingWhisper, setIsSendingWhisper] = useState(false);

  const enviarSussurro = useCallback(async ({ contactId, content }: EnviarSussurroParams): Promise<ResultadoSussurro> => {
    if (!ehUuid(contactId)) return { ok: false, motivo: 'contato_invalido' };

    setIsSendingWhisper(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = authData?.user?.id;
      if (!userId) return { ok: false, motivo: 'sem_perfil' };

      // RLS de INSERT: `sender_id` precisa ser o perfil do usuário logado (ou admin).
      const { data: perfil, error: perfilError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (perfilError) throw perfilError;
      if (!perfil?.id) return { ok: false, motivo: 'sem_perfil' };

      // Destino: responsável atual da conversa. `target_agent_id` é NOT NULL.
      const { data: contato, error: contatoError } = await supabase
        .from('contacts')
        .select('assigned_to')
        .eq('id', contactId)
        .maybeSingle();
      if (contatoError) throw contatoError;
      const destino = contato?.assigned_to ?? null;
      if (!destino) return { ok: false, motivo: 'sem_responsavel' };

      const { error } = await supabase.from('whisper_messages').insert({
        contact_id: contactId,
        sender_id: perfil.id,
        target_agent_id: destino,
        content,
      });
      if (error) throw error;

      notificarSussurroEnviado(contactId);
      return { ok: true };
    } catch (error) {
      log.error('Failed to send whisper:', error);
      return { ok: false, motivo: 'falha' };
    } finally {
      setIsSendingWhisper(false);
    }
  }, []);

  return { enviarSussurro, isSendingWhisper };
}
