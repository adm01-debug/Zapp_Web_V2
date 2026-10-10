-- Rollback:
--   drop function if exists public.talkx_campaign_launch_checks(uuid);
--
-- N-098 / X120: checagens de lançamento da campanha feitas no servidor.
--
-- HOJE: a prontidão é calculada no navegador com 3 condições (Delivery:183-186) e
-- ninguém impede um cliente adulterado de pular a conferência.
--
-- FAZER: public.talkx_campaign_launch_checks(p_campaign_id uuid) returns jsonb,
-- somente leitura, devolve uma lista {code, severity (block|warn|ok), step, count,
-- message}. Cobre: connection_ready, audience_not_empty, message_present,
-- template_approved e schedule_reachable. NÃO FEITO (restante de X120):
-- variables_resolved, suppression_applied, consent, daily_limit, connection_busy.
--
-- Acesso: dono da campanha ou admin/supervisor (42501 para os demais). SECURITY
-- DEFINER com search_path fixo; REVOKE de PUBLIC/anon, GRANT só a authenticated.

CREATE OR REPLACE FUNCTION public.talkx_campaign_launch_checks(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_actor_profile_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_conn_ok boolean;
  v_audience integer;
  v_template_status text;
  v_hours jsonb;
  v_bh_start time := time '08:00';
  v_bh_end time := time '18:00';
  v_bh_days integer[] := ARRAY[1, 2, 3, 4, 5];
  v_ref timestamptz;
  v_local timestamp;
  v_local_time time;
  v_in_window boolean := true;
  v_reason text := NULL;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid() AND profile.is_active = true
   LIMIT 1;

  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE
     AND (v_actor_profile_id IS NULL
          OR v_actor_profile_id IS DISTINCT FROM COALESCE(v_campaign.owner, v_campaign.created_by)) THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  -- connection_ready: conexão escolhida, viva e com instância.
  SELECT (c.status = 'connected' AND NULLIF(btrim(COALESCE(c.instance_id, '')), '') IS NOT NULL)
    INTO v_conn_ok
    FROM public.whatsapp_connections c
   WHERE c.id = v_campaign.whatsapp_connection_id;
  v_items := v_items || jsonb_build_object(
    'code', 'connection_ready', 'step', 3, 'count', 0,
    'severity', CASE WHEN COALESCE(v_conn_ok, false) THEN 'ok' ELSE 'block' END,
    'message', CASE WHEN COALESCE(v_conn_ok, false) THEN 'Conexão WhatsApp pronta.'
                    ELSE 'Escolha uma conexão WhatsApp conectada.' END);

  -- audience_not_empty: destinatários pendentes (lista vazia reprova).
  SELECT count(*) INTO v_audience
    FROM public.talkx_recipients r
   WHERE r.campaign_id = v_campaign.id AND r.status = 'pending';
  v_items := v_items || jsonb_build_object(
    'code', 'audience_not_empty', 'step', 1, 'count', v_audience,
    'severity', CASE WHEN v_audience > 0 THEN 'ok' ELSE 'block' END,
    'message', CASE WHEN v_audience > 0 THEN v_audience || ' destinatários elegíveis.'
                    ELSE 'O público está vazio.' END);

  -- message_present
  v_items := v_items || jsonb_build_object(
    'code', 'message_present', 'step', 2, 'count', 0,
    'severity', CASE WHEN NULLIF(btrim(v_campaign.message_template), '') IS NOT NULL
                       OR NULLIF(btrim(COALESCE(v_campaign.media_url, '')), '') IS NOT NULL
                     THEN 'ok' ELSE 'block' END,
    'message', CASE WHEN NULLIF(btrim(v_campaign.message_template), '') IS NOT NULL
                       OR NULLIF(btrim(COALESCE(v_campaign.media_url, '')), '') IS NOT NULL
                    THEN 'Mensagem preenchida.' ELSE 'Escreva a mensagem ou anexe uma mídia.' END);

  -- template_approved: sem template ou template fora de "approved" reprova.
  SELECT t.status INTO v_template_status
    FROM public.talkx_templates t WHERE t.id = v_campaign.template_id;
  v_items := v_items || jsonb_build_object(
    'code', 'template_approved', 'step', 2, 'count', 0,
    'severity', CASE WHEN v_template_status = 'approved' THEN 'ok' ELSE 'block' END,
    'message', CASE WHEN v_template_status = 'approved' THEN 'Template aprovado.'
                    ELSE 'Escolha um template aprovado.' END);

  -- schedule_reachable: o instante de início (agendado ou agora) precisa cair
  -- dentro da janela da campanha e do horário comercial, se exigido.
  BEGIN
    v_ref := COALESCE(v_campaign.scheduled_at, statement_timestamp());
    v_local := v_ref AT TIME ZONE v_campaign.schedule_timezone;
    v_local_time := v_local::time;

    IF v_campaign.send_window_start IS NOT NULL AND v_campaign.send_window_end IS NOT NULL THEN
      IF v_campaign.send_window_start = v_campaign.send_window_end THEN
        v_in_window := false;
        v_reason := 'A janela de envio está vazia.';
      ELSIF v_campaign.send_window_start < v_campaign.send_window_end THEN
        v_in_window := v_local_time >= v_campaign.send_window_start
                   AND v_local_time <  v_campaign.send_window_end;
      ELSE
        v_in_window := v_local_time >= v_campaign.send_window_start
                    OR v_local_time <  v_campaign.send_window_end;
      END IF;
      IF NOT v_in_window AND v_reason IS NULL THEN
        v_reason := 'O início cai fora da janela de envio.';
      END IF;
    END IF;

    IF v_in_window AND v_campaign.business_hours_only THEN
      SELECT s.value INTO v_hours FROM public.talkx_settings s WHERE s.key = 'business_hours';
      IF v_hours IS NOT NULL AND jsonb_typeof(v_hours) = 'string' THEN
        v_hours := (v_hours #>> '{}')::jsonb;
      END IF;
      IF v_hours IS NOT NULL AND jsonb_typeof(v_hours) = 'object' THEN
        v_bh_start := (v_hours ->> 'start')::time;
        v_bh_end := (v_hours ->> 'end')::time;
        SELECT array_agg(d::integer) INTO v_bh_days FROM jsonb_array_elements_text(v_hours -> 'days') d;
      END IF;
      IF v_bh_days IS NULL OR cardinality(v_bh_days) = 0
         OR NOT (extract(dow FROM v_local)::integer = ANY (v_bh_days))
         OR v_local_time < v_bh_start OR v_local_time >= v_bh_end THEN
        v_in_window := false;
        v_reason := 'O início cai fora do horário comercial.';
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- fuso ou horário comercial inválido: fecha, nunca libera.
    v_in_window := false;
    v_reason := 'Fuso ou horário comercial inválido.';
  END;
  v_items := v_items || jsonb_build_object(
    'code', 'schedule_reachable', 'step', 3, 'count', 0,
    'severity', CASE WHEN v_in_window THEN 'ok' ELSE 'block' END,
    'message', CASE WHEN v_in_window THEN 'Início dentro da janela de envio.' ELSE v_reason END);

  RETURN v_items;
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_launch_checks(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.talkx_campaign_launch_checks(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_launch_checks(uuid) TO authenticated;
