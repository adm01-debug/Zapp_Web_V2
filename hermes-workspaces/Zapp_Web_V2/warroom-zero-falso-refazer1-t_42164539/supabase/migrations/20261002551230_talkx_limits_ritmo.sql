-- talkx_limits_ritmo
-- versão 20261002551230 reservada para hermes-talkx-limites-ritmo-2610021105c247 em 2026-10-02T12:31:00-03:00 (hermes-db-migrar --nova)
-- rollback: 1) ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS max_per_minute; 2) recriar
--   public.save_talkx_campaign_draft e public.update_talkx_campaign_limits com os corpos de
--   supabase/migrations/20261002451230_talkx_owner_responsible_unify.sql e
--   supabase/migrations/20261002381230_talkx_role_gates.sql; 3) DROP FUNCTION IF EXISTS
--   public.talkx_resolve_speed_pace, public.talkx_connection_send_budget, public.talkx_campaign_pace;
--   4) UPDATE public.talkx_settings SET value = '"balanced"' WHERE key = 'default_speed_profile'; DELETE FROM
--   public.talkx_settings WHERE key IN ('max_per_minute_per_connection','speed_profiles').

-- ============================================================================
-- X018 — limites por minuto, por dia e por conexão + perfis de velocidade
-- ============================================================================
-- Hoje o ritmo é só um intervalo aleatório entre envios com valores vindos do
-- cliente, sem teto por minuto; `daily_limit_per_connection=500` só o Multiplix
-- lê; e o seed `default_speed_profile='balanced'` está FORA do CHECK
-- slow|moderate|fast. Esta migration: (a) coluna max_per_minute; (b) settings
-- de teto por minuto e de perfis de velocidade; (c) corrige o seed; (d) as
-- funções de salvar/atualizar limites passam a DERIVAR intervalo/digitação do
-- perfil (valor do cliente só vale dentro da faixa, senão clampa); (e) RPCs de
-- orçamento por conexão e por campanha.

-- ============================================================================
-- (a) talkx_campaigns.max_per_minute — teto de mensagens por minuto
-- ============================================================================
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS max_per_minute smallint;

ALTER TABLE public.talkx_campaigns
  DROP CONSTRAINT IF EXISTS talkx_campaigns_max_per_minute_check;

ALTER TABLE public.talkx_campaigns
  ADD CONSTRAINT talkx_campaigns_max_per_minute_check
  CHECK (max_per_minute IS NULL OR (max_per_minute BETWEEN 1 AND 60));

-- ============================================================================
-- (b) Settings: teto por minuto + perfis de velocidade + correção do seed
-- ============================================================================
INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('max_per_minute_per_connection', '6',
   'Teto de mensagens por minuto por conexão WhatsApp (Talk X + Multiplix)'),
  ('speed_profiles',
   '{"slow":{"send_interval_min":15000,"send_interval_max":30000,"typing_delay_min":1500,"typing_delay_max":4000},"moderate":{"send_interval_min":8000,"send_interval_max":20000,"typing_delay_min":1500,"typing_delay_max":4000},"fast":{"send_interval_min":3000,"send_interval_max":8000,"typing_delay_min":1500,"typing_delay_max":4000}}',
   'Perfis de velocidade: faixas de intervalo de envio e de digitação (ms), por perfil slow|moderate|fast')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Corrige o seed inválido: o CHECK de speed_profile é slow|moderate|fast, então
