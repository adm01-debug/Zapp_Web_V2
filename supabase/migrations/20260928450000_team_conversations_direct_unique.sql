-- E31: Constraint de unicidade para conversas diretas (direct_member_a, direct_member_b)
-- Evita que dois usuarios tenham multiplas conversas diretas entre si

-- Funcao para normalizar a ordem dos membros (menor UUID primeiro)
CREATE OR REPLACE FUNCTION public.team_conversation_direct_members_normalized(
  a UUID, b UUID
) RETURNS UUID[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY[LEAST(a, b), GREATEST(a, b)]
$$;

REVOKE EXECUTE ON FUNCTION public.team_conversation_direct_members_normalized(UUID, UUID) FROM PUBLIC, anon;

-- Index unique parcial para conversas diretas
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_conversations_direct_unique
  ON public.team_conversations (
    LEAST(direct_member_a::text, direct_member_b::text),
    GREATEST(direct_member_a::text, direct_member_b::text)
  )
  WHERE type = 'direct'
    AND direct_member_a IS NOT NULL
    AND direct_member_b IS NOT NULL;
