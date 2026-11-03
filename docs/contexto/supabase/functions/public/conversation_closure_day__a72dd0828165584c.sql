CREATE OR REPLACE FUNCTION public.conversation_closure_day(p_created_at timestamp with time zone)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ SELECT (p_created_at AT TIME ZONE 'America/Sao_Paulo')::date $function$
