CREATE OR REPLACE FUNCTION public.talkx_campaign_revenue(p_campaign uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH agg AS (
    SELECT count(*)::integer                    AS conversions,
           COALESCE(sum(value), 0)::numeric(14,2) AS revenue
      FROM public.talkx_conversions
     WHERE campaign_id = p_campaign
  )
  SELECT jsonb_build_object(
    'campaign_id', p_campaign,
    'conversions', agg.conversions,
    'revenue',     agg.revenue,
    'investment',  camp.investment,
    'roi', CASE
             WHEN camp.investment IS NOT NULL AND camp.investment > 0
             THEN round((agg.revenue - camp.investment) / camp.investment, 4)
           END,
    'roi_percent', CASE
             WHEN camp.investment IS NOT NULL AND camp.investment > 0
             THEN round(100 * (agg.revenue - camp.investment) / camp.investment, 2)
           END
  )
    FROM agg
    LEFT JOIN public.talkx_campaigns camp ON camp.id = p_campaign;
$function$
