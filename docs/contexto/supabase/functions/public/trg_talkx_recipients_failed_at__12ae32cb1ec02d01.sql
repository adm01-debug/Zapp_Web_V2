CREATE OR REPLACE FUNCTION public.trg_talkx_recipients_failed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status = 'failed' AND NEW.failed_at IS NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'failed') THEN
    NEW.failed_at := now();
  END IF;
  RETURN NEW;
END;
$function$
