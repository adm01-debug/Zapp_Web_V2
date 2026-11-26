CREATE OR REPLACE FUNCTION public.guard_talkx_template_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user = 'service_role'::name THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.talkx_campaigns WHERE template_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'talkx_template_in_use'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$function$