-- 'balanced' nunca foi um valor aceito.
UPDATE public.talkx_settings
   SET value = '"moderate"'
 WHERE key = 'default_speed_profile'
   AND (value #>> '{}') = 'balanced';

-- ============================================================================
-- (c) Helper: resolve o perfil e clampa intervalo/digitação na faixa dele
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_resolve_speed_pace(
  p_speed_profile text,
  p_send_interval_min integer,
  p_send_interval_max integer,
  p_typing_delay_min integer,
  p_typing_delay_max integer
)
RETURNS TABLE(
  speed_profile text,
  send_interval_min integer,
  send_interval_max integer,
  typing_delay_min integer,
  typing_delay_max integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_default_profile text;
  v_profiles jsonb;
  v_range jsonb;
  v_profile text;
  v_si_min integer;
  v_si_max integer;
  v_td_min integer;
  v_td_max integer;
BEGIN
  SELECT COALESCE(settings.value #>> '{}', 'moderate')
    INTO v_default_profile
    FROM public.talkx_settings settings
   WHERE settings.key = 'default_speed_profile';

  v_profile := COALESCE(NULLIF(p_speed_profile, ''), v_default_profile, 'moderate');

  SELECT COALESCE(settings.value, '{}'::jsonb)
    INTO v_profiles
    FROM public.talkx_settings settings
   WHERE settings.key = 'speed_profiles';

  v_range := v_profiles -> v_profile;
  IF v_range IS NULL THEN
    v_range := v_profiles -> 'moderate';
  END IF;

  v_si_min := COALESCE((v_range ->> 'send_interval_min')::integer, 8000);
  v_si_max := COALESCE((v_range ->> 'send_interval_max')::integer, 20000);
  v_td_min := COALESCE((v_range ->> 'typing_delay_min')::integer, 1500);
  v_td_max := COALESCE((v_range ->> 'typing_delay_max')::integer, 4000);

  -- Clamp monotônico: cada valor fica dentro de [min, max] do perfil. Defaults
  -- (quando o cliente não manda) caem no limite natural da faixa.
  RETURN QUERY
  SELECT
    v_profile,
    LEAST(GREATEST(COALESCE(p_send_interval_min, v_si_min), v_si_min), v_si_max),
    LEAST(GREATEST(COALESCE(p_send_interval_max, v_si_max), v_si_min), v_si_max),
    LEAST(GREATEST(COALESCE(p_typing_delay_min, v_td_min), v_td_min), v_td_max),
    LEAST(GREATEST(COALESCE(p_typing_delay_max, v_td_max), v_td_min), v_td_max);
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_resolve_speed_pace(text, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_resolve_speed_pace(text, integer, integer, integer, integer)
  TO service_role;

-- ============================================================================
-- (d) RPC talkx_connection_send_budget — orçamento por minuto/dia da conexão
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_connection_send_budget(p_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_minute_limit integer;
  v_day_limit integer;
  v_minute_sent integer;
  v_day_sent integer;
  v_minute_start timestamptz;
  v_day_start timestamptz;
  v_next_day_at timestamptz;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_connection' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE((settings.value)::text::integer, 6)
    INTO v_minute_limit
    FROM public.talkx_settings settings
   WHERE settings.key = 'max_per_minute_per_connection';

  SELECT COALESCE((settings.value)::text::integer, 500)
    INTO v_day_limit
    FROM public.talkx_settings settings
   WHERE settings.key = 'daily_limit_per_connection';

  v_minute_start := statement_timestamp() - interval '1 minute';
  v_day_start := date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')
                 AT TIME ZONE 'America/Sao_Paulo';
  v_next_day_at := v_day_start + interval '1 day';

  SELECT COALESCE(sum(usage.sent), 0)::integer INTO v_minute_sent FROM (
    SELECT count(*) AS sent
      FROM public.talkx_recipients recipient
      JOIN public.talkx_campaigns campaign ON campaign.id = recipient.campaign_id
     WHERE campaign.whatsapp_connection_id = p_connection_id
       AND recipient.sent_at >= v_minute_start
    UNION ALL
    SELECT count(*)
      FROM public.multiplix_recipients recipient
      JOIN public.multiplix_dispatches dispatch ON dispatch.id = recipient.dispatch_id
     WHERE dispatch.whatsapp_connection_id = p_connection_id
       AND recipient.sent_at >= v_minute_start
  ) AS usage;

  SELECT COALESCE(sum(usage.sent), 0)::integer INTO v_day_sent FROM (
    SELECT count(*) AS sent
      FROM public.talkx_recipients recipient
      JOIN public.talkx_campaigns campaign ON campaign.id = recipient.campaign_id
     WHERE campaign.whatsapp_connection_id = p_connection_id
       AND recipient.sent_at >= v_day_start
    UNION ALL
    SELECT count(*)
      FROM public.multiplix_recipients recipient
      JOIN public.multiplix_dispatches dispatch ON dispatch.id = recipient.dispatch_id
     WHERE dispatch.whatsapp_connection_id = p_connection_id
       AND recipient.sent_at >= v_day_start
  ) AS usage;

  RETURN jsonb_build_object(
    'minute_limit', v_minute_limit,
    'minute_sent', v_minute_sent,
    'minute_remaining', GREATEST(v_minute_limit - v_minute_sent, 0),
    'day_limit', v_day_limit,
    'day_sent', v_day_sent,
    'day_remaining', GREATEST(v_day_limit - v_day_sent, 0),
    'next_day_at', v_next_day_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_connection_send_budget(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_connection_send_budget(uuid)
  TO service_role;

-- ============================================================================
-- (e) RPC talkx_campaign_pace — mesmo orçamento, resolvido pela campanha
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_campaign_pace(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_connection_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    NULL; -- service_role passa direto
  ELSIF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT campaign.whatsapp_connection_id
    INTO v_connection_id
    FROM public.talkx_campaigns campaign
   WHERE campaign.id = p_campaign_id;

  IF v_connection_id IS NULL THEN
    RETURN jsonb_build_object(
      'minute_limit', 0, 'minute_sent', 0, 'minute_remaining', 0,
      'day_limit', 0, 'day_sent', 0, 'day_remaining', 0, 'next_day_at', null
    );
  END IF;

  RETURN public.talkx_connection_send_budget(v_connection_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_pace(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_pace(uuid)
  TO service_role, authenticated;

-- ============================================================================
-- (f) save_talkx_campaign_draft — deriva ritmo do perfil + max_per_minute
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_talkx_campaign_draft(
  p_campaign_id uuid,
  p_expected_revision bigint,
  p_creation_key uuid,
  p_payload jsonb
)
RETURNS TABLE(campaign_id uuid, revision bigint, creation_replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_name text;
  v_message_template text;
  v_description text;
  v_objective text;
  v_audience_source text;
  v_audience_filters jsonb;
  v_segment_id uuid;
  v_template_id uuid;
  v_connection_id uuid;
  v_media_url text;
  v_media_type text;
  v_scheduled_at timestamptz;
  v_schedule_timezone text;
  v_window_start time;
  v_window_end time;
  v_speed_profile text;
  v_typing_delay_min integer;
  v_typing_delay_max integer;
  v_send_interval_min integer;
  v_send_interval_max integer;
  v_business_hours_only boolean;
  v_respect_suppression boolean;
  v_confirm_consent boolean;
  v_draft_step integer;
  v_owner uuid;
  v_template_version_id uuid;
  v_requested_status text;
  v_max_per_minute smallint;
  v_pace record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
   FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  -- X014: criar/editar rascunho é ato de admin/supervisor.
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR pg_column_size(p_payload) > 65536 THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_payload' USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(btrim(p_payload ->> 'name'), '');
  v_message_template := COALESCE(p_payload ->> 'message_template', '');
  v_description := p_payload ->> 'description';
  v_objective := p_payload ->> 'objective';
  v_audience_source := p_payload ->> 'audience_source';
  v_audience_filters := COALESCE(p_payload -> 'audience_filters', '{}'::jsonb);
  v_segment_id := NULLIF(p_payload ->> 'segment_id', '')::uuid;
  v_template_id := NULLIF(p_payload ->> 'template_id', '')::uuid;
  v_connection_id := NULLIF(p_payload ->> 'whatsapp_connection_id', '')::uuid;
  v_media_url := p_payload ->> 'media_url';
  v_media_type := p_payload ->> 'media_type';
  v_scheduled_at := NULLIF(p_payload ->> 'scheduled_at', '')::timestamptz;
  v_schedule_timezone := COALESCE(NULLIF(p_payload ->> 'schedule_timezone', ''), 'America/Sao_Paulo');
  v_window_start := NULLIF(p_payload ->> 'send_window_start', '')::time;
  v_window_end := NULLIF(p_payload ->> 'send_window_end', '')::time;
  v_business_hours_only := COALESCE((p_payload ->> 'business_hours_only')::boolean, false);
  v_respect_suppression := COALESCE((p_payload ->> 'respect_suppression')::boolean, true);
  v_confirm_consent := COALESCE((p_payload ->> 'confirm_consent')::boolean, false);
  v_draft_step := COALESCE(NULLIF(p_payload ->> 'draft_step', '')::integer, 1);
  v_owner := NULLIF(p_payload ->> 'owner', '')::uuid;
  v_template_version_id := NULLIF(p_payload ->> 'template_version_id', '')::uuid;
  v_requested_status := NULLIF(p_payload ->> 'status', '');

  -- X018: ritmo derivado do perfil (clamp na faixa) em vez dos valores crus.
  SELECT * INTO v_pace FROM public.talkx_resolve_speed_pace(
    NULLIF(p_payload ->> 'speed_profile', ''),
    NULLIF(p_payload ->> 'send_interval_min', '')::integer,
    NULLIF(p_payload ->> 'send_interval_max', '')::integer,
    NULLIF(p_payload ->> 'typing_delay_min', '')::integer,
    NULLIF(p_payload ->> 'typing_delay_max', '')::integer
  );
  v_speed_profile := v_pace.speed_profile;
  v_send_interval_min := v_pace.send_interval_min;
  v_send_interval_max := v_pace.send_interval_max;
  v_typing_delay_min := v_pace.typing_delay_min;
  v_typing_delay_max := v_pace.typing_delay_max;

  -- X018: max_per_minute (nulo = usa o padrão do setting; acima do teto -> 22023).
  v_max_per_minute := NULLIF(p_payload ->> 'max_per_minute', '')::smallint;

  -- Unificação owner × responsible_id: owner é o ÚNICO responsável.
  IF v_owner IS NULL THEN
    v_owner := v_actor_profile_id;
  END IF;

  -- X017: recusa desmarcar a supressão.
  IF v_respect_suppression IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_respect_suppression_false_nao_liberado' USING ERRCODE = '22023';
  END IF;

  IF v_name IS NULL OR length(v_name) > 200
     OR v_objective IS NULL OR v_audience_source IS NULL
     OR length(v_message_template) > 4096
     OR (v_description IS NOT NULL AND length(v_description) > 4000)
     OR v_objective NOT IN ('vendas', 'engajamento', 'reativacao', 'relacionamento', 'pesquisa', 'institucional')
     OR v_audience_source NOT IN ('contacts', 'segment', 'crm360')
     OR jsonb_typeof(v_audience_filters) <> 'object'
     OR (v_audience_source = 'segment' AND v_segment_id IS NULL)
     OR (v_audience_source <> 'segment' AND v_segment_id IS NOT NULL)
     OR v_send_interval_min > v_send_interval_max
     OR v_typing_delay_min > v_typing_delay_max
     OR v_speed_profile NOT IN ('slow', 'moderate', 'fast')
     OR (v_media_url IS NOT NULL AND (length(v_media_url) > 8192 OR v_media_url !~ '^https://'))
     OR (v_media_type IS NOT NULL AND v_media_type NOT IN ('image', 'video', 'document', 'audio'))
     OR ((v_media_url IS NULL) <> (v_media_type IS NULL))
     OR public.is_valid_talkx_schedule_timezone(v_schedule_timezone) IS NOT TRUE
     OR ((v_window_start IS NULL) <> (v_window_end IS NULL))
     OR (v_window_start IS NOT NULL AND v_window_start >= v_window_end)
     OR (v_draft_step < 1 OR v_draft_step > 4)
     OR (v_requested_status IS NOT NULL AND v_requested_status <> 'draft')
     OR (v_max_per_minute IS NOT NULL AND v_max_per_minute < 1) THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
  END IF;

  -- X018: max_per_minute acima do teto por minuto da conexão -> 22023.
  IF v_max_per_minute IS NOT NULL
     AND v_max_per_minute > COALESCE((SELECT (settings.value)::text::integer
                                        FROM public.talkx_settings settings
                                       WHERE settings.key = 'max_per_minute_per_connection'), 6) THEN
    RAISE EXCEPTION 'talkx_max_per_minute_acima_do_teto' USING ERRCODE = '22023';
  END IF;

  IF v_connection_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.whatsapp_connections connection
        WHERE connection.id = v_connection_id
          AND connection.status = 'connected'
          AND NULLIF(btrim(connection.instance_id), '') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'selected_whatsapp_connection_unavailable' USING ERRCODE = '22023';
  END IF;

  IF p_campaign_id IS NULL THEN
    IF p_creation_key IS NULL THEN
      RAISE EXCEPTION 'talkx_draft_creation_key_required' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.talkx_campaigns (
      name, message_template, description, objective, audience_source,
      audience_filters, segment_id, template_id, whatsapp_connection_id,
      media_url, media_type, scheduled_at, schedule_timezone,
      send_window_start, send_window_end, business_hours_only, speed_profile,
      typing_delay_min, typing_delay_max, send_interval_min, send_interval_max,
      max_per_minute,
      respect_suppression, confirm_consent, draft_step, owner, template_version_id,
      status, created_by, draft_creation_key, revision, created_at, updated_at
    ) VALUES (
      v_name, v_message_template, v_description, v_objective, v_audience_source,
      v_audience_filters, v_segment_id, v_template_id, v_connection_id,
      v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone,
      v_window_start, v_window_end, v_business_hours_only, v_speed_profile,
      v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max,
      v_max_per_minute,
      v_respect_suppression, v_confirm_consent, v_draft_step, v_owner, v_template_version_id,
      'draft', v_actor_profile_id, p_creation_key, 1, v_now, v_now
    )
    ON CONFLICT (created_by, draft_creation_key) WHERE draft_creation_key IS NOT NULL DO NOTHING
    RETURNING * INTO v_campaign;

    IF FOUND THEN
      RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
      RETURN;
    END IF;

    SELECT * INTO v_campaign
      FROM public.talkx_campaigns campaign
     WHERE campaign.created_by = v_actor_profile_id
       AND campaign.draft_creation_key = p_creation_key
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'talkx_draft_creation_recovery_failed' USING ERRCODE = '40001';
    END IF;

    IF v_campaign.name IS DISTINCT FROM v_name
       OR v_campaign.message_template IS DISTINCT FROM v_message_template
       OR v_campaign.description IS DISTINCT FROM v_description
       OR v_campaign.objective IS DISTINCT FROM v_objective
       OR v_campaign.audience_source IS DISTINCT FROM v_audience_source
       OR v_campaign.audience_filters IS DISTINCT FROM v_audience_filters
       OR v_campaign.segment_id IS DISTINCT FROM v_segment_id
       OR v_campaign.template_id IS DISTINCT FROM v_template_id
       OR v_campaign.whatsapp_connection_id IS DISTINCT FROM v_connection_id
       OR v_campaign.media_url IS DISTINCT FROM v_media_url
       OR v_campaign.media_type IS DISTINCT FROM v_media_type
       OR v_campaign.scheduled_at IS DISTINCT FROM v_scheduled_at
       OR v_campaign.schedule_timezone IS DISTINCT FROM v_schedule_timezone
       OR v_campaign.send_window_start IS DISTINCT FROM v_window_start
       OR v_campaign.send_window_end IS DISTINCT FROM v_window_end
       OR v_campaign.business_hours_only IS DISTINCT FROM v_business_hours_only
       OR v_campaign.respect_suppression IS DISTINCT FROM v_respect_suppression
       OR v_campaign.confirm_consent IS DISTINCT FROM v_confirm_consent
       OR v_campaign.draft_step IS DISTINCT FROM v_draft_step
       OR v_campaign.owner IS DISTINCT FROM v_owner
       OR v_campaign.template_version_id IS DISTINCT FROM v_template_version_id
       OR v_campaign.speed_profile IS DISTINCT FROM v_speed_profile
       OR v_campaign.typing_delay_min IS DISTINCT FROM v_typing_delay_min
       OR v_campaign.typing_delay_max IS DISTINCT FROM v_typing_delay_max
       OR v_campaign.send_interval_min IS DISTINCT FROM v_send_interval_min
       OR v_campaign.send_interval_max IS DISTINCT FROM v_send_interval_max
       OR v_campaign.max_per_minute IS DISTINCT FROM v_max_per_minute THEN
      RAISE EXCEPTION 'talkx_draft_creation_key_payload_conflict' USING ERRCODE = '40001';
    END IF;

    RETURN QUERY SELECT v_campaign.id, v_campaign.revision, true;
    RETURN;
  END IF;

  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'talkx_draft_expected_revision_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_not_editable' USING ERRCODE = '55000';
  END IF;
  IF v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  UPDATE public.talkx_campaigns campaign
     SET name = v_name,
         message_template = v_message_template,
         description = v_description,
         objective = v_objective,
         audience_source = v_audience_source,
         audience_filters = v_audience_filters,
         segment_id = v_segment_id,
         template_id = v_template_id,
         whatsapp_connection_id = v_connection_id,
         media_url = v_media_url,
         media_type = v_media_type,
         scheduled_at = v_scheduled_at,
         schedule_timezone = v_schedule_timezone,
         send_window_start = v_window_start,
         send_window_end = v_window_end,
         business_hours_only = v_business_hours_only,
         respect_suppression = v_respect_suppression,
         confirm_consent = v_confirm_consent,
         draft_step = v_draft_step,
         owner = v_owner,
         template_version_id = v_template_version_id,
         speed_profile = v_speed_profile,
         typing_delay_min = v_typing_delay_min,
         typing_delay_max = v_typing_delay_max,
         send_interval_min = v_send_interval_min,
         send_interval_max = v_send_interval_max,
         max_per_minute = v_max_per_minute,
         status = COALESCE(v_requested_status, campaign.status),
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = v_campaign.id
   RETURNING * INTO v_campaign;

  RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  TO authenticated;

-- ============================================================================
-- (g) update_talkx_campaign_limits — deriva ritmo do perfil + max_per_minute
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_talkx_campaign_limits(
  p_campaign_id uuid,
  p_expected_revision bigint,
  p_limits jsonb
)
RETURNS TABLE(campaign_id uuid, revision bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_speed_profile text;
  v_send_interval_min integer;
  v_send_interval_max integer;
  v_typing_delay_min integer;
  v_typing_delay_max integer;
  v_max_per_minute smallint;
  v_send_window_start time;
  v_send_window_end time;
  v_eff_start time;
  v_eff_end time;
  v_business_hours_only boolean;
  v_before jsonb;
  v_after jsonb;
  v_pace record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  -- X014: editar limites de campanha é ato de admin/supervisor.
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_limits IS NULL OR jsonb_typeof(p_limits) <> 'object' OR pg_column_size(p_limits) > 8192 THEN
    RAISE EXCEPTION 'invalid_talkx_limits_payload' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_limits) AS k
     WHERE k NOT IN ('speed_profile','send_interval_min','send_interval_max',
                     'typing_delay_min','typing_delay_max','max_per_minute',
                     'send_window_start','send_window_end','business_hours_only')
  ) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_field' USING ERRCODE = '22023';
  END IF;

  -- Conversões de tipo: erro de conversão vira contrato 22023.
  BEGIN
    v_max_per_minute := NULLIF(p_limits ->> 'max_per_minute', '')::smallint;
    v_send_window_start := NULLIF(p_limits ->> 'send_window_start', '')::time;
    v_send_window_end := NULLIF(p_limits ->> 'send_window_end', '')::time;
    v_business_hours_only := NULLIF(p_limits ->> 'business_hours_only', '')::boolean;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR SQLSTATE '22009' THEN
      RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_expected_revision IS NULL OR v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  -- X018: deriva o ritmo do perfil, clampa valores fora da faixa. Perfil ausente
  -- no payload mantém o atual da campanha; intervalos ausentes derivam do perfil.
  v_pace := NULL;
  SELECT * INTO v_pace FROM public.talkx_resolve_speed_pace(
    CASE WHEN p_limits ? 'speed_profile' THEN NULLIF(p_limits ->> 'speed_profile', '') ELSE v_campaign.speed_profile END,
    NULLIF(p_limits ->> 'send_interval_min', '')::integer,
    NULLIF(p_limits ->> 'send_interval_max', '')::integer,
    NULLIF(p_limits ->> 'typing_delay_min', '')::integer,
    NULLIF(p_limits ->> 'typing_delay_max', '')::integer
  );
  v_speed_profile := v_pace.speed_profile;
  v_send_interval_min := v_pace.send_interval_min;
  v_send_interval_max := v_pace.send_interval_max;
  v_typing_delay_min := v_pace.typing_delay_min;
  v_typing_delay_max := v_pace.typing_delay_max;

  IF v_send_interval_min > v_send_interval_max
     OR v_typing_delay_min > v_typing_delay_max THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END IF;

  -- X018: max_per_minute acima do teto por minuto da conexão -> 22023.
  IF v_max_per_minute IS NOT NULL
     AND v_max_per_minute > COALESCE((SELECT (settings.value)::text::integer
                                        FROM public.talkx_settings settings
                                       WHERE settings.key = 'max_per_minute_per_connection'), 6) THEN
    RAISE EXCEPTION 'talkx_max_per_minute_acima_do_teto' USING ERRCODE = '22023';
  END IF;

  -- Janela de envio EFETIVA (mesma lógica da V09b).
  v_eff_start := CASE WHEN p_limits ? 'send_window_start' THEN v_send_window_start ELSE v_campaign.send_window_start END;
  v_eff_end   := CASE WHEN p_limits ? 'send_window_end'   THEN v_send_window_end   ELSE v_campaign.send_window_end END;
  IF NOT (
    (v_eff_start IS NULL AND v_eff_end IS NULL)
    OR (v_eff_start IS NOT NULL AND v_eff_end IS NOT NULL AND v_eff_start < v_eff_end)
  ) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END IF;

  v_before := jsonb_build_object(
    'speed_profile', v_campaign.speed_profile,
    'send_interval_min', v_campaign.send_interval_min,
    'send_interval_max', v_campaign.send_interval_max,
    'typing_delay_min', v_campaign.typing_delay_min,
    'typing_delay_max', v_campaign.typing_delay_max,
    'max_per_minute', v_campaign.max_per_minute,
    'send_window_start', v_campaign.send_window_start,
    'send_window_end', v_campaign.send_window_end,
    'business_hours_only', v_campaign.business_hours_only
  );

  PERFORM set_config('app.talkx_limits_write', 'on', true);

  UPDATE public.talkx_campaigns campaign
     SET speed_profile = v_speed_profile,
         send_interval_min = v_send_interval_min,
         send_interval_max = v_send_interval_max,
         typing_delay_min = v_typing_delay_min,
         typing_delay_max = v_typing_delay_max,
         max_per_minute = COALESCE(v_max_per_minute, campaign.max_per_minute),
         send_window_start = CASE WHEN p_limits ? 'send_window_start' THEN v_send_window_start ELSE campaign.send_window_start END,
         send_window_end = CASE WHEN p_limits ? 'send_window_end' THEN v_send_window_end ELSE campaign.send_window_end END,
         business_hours_only = COALESCE(v_business_hours_only, campaign.business_hours_only),
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = p_campaign_id
     AND campaign.revision = p_expected_revision
   RETURNING * INTO v_campaign;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  PERFORM set_config('app.talkx_limits_write', '', true);

  v_after := jsonb_build_object(
    'speed_profile', v_campaign.speed_profile,
    'send_interval_min', v_campaign.send_interval_min,
    'send_interval_max', v_campaign.send_interval_max,
    'typing_delay_min', v_campaign.typing_delay_min,
    'typing_delay_max', v_campaign.typing_delay_max,
    'max_per_minute', v_campaign.max_per_minute,
    'send_window_start', v_campaign.send_window_start,
    'send_window_end', v_campaign.send_window_end,
    'business_hours_only', v_campaign.business_hours_only
  );

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (p_campaign_id, 'limits_updated', v_actor_profile_id,
          jsonb_build_object('before', v_before, 'after', v_after)::text);

  RETURN QUERY SELECT p_campaign_id, v_campaign.revision;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_talkx_campaign_limits(uuid, bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_talkx_campaign_limits(uuid, bigint, jsonb)
  TO authenticated;
