-- talkx_audience_snapshot
-- versão 20261002421230 reservada para hermes-audience-snapshot-26100207097018 em 2026-10-02T07:09:14-03:00 (hermes-db-migrar --nova)
-- rollback: 1) recriar public.replace_talkx_draft_recipients e public.save_talkx_campaign_draft com os corpos de supabase/migrations/20261002381230_talkx_role_gates.sql; 2) DROP FUNCTION IF EXISTS public.snapshot_talkx_campaign_audience(uuid, bigint); 3) ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS audience_snapshot_at; (a coluna respect_suppression nasceu na V21/20260930640000 e permanece).
--
-- X017 (Fase 2 · Tela 06/08/09/10 · banco + front/hook). Fecha CAP-004, CAP-028, CAP-030, CAP-103.
--
-- HOJE: o wizard resolve os ids no navegador e os envia a
-- replace_talkx_draft_recipients(p_campaign_id, p_contact_ids) (M:20260911140000:5-97),
-- que confere visibilidade mas nao deleted_at/LID/formato do telefone. A flag
-- respectSuppression so existe no estado do wizard (editor:563) e a supressao e
-- filtrada no cliente com a lista inteira da blacklist + .in('id', contactIds).
--
-- FAZER (esta migration):
--   (a) colunas talkx_campaigns.respect_suppression (ja existe desde a V21; ADD
--       COLUMN IF NOT EXISTS deixa o contrato explicito/replayavel) e
--       audience_snapshot_at timestamptz;
--   (b) save_talkx_campaign_draft aceita a flag respect_suppression no payload e
--       RECUSA o valor false com 22023 ate a decisao N12 (a coluna ja grava true
--       hoje; nenhuma sobrecarga nova de assinatura e criada);
--   (c) RPC snapshot_talkx_campaign_audience(p_campaign_id, p_expected_revision):
--       le do PROPRIO rascunho a origem (segmento/audience_filters), a selecao
--       manual (audience_filters->'contact_ids') e a flag de supressao, chama a
--       funcao interna talkx_audience_query (X016, M:20261002391230) e regrava
--       talkx_recipients + total_recipients + audience_snapshot_at numa unica
--       transacao, devolvendo jsonb {eligible, suppressed, skipped_invalid};
--   (d) replace_talkx_draft_recipients aplica o MESMO criterio de elegivel
--       (deleted_at IS NULL, is_lid_legacy=false, phone ~ '^[0-9]{10,15}$' e
--       visivel), alem da visibilidade que ja existia.
--
-- FRONT (esta mudanca): o editor troca resolucao + filtro de blacklist + replace
-- por UMA chamada a snapshot_talkx_campaign_audience; a query talkx-blacklist-ids
-- sai; countAudience/resolveAudience passam a falar com talkx_resolve_audience.
--
-- Classe: contrato (ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION dos dois
-- RPCs vigentes + RPC nova). Idempotente/replayavel: IF NOT EXISTS e CREATE OR
-- REPLACE. Os corpos de save_talkx_campaign_draft e replace_talkx_draft_recipients
-- sao os vigentes pos-X014 (20261002381230) com as mudancas acima.
--
-- Dependencia: exige a X016 (20261002391230) ja mergeada, que define
-- public.talkx_audience_query(jsonb, uuid[], boolean).

-- (a) colunas do contrato -------------------------------------------------------
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS respect_suppression boolean NOT NULL DEFAULT true;
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS audience_snapshot_at timestamptz;

COMMENT ON COLUMN public.talkx_campaigns.audience_snapshot_at IS
  'Talk X (X017): instante em que snapshot_talkx_campaign_audience regravou talkx_recipients/total_recipients a partir do rascunho.';

-- (b) save_talkx_campaign_draft: recusa respect_suppression=false ate a N12 ------
-- Corpo vigente (20261002381230, X014) preservado; troca-se apenas o ramo antigo
-- (42501 admin-only) pela recusa de contrato 22023 exigida pela X017.
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

  -- X017: ate a decisao N12 o contrato RECUSA desmarcar a supressao. A coluna
  -- existe desde a V21; o valor `false` simplesmente nao pode ser gravado ainda.
  IF v_respect_suppression IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_respect_suppression_false_nao_liberado' USING ERRCODE = '22023';
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

COMMENT ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb) IS
  'Talk X (X017): salva rascunho com revisão otimista e idempotência de criação. Recusa respect_suppression=false (22023) até a decisão N12.';

