-- talkx_role_gates
-- versão 20261002381230 reservada para hermes-role-gates-2610020139abd7 em 2026-10-02T01:57:28-03:00 (hermes-db-migrar --nova)
-- rollback: 1) recriar public.save_talkx_campaign_draft com o corpo de supabase/migrations/20261001281230_talkx_campaigns_draft_step_responsible.sql; 2) recriar public.replace_talkx_draft_recipients com o corpo de supabase/migrations/20260911140000_harden_talkx_campaign_state_transitions.sql; 3) recriar public.update_talkx_campaign_limits com o corpo de supabase/migrations/20260930380000_talkx_update_campaign_limits_22009.sql; 4) recriar public.enforce_talkx_campaign_mutability com o corpo de supabase/migrations/20261001311230_talkx_campaign_worker_lease.sql (sem a recusa de `scheduled` por papel, preservando o GUC app.talkx_worker_write); 5) DROP POLICY IF EXISTS + recriar as policies "Users can create campaigns", "Users can update own campaigns" e "Users can delete own draft campaigns" de public.talkx_campaigns com o corpo de supabase/migrations/20260409000457_96ecc54a-a807-45af-8812-cea1f4a75df1.sql (sem is_admin_or_supervisor); 6) GRANT ALL ON public.talkx_settings TO anon (como em 20260930410000_talkx_settings_replay_idempotent.sql); 7) DROP POLICY IF EXISTS talkx_blacklist_update ON public.talkx_blacklist; 8) DROP POLICY IF EXISTS + recriar "Users can view clicks of own campaigns" em public.talkx_link_clicks com o corpo de supabase/migrations/20260922130000_fix_talkx_campaign_metrics_view_and_link_clicks_rls.sql (sem o ramo admin).
--
-- X014 (Fase 2 · Tela 08/17 · banco). Fecha CAP-096 e CAP-097.
--
-- HOJE: save_talkx_campaign_draft aceita qualquer authenticated com perfil ativo
-- (M:20260912130000:58-72); as policies "Users can create/update own campaigns"
-- não olham papel (M:20260409000457:57-63); o trigger deixa o dono passar
-- draft -> scheduled (M:20260930420000:118-131) e o cron dispara com a service key;
-- talkx_settings tem GRANT ALL para anon (M:20260930410000:31); a policy de UPDATE
-- de talkx_blacklist é alterada sem nunca ter sido criada em migration
-- (M:20260910100000:9-12); cliques só são legíveis pelo dono, sem ramo admin
-- (M:20260922130000:44-55). Papéis em produção: 4 admin, 1 supervisor, 3 agent.
--
-- FAZER (esta migration):
--   (a) save_talkx_campaign_draft, replace_talkx_draft_recipients e
--       update_talkx_campaign_limits exigem is_admin_or_supervisor(auth.uid())
--       (42501 se não for papel). As RPCs são SECURITY DEFINER: o gate usa
--       auth.uid() para ver o CHAMADOR real, não o owner da função.
--   (b) as policies de INSERT/UPDATE/DELETE de talkx_campaigns ganham a mesma
--       condição (idempotentes, mesmos nomes vivos).
--   (c) enforce_talkx_campaign_mutability recusa status='scheduled' vindo de quem
--       não tem papel (defesa em profundidade da RLS), preservando o caminho
--       service_role/pg_cron e o GUC app.talkx_worker_write da X010.
--   (d) REVOKE ALL ON public.talkx_settings FROM anon (authenticated continua lendo).
--   (e) policy de UPDATE de talkx_blacklist criada de forma idempotente (o ALTER
--       de 20260910100000 pressupunha um objeto que nenhuma migration criava).
--   (f) ramo admin/supervisor na leitura de talkx_link_clicks. A leitura que o
--       agente já tem NÃO muda.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + ALTER/CREATE POLICY + REVOKE).
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE POLICY e os CREATE OR
-- REPLACE são replayáveis.
-- nomes-antigos-conferidos: as policies "Users can create campaigns", "Users can
-- update own campaigns" e "Users can delete own draft campaigns" de
-- public.talkx_campaigns são as criadas em 20260409000457 e vivas em produção;
-- "Users can view clicks of own campaigns" é a criada em 20260922130000; o nome
-- talkx_blacklist_update é o objeto vivo que 20260910100000 apenas altera. O DROP
-- IF EXISTS é no-op defensivo para replay em banco limpo.

