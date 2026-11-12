CREATE OR REPLACE FUNCTION public.talkx_blacklist_reason_active_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.reason_code IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.reason_code IS NOT DISTINCT FROM OLD.reason_code THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.talkx_suppression_reasons AS r
     WHERE r.code = NEW.reason_code AND NOT r.active
  ) THEN
    RAISE EXCEPTION 'talkx_suppression_reason_inactive'
      USING ERRCODE = '23514',
            DETAIL = format('reason_code %s está desativado no catálogo', NEW.reason_code);
  END IF;
  RETURN NEW;
END;
$function$
