CREATE OR REPLACE FUNCTION public.talkx_blacklist_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'talkx_blacklist_delete_bloqueado: use remocao logica via removed_at';
END;
$function$