-- (a) RPCs exigem papel admin/supervisor ---------------------------------------
-- save_talkx_campaign_draft: corpo vigente (20261001281230) + gate de papel logo
-- após a resolução do perfil ativo.
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
  v_responsible_id uuid;
  v_responsible_profile_id uuid;
  v_requested_status text;
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

  -- X014: criar/editar rascunho é ato de admin/supervisor (o front já esconde o
  -- módulo do agente; aqui a barreira é do banco).
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR pg_column_size(p_payload) > 65536 THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_payload' USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(btrim(p_payload ->> 'name'), '');
  -- X009: mensagem ausente/vazia é aceita enquanto o rascunho está em draft.
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
  v_speed_profile := COALESCE(NULLIF(p_payload ->> 'speed_profile', ''), 'moderate');
  v_typing_delay_min := COALESCE(NULLIF(p_payload ->> 'typing_delay_min', '')::integer, 1500);
  v_typing_delay_max := COALESCE(NULLIF(p_payload ->> 'typing_delay_max', '')::integer, 4000);
  v_send_interval_min := COALESCE(NULLIF(p_payload ->> 'send_interval_min', '')::integer, 8000);
  v_send_interval_max := COALESCE(NULLIF(p_payload ->> 'send_interval_max', '')::integer, 20000);
  v_business_hours_only := COALESCE((p_payload ->> 'business_hours_only')::boolean, false);
  v_respect_suppression := COALESCE((p_payload ->> 'respect_suppression')::boolean, true);
  v_confirm_consent := COALESCE((p_payload ->> 'confirm_consent')::boolean, false);
  -- X009: passo do wizard, padrão 1 quando o payload não traz draft_step.
  v_draft_step := COALESCE(NULLIF(p_payload ->> 'draft_step', '')::integer, 1);
  v_owner := NULLIF(p_payload ->> 'owner', '')::uuid;
  v_responsible_id := NULLIF(p_payload ->> 'responsible_id', '')::uuid;
  v_requested_status := NULLIF(p_payload ->> 'status', '');

  -- X009: resolve o responsável. Ausente -> o próprio ator. Explícito -> precisa ser
  -- um perfil ativo com papel admin ou supervisor (senão 42501).
  IF v_responsible_id IS NULL THEN
    v_responsible_profile_id := v_actor_profile_id;
  ELSE
    v_responsible_profile_id := v_responsible_id;
    IF NOT EXISTS (
      SELECT 1
        FROM public.profiles responsible
       WHERE responsible.id = v_responsible_id
         AND responsible.is_active = true
         AND COALESCE(public.is_admin_or_supervisor(responsible.user_id), false) IS TRUE
    ) THEN
      RAISE EXCEPTION 'talkx_responsible_not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- V21: desmarcar respect_suppression é ação restrita a admin/supervisor.
  IF v_respect_suppression IS NOT TRUE
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_respect_suppression_admin_only' USING ERRCODE = '42501';
  END IF;

  -- X009: mensagem vazia permitida em draft (limite 4.096); objective/audience_source
  -- seguem obrigatórios (colunas NOT NULL no schema).
  IF v_name IS NULL OR length(v_name) > 200
     OR v_objective IS NULL OR v_audience_source IS NULL
     OR length(v_message_template) > 4096
     OR (v_description IS NOT NULL AND length(v_description) > 4000)
     OR v_objective NOT IN ('vendas', 'engajamento', 'reativacao', 'relacionamento', 'pesquisa', 'institucional')
     OR v_audience_source NOT IN ('contacts', 'segment', 'crm360')
     OR jsonb_typeof(v_audience_filters) <> 'object'
     OR (v_audience_source = 'segment' AND v_segment_id IS NULL)
     OR (v_audience_source <> 'segment' AND v_segment_id IS NOT NULL)
     OR v_typing_delay_min < 0 OR v_typing_delay_min > v_typing_delay_max OR v_typing_delay_max > 60000
     OR v_send_interval_min < 0 OR v_send_interval_min > v_send_interval_max OR v_send_interval_max > 300000
     OR v_speed_profile NOT IN ('slow', 'moderate', 'fast')
     OR (v_media_url IS NOT NULL AND (length(v_media_url) > 8192 OR v_media_url !~ '^https://'))
     OR (v_media_type IS NOT NULL AND v_media_type NOT IN ('image', 'video', 'document', 'audio'))
     OR ((v_media_url IS NULL) <> (v_media_type IS NULL))
     OR public.is_valid_talkx_schedule_timezone(v_schedule_timezone) IS NOT TRUE
     OR ((v_window_start IS NULL) <> (v_window_end IS NULL))
     OR (v_window_start IS NOT NULL AND v_window_start >= v_window_end)
     OR (v_draft_step < 1 OR v_draft_step > 4)
     OR (v_requested_status IS NOT NULL AND v_requested_status <> 'draft') THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
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
      respect_suppression, confirm_consent, draft_step, owner, responsible_id,
      status, created_by, draft_creation_key, revision, created_at, updated_at
    ) VALUES (
      v_name, v_message_template, v_description, v_objective, v_audience_source,
      v_audience_filters, v_segment_id, v_template_id, v_connection_id,
      v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone,
      v_window_start, v_window_end, v_business_hours_only, v_speed_profile,
      v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max,
      v_respect_suppression, v_confirm_consent, v_draft_step, v_owner, v_responsible_profile_id,
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
       OR v_campaign.responsible_id IS DISTINCT FROM v_responsible_profile_id
       OR v_campaign.speed_profile IS DISTINCT FROM v_speed_profile
       OR v_campaign.typing_delay_min IS DISTINCT FROM v_typing_delay_min
       OR v_campaign.typing_delay_max IS DISTINCT FROM v_typing_delay_max
       OR v_campaign.send_interval_min IS DISTINCT FROM v_send_interval_min
       OR v_campaign.send_interval_max IS DISTINCT FROM v_send_interval_max THEN
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
         responsible_id = v_responsible_profile_id,
         speed_profile = v_speed_profile,
         typing_delay_min = v_typing_delay_min,
         typing_delay_max = v_typing_delay_max,
         send_interval_min = v_send_interval_min,
         send_interval_max = v_send_interval_max,
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

-- replace_talkx_draft_recipients: corpo vigente (20260911140000) + gate de papel.
CREATE OR REPLACE FUNCTION public.replace_talkx_draft_recipients(
  p_campaign_id uuid,
  p_contact_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_profile_id uuid;
  v_contact_ids uuid[];
  v_requested_count integer;
  v_visible_count integer;
  v_recipient_count integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL OR p_contact_ids IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_recipient_snapshot' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_contact_ids) AS requested(id) WHERE requested.id IS NULL) THEN
    RAISE EXCEPTION 'invalid_talkx_recipient_id' USING ERRCODE = '22023';
  END IF;

  SELECT profile.id
    INTO v_profile_id
    FROM public.profiles AS profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  -- X014: trocar a audiência de um rascunho é ato de admin/supervisor.
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_campaign
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND
     OR (v_campaign.created_by IS DISTINCT FROM v_profile_id
         AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE) THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_recipients_locked' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT requested.id ORDER BY requested.id), ARRAY[]::uuid[])
    INTO v_contact_ids
    FROM unnest(p_contact_ids) AS requested(id);
  v_requested_count := cardinality(v_contact_ids);

  SELECT count(*)::integer
    INTO v_visible_count
    FROM public.contacts AS contact
   WHERE contact.id = ANY(v_contact_ids)
     AND public.is_contact_visible_to_user(contact.id, auth.uid()) IS TRUE;

  IF v_visible_count <> v_requested_count THEN
    RAISE EXCEPTION 'talkx_recipient_not_authorized' USING ERRCODE = '42501';
  END IF;

  -- This transaction-scoped marker is consumed by the table triggers below.
  -- It is not supplied by the client and resets automatically at transaction end.
  PERFORM set_config('app.talkx_recipient_snapshot_write', 'on', true);

  DELETE FROM public.talkx_recipients
   WHERE campaign_id = p_campaign_id;

  INSERT INTO public.talkx_recipients (campaign_id, contact_id)
  SELECT p_campaign_id, requested.id
    FROM unnest(v_contact_ids) AS requested(id);

  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;

  UPDATE public.talkx_campaigns
     SET total_recipients = v_recipient_count,
         updated_at = statement_timestamp()
   WHERE id = p_campaign_id;

  RETURN v_recipient_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_talkx_draft_recipients(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_talkx_draft_recipients(uuid, uuid[])
  TO authenticated;

-- update_talkx_campaign_limits: corpo vigente (20260930380000) + gate de papel.
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
  v_send_window_start time;
  v_send_window_end time;
  v_eff_start time;
  v_eff_end time;
  v_business_hours_only boolean;
  v_before jsonb;
  v_after jsonb;
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
                     'typing_delay_min','typing_delay_max','send_window_start',
                     'send_window_end','business_hours_only')
  ) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_field' USING ERRCODE = '22023';
  END IF;

  -- Conversões de tipo: qualquer erro de conversão (texto inválido, hora inválida,
  -- número fora do range, offset de fuso fora de faixa) vira o erro de contrato
  -- 22023 — nunca um 22P02/22003/22007/22008/22009 cru.
  BEGIN
    v_speed_profile := NULLIF(p_limits ->> 'speed_profile', '');
    v_send_interval_min := NULLIF(p_limits ->> 'send_interval_min', '')::integer;
    v_send_interval_max := NULLIF(p_limits ->> 'send_interval_max', '')::integer;
    v_typing_delay_min := NULLIF(p_limits ->> 'typing_delay_min', '')::integer;
    v_typing_delay_max := NULLIF(p_limits ->> 'typing_delay_max', '')::integer;
    v_send_window_start := NULLIF(p_limits ->> 'send_window_start', '')::time;
    v_send_window_end := NULLIF(p_limits ->> 'send_window_end', '')::time;
    v_business_hours_only := NULLIF(p_limits ->> 'business_hours_only', '')::boolean;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR SQLSTATE '22009' THEN
      RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END;

  -- Validação independente de estado (speed/intervals/typing). A janela de envio é
  -- validada DEPOIS do carregamento da campanha, porque o resultado efetivo depende
  -- do valor atual quando a chave está ausente.
  IF (v_speed_profile IS NOT NULL AND v_speed_profile NOT IN ('slow','moderate','fast'))
     OR (v_send_interval_min IS NOT NULL AND v_send_interval_min < 1)
     OR (v_send_interval_max IS NOT NULL AND v_send_interval_max < 1)
     OR (v_send_interval_min IS NOT NULL AND v_send_interval_max IS NOT NULL
         AND v_send_interval_min > v_send_interval_max)
     OR (v_typing_delay_min IS NOT NULL AND v_typing_delay_min < 0)
     OR (v_typing_delay_max IS NOT NULL AND v_typing_delay_max < 0)
     OR (v_typing_delay_min IS NOT NULL AND v_typing_delay_max IS NOT NULL
         AND v_typing_delay_min > v_typing_delay_max) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
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
  IF p_expected_revision IS NULL OR v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  -- Janela de envio EFETIVA (mesma lógica da V09b): espelha a CHECK da tabela e emite
  -- 22023 no lugar do 23514 cru.
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
    'send_window_start', v_campaign.send_window_start,
    'send_window_end', v_campaign.send_window_end,
    'business_hours_only', v_campaign.business_hours_only
  );

  PERFORM set_config('app.talkx_limits_write', 'on', true);

  UPDATE public.talkx_campaigns campaign
     SET speed_profile = COALESCE(v_speed_profile, campaign.speed_profile),
         send_interval_min = COALESCE(v_send_interval_min, campaign.send_interval_min),
         send_interval_max = COALESCE(v_send_interval_max, campaign.send_interval_max),
         typing_delay_min = COALESCE(v_typing_delay_min, campaign.typing_delay_min),
         typing_delay_max = COALESCE(v_typing_delay_max, campaign.typing_delay_max),
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

