CREATE OR REPLACE FUNCTION public.talkx_campaign_segment_progress(p_campaign_id uuid)
 RETURNS TABLE(segment_id uuid, "position" smallint, total bigint, sent bigint, delivered bigint, failed bigint, remaining bigint, percent numeric, status text, total_segments bigint, pending_segments bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT s.segment_id AS seg_id,
           s."position" AS pos,
           count(r.id) AS total,
           count(r.id) FILTER (WHERE r.status IN ('sent', 'delivered')) AS sent,
           count(r.id) FILTER (WHERE r.status = 'delivered') AS delivered,
           count(r.id) FILTER (WHERE r.status = 'failed') AS failed,
           count(r.id) FILTER (WHERE r.status IN ('pending', 'sending')) AS remaining
      FROM public.talkx_campaign_segments s
      LEFT JOIN public.talkx_recipients r
        ON r.campaign_id = s.campaign_id AND r.segment_id = s.segment_id
     WHERE s.campaign_id = p_campaign_id
     GROUP BY s.segment_id, s."position"
  ), st AS (
    SELECT a.*,
           CASE
             WHEN a.total > 0 AND a.remaining = 0 THEN 'done'
             WHEN a.total - a.remaining > 0 THEN 'running'
             ELSE 'pending'
           END AS seg_status
      FROM agg a
  )
  SELECT st.seg_id,
         st.pos,
         st.total,
         st.sent,
         st.delivered,
         st.failed,
         st.remaining,
         CASE WHEN st.total = 0 THEN 0::numeric
              ELSE round(100.0 * (st.total - st.remaining) / st.total, 1) END,
         st.seg_status,
         count(*) OVER (),
         count(*) FILTER (WHERE st.seg_status <> 'done') OVER ()
    FROM st
   ORDER BY st.pos;
END;
$function$
