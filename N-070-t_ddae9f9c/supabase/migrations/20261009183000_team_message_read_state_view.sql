-- team_message_read_state
-- Rollback: drop view if exists public.team_message_read_state;
-- Rollback (SQL executável, na ordem):
--   drop view if exists public.team_message_read_state;
-- F41 (PLANO_TEAM_CHAT_FINALIZACAO_100_ETAPAS_2026-09-29): view que mostra,
-- mensagem a mensagem, quantos membros da conversa ja leram e se todos ja
-- leram (all_read). security_invoker = on para respeitar RLS nas tabelas
-- base; REVOKE de PUBLIC/anon e GRANT apenas a authenticated.

CREATE OR REPLACE VIEW public.team_message_read_state
WITH (security_invoker = true)
AS
SELECT
  m.id                       AS message_id,
  m.conversation_id,
  COUNT(DISTINCT tcm.profile_id)                                                      AS member_count,
  COUNT(DISTINCT tr.profile_id) FILTER (WHERE tr.status = 'read')                    AS read_count,
  COUNT(DISTINCT tr.profile_id) FILTER (WHERE tr.status = 'read')
    >= COUNT(DISTINCT tcm.profile_id) - 1                                             AS all_read
FROM public.team_messages m
JOIN public.team_conversation_members tcm
  ON tcm.conversation_id = m.conversation_id
LEFT JOIN public.team_message_receipts tr
  ON tr.message_id = m.id
 AND tr.profile_id = tcm.profile_id
GROUP BY m.id, m.conversation_id;

REVOKE ALL ON public.team_message_read_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_message_read_state TO authenticated;