COMMENT ON FUNCTION public.update_talkx_campaign_limits(uuid, bigint, jsonb) IS
  'Talk X: sanção para editar limites de envio de campanha em qualquer status (admin/supervisor), com validação de whitelist, faixas, janela de envio efetiva e revisão otimista. Conversões de tipo endurecidas (22023 em vez de 22P02/22003/22007/22008/22009).';

-- (b) policies de talkx_campaigns exigem papel admin/supervisor -----------------
-- Idempotente (DROP IF EXISTS + CREATE com os MESMOS nomes vivos). A condição de
-- carteira (created_by) é preservada; a de papel é acrescentada. A leitura do
-- agente NÃO muda (policies de SELECT intocadas).
DROP POLICY IF EXISTS "Users can create campaigns" ON public.talkx_campaigns;
CREATE POLICY "Users can create campaigns"
  ON public.talkx_campaigns FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND public.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own campaigns" ON public.talkx_campaigns;
CREATE POLICY "Users can update own campaigns"
  ON public.talkx_campaigns FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND public.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own draft campaigns" ON public.talkx_campaigns;
CREATE POLICY "Users can delete own draft campaigns"
  ON public.talkx_campaigns FOR DELETE TO authenticated
  USING (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND public.is_admin_or_supervisor(auth.uid())
    AND status = 'draft'
  );

