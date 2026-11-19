CREATE OR REPLACE FUNCTION public.guard_talkx_campaign_recurrence_series()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.recurrence_series_id IS NOT NULL
         OR NEW.recurrence_next_campaign_id IS NOT NULL
         OR NEW.recurrence_closed_at IS NOT NULL
         OR NEW.recurrence_closed_reason IS NOT NULL THEN
        RAISE EXCEPTION 'talkx_recurrence_series_managed' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.recurrence_series_id IS DISTINCT FROM OLD.recurrence_series_id
       OR NEW.recurrence_next_campaign_id IS DISTINCT FROM OLD.recurrence_next_campaign_id
       OR NEW.recurrence_closed_at IS DISTINCT FROM OLD.recurrence_closed_at
       OR NEW.recurrence_closed_reason IS DISTINCT FROM OLD.recurrence_closed_reason THEN
      RAISE EXCEPTION 'talkx_recurrence_series_managed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
