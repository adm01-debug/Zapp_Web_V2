CREATE OR REPLACE FUNCTION public.talkx_sync_campaign_segments(p_campaign_id uuid, p_segment_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.talkx_campaign_segments
   WHERE campaign_id = p_campaign_id;

  IF p_segment_ids IS NULL OR cardinality(p_segment_ids) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status)
  SELECT p_campaign_id, pedido.segment_id, pedido.ord::smallint, 'pending'
    FROM unnest(p_segment_ids) WITH ORDINALITY AS pedido(segment_id, ord)
   WHERE EXISTS (
     SELECT 1 FROM public.talkx_segments AS segment WHERE segment.id = pedido.segment_id
   );
END;
$function$