-- (c) trigger recusa 'scheduled' vindo de quem não tem papel --------------------
-- Corpo vigente (20261001311230, X010) preservado: bloco de worker no topo (GUC
-- app.talkx_worker_write), curto-circuito de service_role/pg_cron e o escape hatch
-- app.talkx_limits_write. Acrescenta-se apenas a recusa de status='scheduled' para
-- chamador authenticated sem papel. A transição via RPC (SECURITY DEFINER) roda com
-- auth.role()='authenticated' e é coberta pelo gate porque as RPCs já exigem papel.
CREATE OR REPLACE FUNCTION public.enforce_talkx_campaign_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- X010: worker_id/worker_lease_expires_at NUNCA são escritos à mão. Só a RPC de
  -- lease (claim/release) liga app.talkx_worker_write, de forma transacional. Vale
  -- para QUALQUER papel — inclusive service_role — porque a trava é por campanha,
  -- não por destinatário.
  IF TG_OP = 'UPDATE'
     AND (NEW.worker_id IS DISTINCT FROM OLD.worker_id
          OR NEW.worker_lease_expires_at IS DISTINCT FROM OLD.worker_lease_expires_at)
     AND current_setting('app.talkx_worker_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_campaign_worker_managed_by_lease' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'talkx_campaign_insert_must_be_draft' USING ERRCODE = '22023';
    END IF;
    IF NEW.total_recipients <> 0
       OR NEW.sent_count <> 0
       OR NEW.failed_count <> 0
       OR NEW.delivered_count <> 0
       OR NEW.outcome_unknown_count <> 0
       OR NEW.replied_count <> 0
       OR NEW.started_at IS NOT NULL
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'talkx_campaign_delete_denied' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'talkx_campaign_owner_immutable' USING ERRCODE = '42501';
  END IF;

  -- Escape hatch sancionado: só a RPC update_talkx_campaign_limits liga essa flag
  -- (transacional, nunca vaza para outra sessão). Ele permite os limites mudarem em
  -- qualquer status, mas status/dono/estado de entrega continuam geridos pelo worker
  -- e pelo dono. Defesa em profundidade (achado #6): o GUC sozinho não basta — o
  -- chamador precisa ser o dono da campanha (perfil ativo) ou admin/supervisor.
  IF current_setting('app.talkx_limits_write', true) = 'on' THEN
    IF NOT (
      EXISTS (
        SELECT 1
          FROM public.profiles profile
         WHERE profile.user_id = auth.uid()
           AND profile.is_active = true
           AND profile.id = NEW.created_by
      )
      OR COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS TRUE
    ) THEN
      RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
    END IF;
    IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
       OR NEW.sent_count IS DISTINCT FROM OLD.sent_count
       OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
       OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
       OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
       OR NEW.replied_count IS DISTINCT FROM OLD.replied_count
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('draft', 'scheduled')
     OR NEW.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
  END IF;

  -- X014: agendar (ou manter agendado) é ato de admin/supervisor. A RLS de UPDATE
  -- também exige o papel; aqui é defesa em profundidade contra quem alcança a
  -- tabela por caminho que não passe pela policy.
  IF NEW.status = 'scheduled'
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_schedule_role_required' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'scheduled'
     AND (NEW.scheduled_at IS NULL OR NEW.total_recipients <= 0) THEN
    RAISE EXCEPTION 'talkx_schedule_requires_audience_and_timestamp' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'scheduled'
     AND NEW.scheduled_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'talkx_schedule_must_be_future' USING ERRCODE = '22023';
  END IF;

  -- X009: sair de draft exige mensagem não vazia OU mídia — uma campanha agendada
  -- sem nada para enviar é recusada.
  IF NEW.status = 'scheduled'
     AND btrim(COALESCE(NEW.message_template, '')) = ''
     AND NEW.media_url IS NULL THEN
    RAISE EXCEPTION 'talkx_schedule_requires_message_or_media' USING ERRCODE = '22023';
  END IF;

  IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
     AND current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_recipient_count_managed' USING ERRCODE = '42501';
  END IF;

  IF NEW.sent_count IS DISTINCT FROM OLD.sent_count
     OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
     OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
     OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
     OR NEW.replied_count IS DISTINCT FROM OLD.replied_count
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_talkx_campaign_mutability ON public.talkx_campaigns;
CREATE TRIGGER enforce_talkx_campaign_mutability
  BEFORE INSERT OR DELETE OR UPDATE ON public.talkx_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();

-- (d) talkx_settings: anon perde o acesso à tabela ------------------------------
-- O front autenticado continua lendo (policy authenticated_read_talkx_settings);
-- serviço/worker usam service_role.
REVOKE ALL ON public.talkx_settings FROM anon;

-- (e) policy de UPDATE de talkx_blacklist criada de forma idempotente -----------
-- 20260910100000 só ALTERava esta policy, que nunca nasceu de migration. Nome vivo
-- preservado; corpo restritivo idêntico ao que o ALTER instalava.
DROP POLICY IF EXISTS talkx_blacklist_update ON public.talkx_blacklist;
CREATE POLICY talkx_blacklist_update
  ON public.talkx_blacklist FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- (f) talkx_link_clicks: ramo admin/supervisor na leitura -----------------------
-- A leitura do dono da campanha permanece; só se acrescenta o ramo de papel.
DROP POLICY IF EXISTS "Users can view clicks of own campaigns" ON public.talkx_link_clicks;
CREATE POLICY "Users can view clicks of own campaigns"
  ON public.talkx_link_clicks FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR link_id IN (
      SELECT tl.id
      FROM public.talkx_links tl
      JOIN public.talkx_campaigns tc ON tc.id = tl.campaign_id
      WHERE tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    )
  );

-- Fail-closed: se qualquer nome sumir (ex.: um CREATE que não colou), a migration
-- aborta em vez de deixar o contrato pela metade.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.save_talkx_campaign_draft(uuid,bigint,uuid,jsonb)'),
      ('public.replace_talkx_draft_recipients(uuid,uuid[])'),
      ('public.update_talkx_campaign_limits(uuid,bigint,jsonb)'),
      ('public.enforce_talkx_campaign_mutability()')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_role_gates_rpcs_ausentes: %', v_missing;
  END IF;

  SELECT string_agg(policyname, ', ') INTO v_missing
  FROM (
    VALUES
      ('Users can create campaigns'),
      ('Users can update own campaigns'),
      ('Users can delete own draft campaigns')
  ) AS esperado(policyname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies pol
     WHERE pol.schemaname = 'public'
       AND pol.tablename = 'talkx_campaigns'
       AND pol.policyname = esperado.policyname
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_role_gates_policies_ausentes: %', v_missing;
  END IF;
END;
$$;
