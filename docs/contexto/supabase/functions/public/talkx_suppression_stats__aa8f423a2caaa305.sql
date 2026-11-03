CREATE OR REPLACE FUNCTION public.talkx_suppression_stats(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid             uuid := auth.uid();
  v_days            integer;
  v_now             timestamptz := statement_timestamp();
  v_start           timestamptz;
  v_prev_start      timestamptz;
  v_active_value    integer;
  v_active_prev     integer;
  v_active_series   jsonb;
  v_optout_value    integer;
  v_optout_prev     integer;
  v_optout_series   jsonb;
  v_manual_value    integer;
  v_manual_prev     integer;
  v_manual_series   jsonb;
  v_prot_value      integer;
  v_prot_prev       integer;
  v_prot_series     jsonb;
  v_total_campaigns integer;
  v_campaigns       jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_admin_or_supervisor(v_uid), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_suppression_read_role_required' USING ERRCODE = '42501';
  END IF;

  v_days := COALESCE(p_days, 30);
  IF v_days < 1 OR v_days > 365 THEN
    RAISE EXCEPTION 'invalid_talkx_suppression_days' USING ERRCODE = '22023';
  END IF;

  v_start := v_now - make_interval(days => v_days);
  v_prev_start := v_start - make_interval(days => v_days);

  -- suprimidos ativos (estoque): nem expirados nem removidos
  SELECT count(*) INTO v_active_value
    FROM public.talkx_blacklist b
   WHERE b.removed_at IS NULL
     AND (b.expires_at IS NULL OR b.expires_at > v_now);

  -- estoque é comparável no INÍCIO do período (v_start), não na janela anterior (v_prev_start)
  SELECT count(*) INTO v_active_prev
    FROM public.talkx_blacklist b
   WHERE b.created_at <= v_start
     AND (b.removed_at IS NULL OR b.removed_at > v_start)
     AND (b.expires_at IS NULL OR b.expires_at > v_start);

  SELECT COALESCE(jsonb_agg(cnt::integer ORDER BY g), '[]'::jsonb) INTO v_active_series
    FROM generate_series(0, 7) AS g
    CROSS JOIN LATERAL (
      SELECT count(*) AS cnt
        FROM public.talkx_blacklist b
       WHERE b.created_at <= v_start + make_interval(days => v_days * (g + 1) / 8)
         AND (b.removed_at IS NULL OR b.removed_at > v_start + make_interval(days => v_days * (g + 1) / 8))
         AND (b.expires_at IS NULL OR b.expires_at > v_start + make_interval(days => v_days * (g + 1) / 8))
    ) s;

  -- opt-outs do período (reason_code='opt_out', o que inclui auto_optout)
  SELECT count(*) INTO v_optout_value
    FROM public.talkx_blacklist b
   WHERE b.reason_code = 'opt_out'
     AND b.created_at >= v_start AND b.created_at <= v_now;

  SELECT count(*) INTO v_optout_prev
    FROM public.talkx_blacklist b
   WHERE b.reason_code = 'opt_out'
     AND b.created_at >= v_prev_start AND b.created_at < v_start;

  SELECT COALESCE(jsonb_agg(cnt::integer ORDER BY g), '[]'::jsonb) INTO v_optout_series
    FROM generate_series(0, 7) AS g
    CROSS JOIN LATERAL (
      SELECT count(*) AS cnt
        FROM public.talkx_blacklist b
       WHERE b.reason_code = 'opt_out'
         AND b.created_at >= v_start + make_interval(days => v_days * g / 8)
         AND b.created_at <  v_start + make_interval(days => v_days * (g + 1) / 8)
    ) s;

  -- bloqueios manuais (origem manual), mesma janela e mesma série
  SELECT count(*) INTO v_manual_value
    FROM public.talkx_blacklist b
   WHERE b.origin = 'manual'
     AND b.created_at >= v_start AND b.created_at <= v_now;

  SELECT count(*) INTO v_manual_prev
    FROM public.talkx_blacklist b
   WHERE b.origin = 'manual'
     AND b.created_at >= v_prev_start AND b.created_at < v_start;

  SELECT COALESCE(jsonb_agg(cnt::integer ORDER BY g), '[]'::jsonb) INTO v_manual_series
    FROM generate_series(0, 7) AS g
    CROSS JOIN LATERAL (
      SELECT count(*) AS cnt
        FROM public.talkx_blacklist b
       WHERE b.origin = 'manual'
         AND b.created_at >= v_start + make_interval(days => v_days * g / 8)
         AND b.created_at <  v_start + make_interval(days => v_days * (g + 1) / 8)
    ) s;

  -- campanhas protegidas (estoque: iniciadas com respect_suppression)
  SELECT count(*) INTO v_prot_value
    FROM public.talkx_campaigns c
   WHERE c.started_at IS NOT NULL AND c.respect_suppression;

  -- estoque é comparável no INÍCIO do período (v_start), não na janela anterior (v_prev_start)
  SELECT count(*) INTO v_prot_prev
    FROM public.talkx_campaigns c
   WHERE c.started_at IS NOT NULL AND c.respect_suppression
     AND c.started_at <= v_start;

  SELECT COALESCE(jsonb_agg(cnt::integer ORDER BY g), '[]'::jsonb) INTO v_prot_series
    FROM generate_series(0, 7) AS g
    CROSS JOIN LATERAL (
      SELECT count(*) AS cnt
        FROM public.talkx_campaigns c
       WHERE c.started_at IS NOT NULL AND c.respect_suppression
         AND c.started_at <= v_start + make_interval(days => v_days * (g + 1) / 8)
    ) s;

  SELECT count(*) INTO v_total_campaigns
    FROM public.talkx_campaigns c
   WHERE c.started_at IS NOT NULL;

  -- campanhas que têm supressão (alimentam o filtro "Campanha")
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.name), '[]'::jsonb)
    INTO v_campaigns
    FROM (
      SELECT DISTINCT tc.id, tc.name
        FROM public.talkx_blacklist b
        JOIN public.talkx_campaigns tc ON tc.id = b.campaign_id
    ) x;

  RETURN jsonb_build_object(
    'period_days',     v_days,
    'active',          jsonb_build_object('value', v_active_value, 'previous', v_active_prev, 'series', v_active_series),
    'optouts',         jsonb_build_object('value', v_optout_value, 'previous', v_optout_prev, 'series', v_optout_series),
    'manual',          jsonb_build_object('value', v_manual_value, 'previous', v_manual_prev, 'series', v_manual_series),
    'protected',       jsonb_build_object('value', v_prot_value,   'previous', v_prot_prev,   'series', v_prot_series),
    'total_campaigns', v_total_campaigns,
    'campaigns',       v_campaigns
  );
END;
$function$
