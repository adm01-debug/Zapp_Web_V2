-- E33: CHECK de type vs direct_member_a/b em team_conversations
-- Conversas diretas devem ter ambos os membros; grupos nao devem ter

ALTER TABLE public.team_conversations
  DROP CONSTRAINT IF EXISTS team_conversations_direct_members_check;

ALTER TABLE public.team_conversations
  ADD CONSTRAINT team_conversations_direct_members_check
  CHECK (
    (type = 'direct' AND direct_member_a IS NOT NULL AND direct_member_b IS NOT NULL)
    OR
    (type != 'direct' AND direct_member_a IS NULL AND direct_member_b IS NULL)
  );

-- CHECK de tipo de conversa valido
ALTER TABLE public.team_conversations
  DROP CONSTRAINT IF EXISTS team_conversations_type_check;

ALTER TABLE public.team_conversations
  ADD CONSTRAINT team_conversations_type_check
  CHECK (type IN ('direct', 'group', 'department', 'announcement'));
