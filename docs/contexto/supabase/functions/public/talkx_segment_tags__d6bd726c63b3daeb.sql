CREATE OR REPLACE FUNCTION public.talkx_segment_tags(p_segment uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('tag', tag, 'count', cnt) ORDER BY cnt DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT tag, COUNT(DISTINCT c.id) AS cnt
    FROM public.talkx_campaigns tc
    JOIN public.talkx_recipients r ON r.campaign_id = tc.id
    JOIN public.contacts c ON c.id = r.contact_id
    CROSS JOIN LATERAL unnest(c.tags) AS tag
    WHERE tc.segment_id = p_segment
      AND c.tags IS NOT NULL
    GROUP BY tag
    ORDER BY cnt DESC
    LIMIT 10
  ) top;
$function$
