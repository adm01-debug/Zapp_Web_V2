-- X058: talkx_campaign_queue_by_segment
-- Analytics RPC planejada em #2531; DDL requires owner approval before apply.

DROP FUNCTION IF EXISTS public.talkx_campaign_queue_by_segment(uuid);
CREATE OR REPLACE FUNCTION public.talkx_campaign_queue_by_segment(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid;
  v_totals jsonb;
  v_by_segment jsonb;
BEGIN
  v_profile_id := (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1);

  IF NOT EXISTS (
    SELECT 1 FROM public.talkx_campaigns c
    WHERE c.id = p_campaign_id
      AND (c.created_by = v_profile_id OR public.is_admin_or_supervisor(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'pending',   COUNT(*) FILTER (WHERE status = 'pending'),
    'sending',   COUNT(*) FILTER (WHERE status = 'sending'),
    'sent',      COUNT(*) FILTER (WHERE status = 'sent'),
    'delivered', COUNT(*) FILTER (WHERE delivered_at IS NOT NULL),
    'replied',   COUNT(*) FILTER (WHERE replied_at IS NOT NULL),
    'failed',    COUNT(*) FILTER (WHERE status = 'failed'),
    'skipped',   COUNT(*) FILTER (WHERE status = 'skipped')
  )
  INTO v_totals
  FROM public.talkx_recipients
  WHERE campaign_id = p_campaign_id;

  SELECT COALESCE(jsonb_agg(row ORDER BY seg_name), '[]'::jsonb)
  INTO v_by_segment
  FROM (
    SELECT
      jsonb_build_object(
        'segment_id', r.segment_id,
        'segment_name', COALESCE(s.name, 'Sem segmento'),
        'pending',   COUNT(*) FILTER (WHERE r.status = 'pending'),
        'sending',   COUNT(*) FILTER (WHERE r.status = 'sending'),
        'sent',      COUNT(*) FILTER (WHERE r.status = 'sent'),
        'delivered', COUNT(*) FILTER (WHERE r.delivered_at IS NOT NULL),
        'replied',   COUNT(*) FILTER (WHERE r.replied_at IS NOT NULL),
        'failed',    COUNT(*) FILTER (WHERE r.status = 'failed'),
        'skipped',   COUNT(*) FILTER (WHERE r.status = 'skipped')
      ) AS row,
      COALESCE(s.name, 'Sem segmento') AS seg_name
    FROM public.talkx_recipients r
    LEFT JOIN public.talkx_segments s ON s.id = r.segment_id
    WHERE r.campaign_id = p_campaign_id
    GROUP BY r.segment_id, s.name
  ) sub;

  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'totals', v_totals,
    'by_segment', v_by_segment
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_queue_by_segment(uuid) TO authenticated;
