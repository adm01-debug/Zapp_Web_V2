CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.secd_caller_ok(_user_id, false) THEN
    RAISE EXCEPTION 'is_team_conversation_member: consulta de vinculo de outro usuario nao autorizada'
      USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tcm.conversation_id = _conversation_id
      AND p.user_id = _user_id
  );
END;
$function$
