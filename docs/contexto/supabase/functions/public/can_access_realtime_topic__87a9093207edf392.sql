CREATE OR REPLACE FUNCTION public.can_access_realtime_topic(_topic text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when auth.uid() is null then
      false
    when _topic ~ '^typing:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or _topic ~ '^conversation:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      public.is_contact_visible_to_user(
        substring(_topic from '[0-9a-fA-F-]{36}$')::uuid,
        auth.uid()
      )
    when _topic ~ '^team-(typing|presence)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      public.is_team_conversation_member(
        auth.uid(),
        substring(_topic from '[0-9a-fA-F-]{36}$')::uuid
      )
    else
      false
  end;
$function$
