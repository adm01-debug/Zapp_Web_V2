-- X058 (Fase 7 · analíticas · banco): talkx_campaign_queue_by_segment.
-- RPC read-only SECURITY DEFINER; exige dono da campanha ou admin/supervisor.
-- rollback:
--   DROP FUNCTION IF EXISTS public.talkx_campaign_queue_by_segment(uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- talkx_campaign_queue_by_segment: breakdown da fila por segmento
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.talkx_campaign_queue_by_segment(uuid);
CREATE OR REPLACE FUNCTION public.talkx_campaign_queue_by_segment(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_result     jsonb;
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
    'campaign_id', p_campaign_id,
    'as_of',       now(),
    'totals', jsonb_build_object(
      'pending',   COUNT(*) FILTER (WHERE r.status = 'pending'),
      'sending',   COUNT(*) FILTER (WHERE r.status = 'sending'),
      'sent',      COUNT(*) FILTER (WHERE r.status = 'sent'),
      'delivered', COUNT(*) FILTER (WHERE r.delivered_at IS NOT NULL),
      'replied',   COUNT(*) FILTER (WHERE r.replied_at IS NOT NULL),
      'failed',    COUNT(*) FILTER (WHERE r.status = 'failed'),
      'skipped',   COUNT(*) FILTER (WHERE r.status = 'skipped'),
      'total',     COUNT(*)
    ),
    'by_segment', COALESCE(
      (
        SELECT jsonb_agg(seg_row ORDER BY seg_pending DESC)
        FROM (
          SELECT
            jsonb_build_object(
              'segment_id',   r2.segment_id,
              'segment_name', s.name,
              'pending',      COUNT(*) FILTER (WHERE r2.status = 'pending'),
              'sending',      COUNT(*) FILTER (WHERE r2.status = 'sending'),
              'sent',         COUNT(*) FILTER (WHERE r2.status = 'sent'),
              'delivered',    COUNT(*) FILTER (WHERE r2.delivered_at IS NOT NULL),
              'replied',      COUNT(*) FILTER (WHERE r2.replied_at IS NOT NULL),
              'failed',       COUNT(*) FILTER (WHERE r2.status = 'failed'),
              'skipped',      COUNT(*) FILTER (WHERE r2.status = 'skipped'),
              'total',        COUNT(*)
            ) AS seg_row,
            COUNT(*) FILTER (WHERE r2.status = 'pending') AS seg_pending
          FROM public.talkx_recipients r2
          LEFT JOIN public.talkx_segments s ON s.id = r2.segment_id
          WHERE r2.campaign_id = p_campaign_id
            AND r2.segment_id IS NOT NULL
          GROUP BY r2.segment_id, s.name
        ) sub
      ),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM public.talkx_recipients r
  WHERE r.campaign_id = p_campaign_id;

  RETURN COALESCE(v_result, jsonb_build_object(
    'campaign_id', p_campaign_id,
    'as_of',       now(),
    'totals',      jsonb_build_object('pending', 0, 'sending', 0, 'sent', 0,
                     'delivered', 0, 'replied', 0, 'failed', 0, 'skipped', 0, 'total', 0),
    'by_segment',  '[]'::jsonb
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.talkx_campaign_queue_by_segment(uuid) TO authenticated;
COMMENT ON FUNCTION public.talkx_campaign_queue_by_segment(uuid) IS
  'X058: totais e breakdown por segmento (pending/sent/delivered/replied/failed/skipped) da fila de uma campanha.';