-- (c) snapshot_talkx_campaign_audience ------------------------------------------
-- Le do proprio rascunho: origem, segmento/audience_filters, selecao manual
-- (audience_filters->'contact_ids') e respect_suppression; usa talkx_audience_query
-- (X016) e regrava recipients + total_recipients + audience_snapshot_at.
CREATE OR REPLACE FUNCTION public.snapshot_talkx_campaign_audience(
  p_campaign_id uuid,
  p_expected_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_rules jsonb := '{"groups":[]}'::jsonb;
  v_contact_ids uuid[] := NULL;
  v_respect boolean;
  v_eligible bigint := 0;
  v_suppressed bigint := 0;
  v_skipped_invalid bigint := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_count integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles AS profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  -- X014: gerar destinatarios e ato de admin/supervisor.
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_audience_snapshot' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns AS campaign
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
    RAISE EXCEPTION 'talkx_recipients_locked' USING ERRCODE = '55000';
  END IF;
  -- Revisao otimista: o snapshot so vale para a revisao que acabou de ser salva.
  IF p_expected_revision IS NULL OR v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  -- Origem lida do PROPRIO rascunho.
  IF v_campaign.audience_source = 'segment' AND v_campaign.segment_id IS NOT NULL THEN
    v_rules := COALESCE(
      (SELECT segment.rules
         FROM public.talkx_segments AS segment
        WHERE segment.id = v_campaign.segment_id),
      '{"groups":[]}'::jsonb);
    IF jsonb_typeof(v_rules) <> 'object' THEN
      v_rules := '{"groups":[]}'::jsonb;
    END IF;
    v_contact_ids := NULL;
  ELSE
    v_rules := COALESCE(v_campaign.audience_filters, '{}'::jsonb);
    IF jsonb_typeof(v_rules) <> 'object' THEN
      v_rules := '{}'::jsonb;
    END IF;
    -- Selecao manual do passo 1 (X017): ids escolhidos a mao no navegador.
    IF jsonb_typeof(v_campaign.audience_filters -> 'contact_ids') = 'array' THEN
      BEGIN
        SELECT COALESCE(array_agg(requested.value::uuid), ARRAY[]::uuid[])
          INTO v_contact_ids
          FROM jsonb_array_elements_text(v_campaign.audience_filters -> 'contact_ids') AS requested(value);
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_talkx_audience_snapshot' USING ERRCODE = '22023';
      END;
    END IF;
  END IF;

  v_respect := COALESCE(v_campaign.respect_suppression, true);

  -- Uma unica avaliacao do motor (X016): classifica e coleta os elegiveis.
  WITH classified AS (
    SELECT q.id,
           (NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed) AS eligible,
           (NOT q.legacy_or_deleted AND NOT q.invalid_phone AND q.is_suppressed) AS suppressed,
           (q.legacy_or_deleted OR q.invalid_phone) AS skipped_invalid
      FROM public.talkx_audience_query(v_rules, v_contact_ids, v_respect) AS q
  )
  SELECT count(*) FILTER (WHERE classified.eligible),
         count(*) FILTER (WHERE classified.suppressed),
         count(*) FILTER (WHERE classified.skipped_invalid),
         COALESCE(array_agg(classified.id ORDER BY classified.id) FILTER (WHERE classified.eligible), ARRAY[]::uuid[])
    INTO v_eligible, v_suppressed, v_skipped_invalid, v_ids
    FROM classified;

  -- Mesma GUC transacional do replace_talkx_draft_recipients: e o que autoriza os
  -- gatilhos de talkx_recipients/talkx_campaigns nesta transacao.
  PERFORM set_config('app.talkx_recipient_snapshot_write', 'on', true);

  DELETE FROM public.talkx_recipients
   WHERE campaign_id = p_campaign_id;

  INSERT INTO public.talkx_recipients (campaign_id, contact_id)
  SELECT p_campaign_id, eligible_id
    FROM unnest(v_ids) AS eligible_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.talkx_campaigns
     SET total_recipients = v_count,
         audience_snapshot_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'eligible', v_eligible,
    'suppressed', v_suppressed,
    'skipped_invalid', v_skipped_invalid
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.snapshot_talkx_campaign_audience(uuid, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_talkx_campaign_audience(uuid, bigint)
  TO authenticated;

COMMENT ON FUNCTION public.snapshot_talkx_campaign_audience(uuid, bigint) IS
  'Talk X (X017): gera talkx_recipients/total_recipients/audience_snapshot_at a partir do proprio rascunho (origem, segmento, audience_filters e selecao manual), chamando talkx_audience_query (X016). Devolve {eligible, suppressed, skipped_invalid}. Exige admin/supervisor (42501) e a revisao atual (40001).';

-- (d) replace_talkx_draft_recipients: mesmo criterio de elegivel ------------------
-- Corpo vigente (20261002381230, X014) preservado; alem da visibilidade, agora
-- recusa contato excluido, LID legado e telefone fora de '^[0-9]{10,15}$'.
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
  v_eligible_count integer;
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

  -- X017: o MESMO criterio de elegivel do snapshot — excluido, LID legado e
  -- telefone fora de '^[0-9]{10,15}$' nao entram no snapshot manual.
  SELECT count(*)::integer
    INTO v_eligible_count
    FROM public.contacts AS contact
   WHERE contact.id = ANY(v_contact_ids)
     AND contact.deleted_at IS NULL
     AND contact.is_lid_legacy = false
     AND contact.phone ~ '^[0-9]{10,15}$'
     AND public.is_contact_visible_to_user(contact.id, auth.uid()) IS TRUE;

  IF v_eligible_count <> v_requested_count THEN
    RAISE EXCEPTION 'talkx_recipient_not_eligible' USING ERRCODE = '22023';
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

-- Fail-closed: se alguma coluna/assinatura nao colar, a migration aborta em vez de
-- deixar o contrato pela metade.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.save_talkx_campaign_draft(uuid,bigint,uuid,jsonb)'),
      ('public.replace_talkx_draft_recipients(uuid,uuid[])'),
      ('public.snapshot_talkx_campaign_audience(uuid,bigint)')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_audience_snapshot_rpcs_ausentes: %', v_missing;
  END IF;

  SELECT string_agg(coluna, ', ') INTO v_missing
  FROM (
    VALUES ('respect_suppression'), ('audience_snapshot_at')
  ) AS esperado(coluna)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns col
     WHERE col.table_schema = 'public'
       AND col.table_name = 'talkx_campaigns'
       AND col.column_name = esperado.coluna
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_audience_snapshot_colunas_ausentes: %', v_missing;
  END IF;
END;
$$;
