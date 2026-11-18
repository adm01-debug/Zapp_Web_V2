CREATE OR REPLACE FUNCTION public.talkx_increment_delivered(p_campaign_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  UPDATE public.talkx_campaigns
  SET delivered_count = delivered_count + 1
  WHERE id = p_campaign_id;
$function$
