-- inbox_unread_total
-- Rollback: remove a RPC public.inbox_unread_total() e o indice parcial idx_messages_unread_conversas; o total de conversas nao lidas volta a ser somado por contato no cliente.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.inbox_unread_total();
--   drop index if exists public.idx_messages_unread_conversas;
--
-- R2-INB-0xx (P1, shell/inbox): o selo de nao lidas do Chat (barra lateral, barra
-- inferior do celular e titulo da aba) nao existe porque src/pages/Index.tsx passa
-- `unreadNotifications={0}` fixo ao shell. Os hooks prontos (useTeamUnreadTotal,
-- useDocumentBadge) nao tinham de onde tirar o numero sem baixar a lista inteira
-- de conversas (get_inbox_contact_summaries por contato) so para somar.
--
-- Esta RPC devolve, em UMA chamada leve, quantas CONVERSAS o chamador tem com ao
-- menos uma mensagem do CONTATO nao lida (nao conta mensagem, conta conversa).
-- Mesma semantica de "nao lida" do cliente (buildConversation) e de
-- get_inbox_contact_summaries: sender = 'contact' AND is_read IS NOT TRUE
-- (is_read nulo conta como nao lida). Visibilidade pelo MESMO predicado
-- canonico public.is_contact_visible_to_user (o mesmo de get_inbox_contact_summaries
-- e get_last_message_dates), entao nao vaza conversa fora do alcance do usuario.
--
-- Leveza: o indice parcial idx_messages_unread_conversas reduz a varredura APENAS
-- as mensagens de entrada nao lidas (linhas raras) e o DISTINCT contact_id sai do
-- indice; o predicado de visibilidade e aplicado so nos contatos candidatos, nao na
-- tabela messages inteira. E' estritamente mais leve que get_inbox_contact_summaries,
-- que aplica o MESMO predicado por contato e ainda baixa as mensagens.
CREATE OR REPLACE FUNCTION public.inbox_unread_total()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH candidatos AS MATERIALIZED (
    SELECT DISTINCT m.contact_id
    FROM public.messages AS m
    WHERE m.sender = 'contact'
      AND m.is_read IS NOT TRUE
      AND m.contact_id IS NOT NULL
  )
  SELECT COALESCE(count(*), 0)::bigint
  FROM candidatos AS c
  WHERE public.is_contact_visible_to_user(c.contact_id, auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.inbox_unread_total() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_unread_total() FROM anon;
GRANT EXECUTE ON FUNCTION public.inbox_unread_total() TO authenticated, service_role;

-- Cobre exatamente o predicado da RPC: mensagens de entrada nao lidas. E' parcial
-- (linhas raras) e NAO duplica idx_messages_unread_contact, que e' parcial em
-- (is_read = false AND sender = 'contact') e portanto deixa de fora is_read NULO.
CREATE INDEX IF NOT EXISTS idx_messages_unread_conversas
  ON public.messages (contact_id)
  WHERE sender = 'contact' AND is_read IS NOT TRUE;
