CREATE OR REPLACE FUNCTION public.set_team_member_role(p_conversation_id uuid, p_profile_id uuid, p_new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_new_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'invalid role: %', p_new_role;
  END IF;
  IF NOT is_admin_or_supervisor(auth.uid()) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.team_conversation_members
      WHERE conversation_id = p_conversation_id
        AND profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        AND member_role = 'owner'
    ) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;
  IF p_new_role <> 'owner'
     AND public.is_last_team_conversation_owner(p_conversation_id, p_profile_id) THEN
    RAISE EXCEPTION 'last_owner_must_transfer_ownership';
  END IF;
  UPDATE public.team_conversation_members
  SET    member_role = p_new_role
  WHERE  conversation_id = p_conversation_id
    AND  profile_id      = p_profile_id;
END;
$function$
