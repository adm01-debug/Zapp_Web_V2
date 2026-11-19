CREATE OR REPLACE FUNCTION public.record_talkx_campaign_lifecycle_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_event text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT profile.id INTO v_actor
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
    VALUES (NEW.id, 'created', NULL, v_actor);
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'scheduled' THEN
    v_event := 'scheduled';
  ELSIF OLD.status = 'scheduled' AND NEW.status = 'scheduled'
        AND (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
             OR NEW.schedule_timezone IS DISTINCT FROM OLD.schedule_timezone) THEN
    v_event := 'scheduled_updated';
  ELSE
    v_event := 'updated';
  END IF;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
  VALUES (NEW.id, v_event, NULL, v_actor);

  RETURN NEW;
END;
$function$
