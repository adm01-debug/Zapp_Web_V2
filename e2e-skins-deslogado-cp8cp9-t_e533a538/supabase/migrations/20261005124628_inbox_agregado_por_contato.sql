-- inbox_agregado_por_contato
-- Rollback: DROP FUNCTION IF EXISTS public.get_inbox_contact_summaries(uuid[]);
--
-- R2-INB-005 (P1, hooks/Inbox): "Janela global de mensagens transforma conversas
-- ativas em histórico vazio e zero não lidas".
--
-- A carga inicial da inbox (src/services/realtime.service.ts) pedia as 1000
-- mensagens mais recentes de TODOS os contatos (RECENT_MESSAGES_LIMIT) e montava
-- cada conversa apenas com o que caísse nessa amostra global (buildConversations
-- em src/hooks/realtime/realtimeUtils.ts). Contato cujo histórico fica fora da
-- janela — porque outros contatos ocuparam as 1000 linhas — voltava com
-- lastMessage null e unreadCount 0, e desaparecia da aba "abertas"
-- (useInboxFilters exige messages.length > 0). A busca local da lista também não
-- recuperava o contato, porque o dado nunca chegou ao cliente.
--
-- Esta RPC devolve, POR CONTATO e direto do banco, a última mensagem e o agregado
-- de não lidas — sem inferir ausência de histórico de uma amostra global. Mesmo
-- desenho já usado em get_last_message_dates (20260907120000) e get_team_inbox
-- (20260929260000).
--
-- Semântica de "não lida" idêntica à do cliente (buildConversation):
-- sender = 'contact' AND is_read IS NOT TRUE (is_read nulo conta como não lida).
-- is_deleted não é filtrado aqui pelo mesmo motivo que não é filtrado na amostra
-- global: a última mensagem da lista tem hoje paridade com o que o cliente já
-- mostrava antes desta mudança.
--
-- Visibilidade: cada id passa por public.is_contact_visible_to_user (mesmo
-- predicado de get_last_message_dates a partir de 20260924221209), para não vazar
-- metadado de contato fora do alcance do usuário por enumeração de UUID.
CREATE OR REPLACE FUNCTION public.get_inbox_contact_summaries(p_contact_ids uuid[])
RETURNS TABLE (
  contact_id uuid,
  unread_count bigint,
  last_message_id uuid,
  last_message_sender text,
  last_message_content text,
  last_message_type text,
  last_message_created_at timestamp with time zone,
  last_message_is_read boolean,
  last_message_external_id text,
  last_message_media_url text,
  last_message_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH alvo AS (
    SELECT DISTINCT alvo_ids.id AS contact_id
    FROM unnest(p_contact_ids) AS alvo_ids(id)
    WHERE alvo_ids.id IS NOT NULL
      AND public.is_contact_visible_to_user(alvo_ids.id, auth.uid())
  ),
  ultima AS (
    SELECT DISTINCT ON (m.contact_id)
      m.contact_id,
      m.id,
      m.sender,
      m.content,
      m.message_type,
      m.created_at,
      m.is_read,
      m.external_id,
      m.media_url,
      m.status
    FROM public.messages m
    JOIN alvo a ON a.contact_id = m.contact_id
    -- created_at DESC + id DESC: o critério de desempate é determinístico mesmo
    -- quando duas mensagens dividem o mesmo carimbo de tempo.
    ORDER BY m.contact_id, m.created_at DESC, m.id DESC
  ),
  nao_lidas AS (
    SELECT m.contact_id, count(*) AS total
    FROM public.messages m
    JOIN alvo a ON a.contact_id = m.contact_id
    WHERE m.sender = 'contact'
      AND m.is_read IS NOT TRUE
    GROUP BY m.contact_id
  )
  SELECT
    ultima.contact_id,
    COALESCE(nao_lidas.total, 0)::bigint AS unread_count,
    ultima.id,
    ultima.sender,
    ultima.content,
    ultima.message_type,
    ultima.created_at,
    ultima.is_read,
    ultima.external_id,
    ultima.media_url,
    ultima.status
  FROM ultima
  LEFT JOIN nao_lidas ON nao_lidas.contact_id = ultima.contact_id;
$function$;

REVOKE ALL ON FUNCTION public.get_inbox_contact_summaries(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_inbox_contact_summaries(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_inbox_contact_summaries(uuid[]) TO authenticated, service_role;
