CREATE OR REPLACE FUNCTION public.guard_conversation_status_direct_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- current_user é o papel EFETIVO: dentro de uma RPC SECURITY DEFINER é o dono da
  -- função; só um UPDATE direto do cliente chega aqui como authenticated/anon.
  IF current_user IN ('authenticated', 'anon') AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'conversation_status_requires_rpc'
      USING ERRCODE = '42501',
            HINT = 'Use set_conversation_status / set_conversations_status / close_conversation_atomic / reopen_conversation.';
  END IF;
  RETURN NEW;
END;
$function$
