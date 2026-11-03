CREATE OR REPLACE FUNCTION public.trg_talkx_increment_replied_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.replied_at IS NULL AND NEW.replied_at IS NOT NULL THEN
    UPDATE public.talkx_campaigns
       SET replied_count = COALESCE(replied_count, 0) + 1
     WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$function$
