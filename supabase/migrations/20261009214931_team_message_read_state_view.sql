-- Rollback: Remove a view team_message_read_state e revoga o acesso de leitura.
-- Rollback (SQL executável, na ordem):
--   DROP VIEW IF EXISTS public.team_message_read_state;
--   REVOKE SELECT ON public.team_message_read_state FROM authenticated;
--   GRANT SELECT ON public.team_message_read_state TO PUBLIC;

CREATE VIEW public.team_message_read_state
WITH (security_invoker = true)
AS
SELECT
  m.id AS message_id,
  m.conversation_id,
  COUNT(DISTINCT tcm.profile_id) AS member_count,
  COUNT(DISTINCT CASE
    WHEN r.status = 'read' AND r.profile_id <> m.sender_id
    THEN r.profile_id
  END) AS read_count,
  COUNT(DISTINCT CASE
    WHEN r.status = 'read' AND r.profile_id <> m.sender_id
    THEN r.profile_id
  END) = COUNT(DISTINCT tcm.profile_id) - 1 AS all_read
FROM public.team_messages m
JOIN public.team_conversation_members tcm
  ON tcm.conversation_id = m.conversation_id
LEFT JOIN public.team_message_receipts r
  ON r.message_id = m.id
  AND r.profile_id = tcm.profile_id
  AND r.status = 'read'
GROUP BY m.id, m.conversation_id, m.sender_id;

REVOKE ALL ON public.team_message_read_state FROM PUBLIC;
REVOKE ALL ON public.team_message_read_state FROM anon;
GRANT SELECT ON public.team_message_read_state TO authenticated;
