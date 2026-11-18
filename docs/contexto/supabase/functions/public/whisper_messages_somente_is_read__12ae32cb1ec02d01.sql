CREATE OR REPLACE FUNCTION public.whisper_messages_somente_is_read()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (to_jsonb(OLD)-'is_read') IS DISTINCT FROM (to_jsonb(NEW)-'is_read') THEN
    RAISE EXCEPTION 'whisper_messages: so a coluna is_read pode ser alterada' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$
