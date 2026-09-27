-- E27: Data integrity -- backfill direct_member_a/b for existing direct conversations
-- PostgreSQL has no built-in MIN/MAX aggregate for uuid, so cast to text for ordering.
UPDATE public.team_conversations tc
SET
  direct_member_a = members.min_pid::uuid,
  direct_member_b = members.max_pid::uuid
FROM (
  SELECT
    conversation_id,
    MIN(profile_id::text) AS min_pid,
    MAX(profile_id::text) AS max_pid
  FROM public.team_conversation_members
  GROUP BY conversation_id
  HAVING COUNT(*) = 2
) members
WHERE tc.type = 'direct'
  AND tc.direct_member_a IS NULL
  AND tc.id = members.conversation_id;
