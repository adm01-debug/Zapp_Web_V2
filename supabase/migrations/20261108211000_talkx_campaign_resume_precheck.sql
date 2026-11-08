-- N-097 (X142) — talkx_campaign_resume_precheck
-- Pré-checagem de retomada de campanha TalkX pausada.
-- Retorna { can_resume, blockers, connection_status, window_open, suppressed_pending_recipients }.
-- Blockers possíveis: connection_not_connected, outside_send_window, recipients_suppressed.

CREATE OR REPLACE FUNCTION public.talkx_campaign_resume_precheck(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign          public.talkx_campaigns%ROWTYPE;
  v_conn_status       text;
  v_conn_ok           boolean;
  v_blockers          text[] := '{}';
  v_window_open       boolean := true;
  v_tz                text;
  v_local             timestamp;
  v_local_min         integer;
  v_win_start_min     integer;
  v_win_end_min       integer;
  v_bh                jsonb;
  v_bh_start          text;
  v_bh_end            text;
  v_bh_start_min      integer;
  v_bh_end_min        integer;
  v_bh_days           jsonb;
  v_dow               integer;
BEGIN
  -- Restrição: apenas usuários autenticados com perfil admin/supervisor
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns
   WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- ── 1. Conexão WhatsApp ───────────────────────────────────────────────────
  SELECT c.status INTO v_conn_status
    FROM public.whatsapp_connections c
   WHERE c.id = v_campaign.whatsapp_connection_id;

  v_conn_ok := (v_conn_status = 'connected');
  IF NOT COALESCE(v_conn_ok, false) THEN
    v_blockers := v_blockers || ARRAY['connection_not_connected'];
  END IF;

  -- ── 2. Janela de envio (send_window + business_hours_only) ───────────────
  BEGIN
    v_tz    := COALESCE(NULLIF(btrim(v_campaign.schedule_timezone), ''), 'America/Sao_Paulo');
    v_local := now() AT TIME ZONE v_tz;
    v_local_min := EXTRACT(hour FROM v_local)::integer * 60
                 + EXTRACT(minute FROM v_local)::integer;

    IF v_campaign.send_window_start IS NOT NULL AND v_campaign.send_window_end IS NOT NULL THEN
      v_win_start_min := EXTRACT(hour FROM v_campaign.send_window_start)::integer * 60
                       + EXTRACT(minute FROM v_campaign.send_window_start)::integer;
      v_win_end_min   := EXTRACT(hour FROM v_campaign.send_window_end)::integer * 60
                       + EXTRACT(minute FROM v_campaign.send_window_end)::integer;
      IF v_local_min < v_win_start_min OR v_local_min >= v_win_end_min THEN
        v_window_open := false;
      END IF;
    END IF;

    IF v_window_open AND v_campaign.business_hours_only THEN
      SELECT s.value INTO v_bh FROM public.talkx_settings s WHERE s.key = 'business_hours';
      v_bh_days  := COALESCE(v_bh -> 'days', '[1,2,3,4,5]'::jsonb);
      v_bh_start := COALESCE(v_bh ->> 'start', '08:00');
      v_bh_end   := COALESCE(v_bh ->> 'end',   '18:00');
      v_dow      := EXTRACT(dow FROM v_local)::integer;

      IF NOT (v_bh_days @> to_jsonb(v_dow)) THEN
        v_window_open := false;
      ELSE
        v_bh_start_min := split_part(v_bh_start, ':', 1)::integer * 60
                        + split_part(v_bh_start, ':', 2)::integer;
        v_bh_end_min   := split_part(v_bh_end,   ':', 1)::integer * 60
                        + split_part(v_bh_end,   ':', 2)::integer;
        IF v_local_min < v_bh_start_min OR v_local_min >= v_bh_end_min THEN
          v_window_open := false;
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- fuso ou horário comercial inválido → fecha a janela de forma conservadora
    v_window_open := false;
  END;

  IF NOT v_window_open THEN
    v_blockers := v_blockers || ARRAY['outside_send_window'];
  END IF;

  -- ── 3. Destinatários pendentes suprimidos ────────────────────────────────
  -- A tabela de supressão (X070) ainda não existe no schema; retorna 0.
  -- Quando talkx_suppression_reasons for criada, adicionar a contagem aqui.

  RETURN jsonb_build_object(
    'can_resume',                    cardinality(v_blockers) = 0,
    'blockers',                      to_jsonb(v_blockers),
    'connection_status',             v_conn_status,
    'window_open',                   v_window_open,
    'suppressed_pending_recipients', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_campaign_resume_precheck(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_resume_precheck(uuid) TO authenticated;
