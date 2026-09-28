-- E48: Trigger que valida member_role em team_conversation_members
-- Previne insercao/update de roles invalidos via triggers ou service_role direto

CREATE OR REPLACE FUNCTION public.team_conversation_member_role_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.member_role NOT IN ('member', 'moderator', 'admin') THEN
    RAISE EXCEPTION 'Invalid member_role: %. Must be member, moderator, or admin', NEW.member_role;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.team_conversation_member_role_check() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS team_conversation_member_role_check ON public.team_conversation_members;
CREATE TRIGGER team_conversation_member_role_check
  BEFORE INSERT OR UPDATE ON public.team_conversation_members
  FOR EACH ROW EXECUTE FUNCTION public.team_conversation_member_role_check();

-- UNIQUE constraint em team_conversation_members (conversation_id, profile_id)
ALTER TABLE public.team_conversation_members
  DROP CONSTRAINT IF EXISTS team_conversation_members_unique_member;

ALTER TABLE public.team_conversation_members
  ADD CONSTRAINT team_conversation_members_unique_member
  UNIQUE (conversation_id, profile_id);
