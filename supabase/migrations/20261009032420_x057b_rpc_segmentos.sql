-- x057b_rpc_segmentos
-- versão 20261009032420 reservada para hermes-talkx-x057b-segmentos em 2026-10-09T00:24:20-03:00 (hermes-db-migrar --nova)
--
-- Rollback (SQL executável, na ordem):
--   CREATE OR REPLACE FUNCTION public.save_talkx_campaign_draft(
--     p_campaign_id uuid,
--     p_expected_revision bigint,
--     p_creation_key uuid,
--     p_payload jsonb
--   )
--   RETURNS TABLE(campaign_id uuid, revision bigint, creation_replayed boolean)
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public, pg_temp
--   AS $function$
--   DECLARE
--     v_actor_profile_id uuid;
--     v_campaign public.talkx_campaigns%ROWTYPE;
--     v_now timestamptz := statement_timestamp();
--     v_name text;
--     v_message_template text;
--     v_description text;
--     v_objective text;
--     v_audience_source text;
--     v_audience_filters jsonb;
--     v_segment_id uuid;
--     v_template_id uuid;
--     v_connection_id uuid;
--     v_media_url text;
--     v_media_type text;
--     v_scheduled_at timestamptz;
--     v_schedule_timezone text;
--     v_window_start time;
--     v_window_end time;
--     v_speed_profile text;
--     v_typing_delay_min integer;
--     v_typing_delay_max integer;
--     v_send_interval_min integer;
--     v_send_interval_max integer;
--     v_business_hours_only boolean;
--     v_respect_suppression boolean;
--     v_confirm_consent boolean;
--     v_legal_basis text;
--     v_consent_by uuid;
--     v_consent_at timestamptz;
--     v_draft_step integer;
--     v_owner uuid;
--     v_template_version_id uuid;
--     v_requested_status text;
--     v_max_per_minute smallint;
--     v_pace record;
--   BEGIN
--     IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
--       RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
--     END IF;
--   
--     SELECT profile.id INTO v_actor_profile_id
--      FROM public.profiles profile
--      WHERE profile.user_id = auth.uid()
--        AND profile.is_active = true
--      LIMIT 1
--      FOR SHARE;
--     IF v_actor_profile_id IS NULL THEN
--       RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
--     END IF;
--   
--     -- X014: criar/editar rascunho é ato de admin/supervisor.
--     IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
--       RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
--     END IF;
--   
--     IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
--        OR pg_column_size(p_payload) > 65536 THEN
--       RAISE EXCEPTION 'invalid_talkx_campaign_payload' USING ERRCODE = '22023';
--     END IF;
--   
--     v_name := NULLIF(btrim(p_payload ->> 'name'), '');
--     v_message_template := COALESCE(p_payload ->> 'message_template', '');
--     v_description := p_payload ->> 'description';
--     v_objective := p_payload ->> 'objective';
--     v_audience_source := p_payload ->> 'audience_source';
--     v_audience_filters := COALESCE(p_payload -> 'audience_filters', '{}'::jsonb);
--     v_segment_id := NULLIF(p_payload ->> 'segment_id', '')::uuid;
--     v_template_id := NULLIF(p_payload ->> 'template_id', '')::uuid;
--     v_connection_id := NULLIF(p_payload ->> 'whatsapp_connection_id', '')::uuid;
--     v_media_url := p_payload ->> 'media_url';
--     v_media_type := p_payload ->> 'media_type';
--     v_scheduled_at := NULLIF(p_payload ->> 'scheduled_at', '')::timestamptz;
--     v_schedule_timezone := COALESCE(NULLIF(p_payload ->> 'schedule_timezone', ''), 'America/Sao_Paulo');
--     v_window_start := NULLIF(p_payload ->> 'send_window_start', '')::time;
--     v_window_end := NULLIF(p_payload ->> 'send_window_end', '')::time;
--     v_business_hours_only := COALESCE((p_payload ->> 'business_hours_only')::boolean, false);
--     v_respect_suppression := COALESCE((p_payload ->> 'respect_suppression')::boolean, true);
--     v_confirm_consent := COALESCE((p_payload ->> 'confirm_consent')::boolean, false);
--     v_draft_step := COALESCE(NULLIF(p_payload ->> 'draft_step', '')::integer, 1);
--     v_owner := NULLIF(p_payload ->> 'owner', '')::uuid;
--     v_template_version_id := NULLIF(p_payload ->> 'template_version_id', '')::uuid;
--     v_requested_status := NULLIF(p_payload ->> 'status', '');
--   
--     -- X032: base legal e carimbo do operador que confirmou. A confirmacao so e gravada
--     -- quando o operador marca o checkbox (confirm_consent); desmarcar limpa o carimbo.
--     -- O carimbo original e preservado mais abaixo (update), quando ja existia.
--     v_legal_basis := NULLIF(btrim(COALESCE(p_payload ->> 'legal_basis', '')), '');
--     IF v_confirm_consent THEN
--       v_consent_by := v_actor_profile_id;
--       v_consent_at := v_now;
--     ELSE
--       v_consent_by := NULL;
--       v_consent_at := NULL;
--     END IF;
--   
--     -- X018: ritmo derivado do perfil (clamp na faixa) em vez dos valores crus.
--     SELECT * INTO v_pace FROM public.talkx_resolve_speed_pace(
--       NULLIF(p_payload ->> 'speed_profile', ''),
--       NULLIF(p_payload ->> 'send_interval_min', '')::integer,
--       NULLIF(p_payload ->> 'send_interval_max', '')::integer,
--       NULLIF(p_payload ->> 'typing_delay_min', '')::integer,
--       NULLIF(p_payload ->> 'typing_delay_max', '')::integer
--     );
--     v_speed_profile := v_pace.speed_profile;
--     v_send_interval_min := v_pace.send_interval_min;
--     v_send_interval_max := v_pace.send_interval_max;
--     v_typing_delay_min := v_pace.typing_delay_min;
--     v_typing_delay_max := v_pace.typing_delay_max;
--   
--     -- X018: max_per_minute (nulo = usa o padrão do setting; acima do teto -> 22023).
--     v_max_per_minute := NULLIF(p_payload ->> 'max_per_minute', '')::smallint;
--   
--     -- Unificação owner × responsible_id: owner é o ÚNICO responsável.
--     IF v_owner IS NULL THEN
--       v_owner := v_actor_profile_id;
--     END IF;
--   
--     -- X017: recusa desmarcar a supressão.
--     IF v_respect_suppression IS NOT TRUE THEN
--       RAISE EXCEPTION 'talkx_respect_suppression_false_nao_liberado' USING ERRCODE = '22023';
--     END IF;
--   
--     IF v_name IS NULL OR length(v_name) > 200
--        OR v_objective IS NULL OR v_audience_source IS NULL
--        OR length(v_message_template) > 4096
--        OR (v_description IS NOT NULL AND length(v_description) > 4000)
--        OR v_objective NOT IN ('vendas', 'engajamento', 'reativacao', 'relacionamento', 'pesquisa', 'institucional')
--        OR v_audience_source NOT IN ('contacts', 'segment', 'crm360')
--        OR jsonb_typeof(v_audience_filters) <> 'object'
--        OR (v_audience_source = 'segment' AND v_segment_id IS NULL)
--        OR (v_audience_source <> 'segment' AND v_segment_id IS NOT NULL)
--        OR v_send_interval_min > v_send_interval_max
--        OR v_typing_delay_min > v_typing_delay_max
--        OR v_speed_profile NOT IN ('slow', 'moderate', 'fast')
--        OR (v_media_url IS NOT NULL AND (length(v_media_url) > 8192 OR v_media_url !~ '^https://'))
--        OR (v_media_type IS NOT NULL AND v_media_type NOT IN ('image', 'video', 'document', 'audio'))
--        OR ((v_media_url IS NULL) <> (v_media_type IS NULL))
--        OR public.is_valid_talkx_schedule_timezone(v_schedule_timezone) IS NOT TRUE
--        OR ((v_window_start IS NULL) <> (v_window_end IS NULL))
--        OR (v_window_start IS NOT NULL AND v_window_start >= v_window_end)
--        OR (v_legal_basis IS NOT NULL AND v_legal_basis NOT IN ('consent', 'legitimate_interest', 'contract'))
--        OR (v_draft_step < 1 OR v_draft_step > 4)
--        OR (v_requested_status IS NOT NULL AND v_requested_status <> 'draft')
--        OR (v_max_per_minute IS NOT NULL AND v_max_per_minute < 1) THEN
--       RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
--     END IF;
--   
--     -- X018: max_per_minute acima do teto por minuto da conexão -> 22023.
--     IF v_max_per_minute IS NOT NULL
--        AND v_max_per_minute > COALESCE((SELECT (settings.value)::text::integer
--                                           FROM public.talkx_settings settings
--                                          WHERE settings.key = 'max_per_minute_per_connection'), 6) THEN
--       RAISE EXCEPTION 'talkx_max_per_minute_acima_do_teto' USING ERRCODE = '22023';
--     END IF;
--   
--     IF v_connection_id IS NOT NULL
--        AND NOT EXISTS (
--          SELECT 1
--            FROM public.whatsapp_connections connection
--           WHERE connection.id = v_connection_id
--             AND connection.status = 'connected'
--             AND NULLIF(btrim(connection.instance_id), '') IS NOT NULL
--        ) THEN
--       RAISE EXCEPTION 'selected_whatsapp_connection_unavailable' USING ERRCODE = '22023';
--     END IF;
--   
--     IF p_campaign_id IS NULL THEN
--       IF p_creation_key IS NULL THEN
--         RAISE EXCEPTION 'talkx_draft_creation_key_required' USING ERRCODE = '22023';
--       END IF;
--   
--       INSERT INTO public.talkx_campaigns (
--         name, message_template, description, objective, audience_source,
--         audience_filters, segment_id, template_id, whatsapp_connection_id,
--         media_url, media_type, scheduled_at, schedule_timezone,
--         send_window_start, send_window_end, business_hours_only, speed_profile,
--         typing_delay_min, typing_delay_max, send_interval_min, send_interval_max,
--         max_per_minute,
--         respect_suppression, confirm_consent, legal_basis, consent_confirmed_by, consent_confirmed_at,
--         draft_step, owner, template_version_id,
--         status, created_by, draft_creation_key, revision, created_at, updated_at
--       ) VALUES (
--         v_name, v_message_template, v_description, v_objective, v_audience_source,
--         v_audience_filters, v_segment_id, v_template_id, v_connection_id,
--         v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone,
--         v_window_start, v_window_end, v_business_hours_only, v_speed_profile,
--         v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max,
--         v_max_per_minute,
--         v_respect_suppression, v_confirm_consent, v_legal_basis, v_consent_by, v_consent_at,
--         v_draft_step, v_owner, v_template_version_id,
--         'draft', v_actor_profile_id, p_creation_key, 1, v_now, v_now
--       )
--       ON CONFLICT (created_by, draft_creation_key) WHERE draft_creation_key IS NOT NULL DO NOTHING
--       RETURNING * INTO v_campaign;
--   
--       IF FOUND THEN
--         RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
--         RETURN;
--       END IF;
--   
--       SELECT * INTO v_campaign
--         FROM public.talkx_campaigns campaign
--        WHERE campaign.created_by = v_actor_profile_id
--          AND campaign.draft_creation_key = p_creation_key
--        FOR UPDATE;
--   
--       IF NOT FOUND THEN
--         RAISE EXCEPTION 'talkx_draft_creation_recovery_failed' USING ERRCODE = '40001';
--       END IF;
--   
--       IF v_campaign.name IS DISTINCT FROM v_name
--          OR v_campaign.message_template IS DISTINCT FROM v_message_template
--          OR v_campaign.description IS DISTINCT FROM v_description
--          OR v_campaign.objective IS DISTINCT FROM v_objective
--          OR v_campaign.audience_source IS DISTINCT FROM v_audience_source
--          OR v_campaign.audience_filters IS DISTINCT FROM v_audience_filters
--          OR v_campaign.segment_id IS DISTINCT FROM v_segment_id
--          OR v_campaign.template_id IS DISTINCT FROM v_template_id
--          OR v_campaign.whatsapp_connection_id IS DISTINCT FROM v_connection_id
--          OR v_campaign.media_url IS DISTINCT FROM v_media_url
--          OR v_campaign.media_type IS DISTINCT FROM v_media_type
--          OR v_campaign.scheduled_at IS DISTINCT FROM v_scheduled_at
--          OR v_campaign.schedule_timezone IS DISTINCT FROM v_schedule_timezone
--          OR v_campaign.send_window_start IS DISTINCT FROM v_window_start
--          OR v_campaign.send_window_end IS DISTINCT FROM v_window_end
--          OR v_campaign.business_hours_only IS DISTINCT FROM v_business_hours_only
--          OR v_campaign.respect_suppression IS DISTINCT FROM v_respect_suppression
--          OR v_campaign.confirm_consent IS DISTINCT FROM v_confirm_consent
--          OR v_campaign.legal_basis IS DISTINCT FROM v_legal_basis
--          OR (v_campaign.consent_confirmed_at IS NOT NULL) IS DISTINCT FROM v_confirm_consent
--          OR v_campaign.draft_step IS DISTINCT FROM v_draft_step
--          OR v_campaign.owner IS DISTINCT FROM v_owner
--          OR v_campaign.template_version_id IS DISTINCT FROM v_template_version_id
--          OR v_campaign.speed_profile IS DISTINCT FROM v_speed_profile
--          OR v_campaign.typing_delay_min IS DISTINCT FROM v_typing_delay_min
--          OR v_campaign.typing_delay_max IS DISTINCT FROM v_typing_delay_max
--          OR v_campaign.send_interval_min IS DISTINCT FROM v_send_interval_min
--          OR v_campaign.send_interval_max IS DISTINCT FROM v_send_interval_max
--          OR v_campaign.max_per_minute IS DISTINCT FROM v_max_per_minute THEN
--         RAISE EXCEPTION 'talkx_draft_creation_key_payload_conflict' USING ERRCODE = '40001';
--       END IF;
--   
--       RETURN QUERY SELECT v_campaign.id, v_campaign.revision, true;
--       RETURN;
--     END IF;
--   
--     IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
--       RAISE EXCEPTION 'talkx_draft_expected_revision_required' USING ERRCODE = '22023';
--     END IF;
--   
--     SELECT * INTO v_campaign
--       FROM public.talkx_campaigns campaign
--      WHERE campaign.id = p_campaign_id
--      FOR UPDATE;
--   
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
--     END IF;
--     IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
--        AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
--       RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
--     END IF;
--     IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
--       RAISE EXCEPTION 'talkx_campaign_not_editable' USING ERRCODE = '55000';
--     END IF;
--     IF v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
--       RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
--     END IF;
--   
--     -- X032: nao "piscar" o carimbo — se ja havia confirmacao, mantem o autor/instante originais.
--     IF v_confirm_consent AND v_campaign.consent_confirmed_at IS NOT NULL THEN
--       v_consent_by := v_campaign.consent_confirmed_by;
--       v_consent_at := v_campaign.consent_confirmed_at;
--     END IF;
--   
--     UPDATE public.talkx_campaigns campaign
--        SET name = v_name,
--            message_template = v_message_template,
--            description = v_description,
--            objective = v_objective,
--            audience_source = v_audience_source,
--            audience_filters = v_audience_filters,
--            segment_id = v_segment_id,
--            template_id = v_template_id,
--            whatsapp_connection_id = v_connection_id,
--            media_url = v_media_url,
--            media_type = v_media_type,
--            scheduled_at = v_scheduled_at,
--            schedule_timezone = v_schedule_timezone,
--            send_window_start = v_window_start,
--            send_window_end = v_window_end,
--            business_hours_only = v_business_hours_only,
--            respect_suppression = v_respect_suppression,
--            confirm_consent = v_confirm_consent,
--            legal_basis = v_legal_basis,
--            consent_confirmed_by = v_consent_by,
--            consent_confirmed_at = v_consent_at,
--            draft_step = v_draft_step,
--            owner = v_owner,
--            template_version_id = v_template_version_id,
--            speed_profile = v_speed_profile,
--            typing_delay_min = v_typing_delay_min,
--            typing_delay_max = v_typing_delay_max,
--            send_interval_min = v_send_interval_min,
--            send_interval_max = v_send_interval_max,
--            max_per_minute = v_max_per_minute,
--            status = COALESCE(v_requested_status, campaign.status),
--            revision = campaign.revision + 1,
--            updated_at = v_now
--      WHERE campaign.id = v_campaign.id
--      RETURNING * INTO v_campaign;
--   
--     RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
--   END;
--   $function$;
--   CREATE OR REPLACE FUNCTION public.snapshot_talkx_campaign_audience(
--     p_campaign_id uuid,
--     p_expected_revision bigint
--   )
--   RETURNS jsonb
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public, pg_temp
--   AS $function$
--   DECLARE
--     v_actor_profile_id uuid;
--     v_campaign public.talkx_campaigns%ROWTYPE;
--     v_rules jsonb := '{"groups":[]}'::jsonb;
--     v_contact_ids uuid[] := NULL;
--     v_respect boolean;
--     v_eligible bigint := 0;
--     v_suppressed bigint := 0;
--     v_skipped_invalid bigint := 0;
--     v_ids uuid[] := ARRAY[]::uuid[];
--     v_count integer := 0;
--   BEGIN
--     IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
--       RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
--     END IF;
--   
--     SELECT profile.id INTO v_actor_profile_id
--       FROM public.profiles AS profile
--      WHERE profile.user_id = auth.uid()
--        AND profile.is_active = true
--      LIMIT 1
--      FOR SHARE;
--     IF v_actor_profile_id IS NULL THEN
--       RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
--     END IF;
--   
--     -- X014: gerar destinatarios e ato de admin/supervisor.
--     IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
--       RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
--     END IF;
--   
--     IF p_campaign_id IS NULL THEN
--       RAISE EXCEPTION 'invalid_talkx_audience_snapshot' USING ERRCODE = '22023';
--     END IF;
--   
--     SELECT * INTO v_campaign
--       FROM public.talkx_campaigns AS campaign
--      WHERE campaign.id = p_campaign_id
--      FOR UPDATE;
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
--     END IF;
--     IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
--        AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
--       RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
--     END IF;
--     IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
--       RAISE EXCEPTION 'talkx_recipients_locked' USING ERRCODE = '55000';
--     END IF;
--     -- Revisao otimista: o snapshot so vale para a revisao que acabou de ser salva.
--     IF p_expected_revision IS NULL OR v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
--       RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
--     END IF;
--   
--     -- Origem lida do PROPRIO rascunho.
--     IF v_campaign.audience_source = 'segment' AND v_campaign.segment_id IS NOT NULL THEN
--       v_rules := COALESCE(
--         (SELECT segment.rules
--            FROM public.talkx_segments AS segment
--           WHERE segment.id = v_campaign.segment_id),
--         '{"groups":[]}'::jsonb);
--       IF jsonb_typeof(v_rules) <> 'object' THEN
--         v_rules := '{"groups":[]}'::jsonb;
--       END IF;
--       v_contact_ids := NULL;
--     ELSE
--       v_rules := COALESCE(v_campaign.audience_filters, '{}'::jsonb);
--       IF jsonb_typeof(v_rules) <> 'object' THEN
--         v_rules := '{}'::jsonb;
--       END IF;
--       -- Selecao manual do passo 1 (X017): ids escolhidos a mao no navegador.
--       IF jsonb_typeof(v_campaign.audience_filters -> 'contact_ids') = 'array' THEN
--         BEGIN
--           SELECT COALESCE(array_agg(requested.value::uuid), ARRAY[]::uuid[])
--             INTO v_contact_ids
--             FROM jsonb_array_elements_text(v_campaign.audience_filters -> 'contact_ids') AS requested(value);
--         EXCEPTION WHEN others THEN
--           RAISE EXCEPTION 'invalid_talkx_audience_snapshot' USING ERRCODE = '22023';
--         END;
--       END IF;
--     END IF;
--   
--     v_respect := COALESCE(v_campaign.respect_suppression, true);
--   
--     -- Uma unica avaliacao do motor (X016): classifica e coleta os elegiveis.
--     WITH classified AS (
--       SELECT q.id,
--              (NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed) AS eligible,
--              (NOT q.legacy_or_deleted AND NOT q.invalid_phone AND q.is_suppressed) AS suppressed,
--              (q.legacy_or_deleted OR q.invalid_phone) AS skipped_invalid
--         FROM public.talkx_audience_query(v_rules, v_contact_ids, v_respect) AS q
--     )
--     SELECT count(*) FILTER (WHERE classified.eligible),
--            count(*) FILTER (WHERE classified.suppressed),
--            count(*) FILTER (WHERE classified.skipped_invalid),
--            COALESCE(array_agg(classified.id ORDER BY classified.id) FILTER (WHERE classified.eligible), ARRAY[]::uuid[])
--       INTO v_eligible, v_suppressed, v_skipped_invalid, v_ids
--       FROM classified;
--   
--     -- Mesma GUC transacional do replace_talkx_draft_recipients: e o que autoriza os
--     -- gatilhos de talkx_recipients/talkx_campaigns nesta transacao.
--     PERFORM set_config('app.talkx_recipient_snapshot_write', 'on', true);
--   
--     DELETE FROM public.talkx_recipients
--      WHERE campaign_id = p_campaign_id;
--   
--     INSERT INTO public.talkx_recipients (campaign_id, contact_id)
--     SELECT p_campaign_id, eligible_id
--       FROM unnest(v_ids) AS eligible_id;
--   
--     GET DIAGNOSTICS v_count = ROW_COUNT;
--   
--     UPDATE public.talkx_campaigns
--        SET total_recipients = v_count,
--            audience_snapshot_at = statement_timestamp(),
--            updated_at = statement_timestamp()
--      WHERE id = p_campaign_id;
--   
--     RETURN jsonb_build_object(
--       'eligible', v_eligible,
--       'suppressed', v_suppressed,
--       'skipped_invalid', v_skipped_invalid
--     );
--   END;
--   $function$;
--   drop function if exists public.talkx_sync_campaign_segments(uuid, uuid[]);
--
-- Recriar as duas RPCs com os corpos anteriores é o único efeito necessário: as
-- linhas de talkx_campaign_segments criadas por esta versão continuam válidas para
-- o corpo antigo, que só lê talkx_campaigns.segment_id (nada é apagado).
--
-- X057b (Talk X V4, Fase 6) — COMPORTAMENTO de "vários segmentos por campanha".
--
-- A parte ESTRUTURAL (X057a, 20261002641230) criou public.talkx_campaign_segments,
-- public.talkx_recipients.segment_id e o backfill. Esta migration fecha o
-- comportamento das DUAS RPCs SECURITY DEFINER que formam o motor de audiência do
-- disparo, sem mudar assinatura nenhuma (só o corpo):
--
--   1. save_talkx_campaign_draft passa a ler `segment_ids` do MESMO payload jsonb:
--      1 a 10 segmentos, distintos, todos existentes e `active`; a lista vira as
--      linhas ORDENADAS de talkx_campaign_segments (position 1..n) e
--      talkx_campaigns.segment_id continua sendo o PRIMEIRO (compatibilidade).
--      Fora do intervalo ou com segmento inexistente/inativo -> 22023.
--   2. snapshot_talkx_campaign_audience resolve os segmentos NA ORDEM de `position`
--      e grava em cada destinatário o segmento do PRIMEIRO que contém o contato,
--      sem duplicar contato (UNIQUE (campaign_id, contact_id) já garante).
--
-- O caminho de segmento único/legado é preservado: campanha que só tem
-- talkx_campaigns.segment_id (sem nenhuma linha em talkx_campaign_segments) resolve
-- pela mesma coluna, e a origem contacts/crm360 mantém regras + seleção manual.

-- ============================================================================
-- (a) save_talkx_campaign_draft — corpo vivo 20261003232707 + segment_ids
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
  v_segment_ids uuid[];
  v_segment_rows uuid[];
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
  v_legal_basis text;
  v_consent_by uuid;
  v_consent_at timestamptz;
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

  -- X057b: lista ORDENADA de segmentos lida do MESMO payload. O primeiro vira
  -- talkx_campaigns.segment_id, por compatibilidade com quem lê a coluna única.
  IF jsonb_typeof(p_payload -> 'segment_ids') = 'array' THEN
    BEGIN
      SELECT COALESCE(array_agg(requested.value::uuid), ARRAY[]::uuid[])
        INTO v_segment_ids
        FROM jsonb_array_elements_text(p_payload -> 'segment_ids') AS requested(value);
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
    END;
    IF v_segment_id IS NULL AND cardinality(v_segment_ids) > 0 THEN
      v_segment_id := v_segment_ids[1];
    END IF;
  END IF;

  -- X032: base legal e carimbo do operador que confirmou. A confirmacao so e gravada
  -- quando o operador marca o checkbox (confirm_consent); desmarcar limpa o carimbo.
  -- O carimbo original e preservado mais abaixo (update), quando ja existia.
  v_legal_basis := NULLIF(btrim(COALESCE(p_payload ->> 'legal_basis', '')), '');
  IF v_confirm_consent THEN
    v_consent_by := v_actor_profile_id;
    v_consent_at := v_now;
  ELSE
    v_consent_by := NULL;
    v_consent_at := NULL;
  END IF;

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
     -- X057b: 1 a 10 segmentos, sem repetição (a repetição quebraria a PK e a
     -- UNIQUE (campaign_id, position) de talkx_campaign_segments).
     OR (v_segment_ids IS NOT NULL AND (cardinality(v_segment_ids) < 1 OR cardinality(v_segment_ids) > 10))
     OR (v_segment_ids IS NOT NULL AND cardinality(v_segment_ids) <> (SELECT count(DISTINCT distintos.x) FROM unnest(v_segment_ids) AS distintos(x)))
     OR v_send_interval_min > v_send_interval_max
     OR v_typing_delay_min > v_typing_delay_max
     OR v_speed_profile NOT IN ('slow', 'moderate', 'fast')
     OR (v_media_url IS NOT NULL AND (length(v_media_url) > 8192 OR v_media_url !~ '^https://'))
     OR (v_media_type IS NOT NULL AND v_media_type NOT IN ('image', 'video', 'document', 'audio'))
     OR ((v_media_url IS NULL) <> (v_media_type IS NULL))
     OR public.is_valid_talkx_schedule_timezone(v_schedule_timezone) IS NOT TRUE
     OR ((v_window_start IS NULL) <> (v_window_end IS NULL))
     OR (v_window_start IS NOT NULL AND v_window_start >= v_window_end)
     OR (v_legal_basis IS NOT NULL AND v_legal_basis NOT IN ('consent', 'legitimate_interest', 'contract'))
     OR (v_draft_step < 1 OR v_draft_step > 4)
     OR (v_requested_status IS NOT NULL AND v_requested_status <> 'draft')
     OR (v_max_per_minute IS NOT NULL AND v_max_per_minute < 1) THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
  END IF;

  -- X057b: só segmento existente e `active` entra na lista (a lista explícita é
  -- recusada; o segment_id avulso legado continua tolerado como antes).
  IF v_segment_ids IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
        FROM unnest(v_segment_ids) AS pedido(segment_id)
       WHERE NOT EXISTS (
         SELECT 1
           FROM public.talkx_segments AS segment
          WHERE segment.id = pedido.segment_id
            AND segment.status = 'active'
       )
    ) THEN
      RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
    END IF;
    v_segment_rows := v_segment_ids;
  ELSIF v_segment_id IS NOT NULL THEN
    v_segment_rows := ARRAY[v_segment_id];
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
      respect_suppression, confirm_consent, legal_basis, consent_confirmed_by, consent_confirmed_at,
      draft_step, owner, template_version_id,
      status, created_by, draft_creation_key, revision, created_at, updated_at
    ) VALUES (
      v_name, v_message_template, v_description, v_objective, v_audience_source,
      v_audience_filters, v_segment_id, v_template_id, v_connection_id,
      v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone,
      v_window_start, v_window_end, v_business_hours_only, v_speed_profile,
      v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max,
      v_max_per_minute,
      v_respect_suppression, v_confirm_consent, v_legal_basis, v_consent_by, v_consent_at,
      v_draft_step, v_owner, v_template_version_id,
      'draft', v_actor_profile_id, p_creation_key, 1, v_now, v_now
    )
    ON CONFLICT (created_by, draft_creation_key) WHERE draft_creation_key IS NOT NULL DO NOTHING
    RETURNING * INTO v_campaign;

    IF FOUND THEN
      -- X057b: a lista ordenada acompanha a criacao, na mesma transacao.
      PERFORM public.talkx_sync_campaign_segments(v_campaign.id, v_segment_rows);
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
       -- X057b: a lista inteira entra na comparacao de replay (so quando veio explícita).
       OR (v_segment_ids IS NOT NULL AND (
            SELECT COALESCE(array_agg(cs.segment_id ORDER BY cs.position), ARRAY[]::uuid[])
              FROM public.talkx_campaign_segments cs
             WHERE cs.campaign_id = v_campaign.id
          ) IS DISTINCT FROM v_segment_ids)
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
       OR v_campaign.legal_basis IS DISTINCT FROM v_legal_basis
       OR (v_campaign.consent_confirmed_at IS NOT NULL) IS DISTINCT FROM v_confirm_consent
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

  -- X032: nao "piscar" o carimbo — se ja havia confirmacao, mantem o autor/instante originais.
  IF v_confirm_consent AND v_campaign.consent_confirmed_at IS NOT NULL THEN
    v_consent_by := v_campaign.consent_confirmed_by;
    v_consent_at := v_campaign.consent_confirmed_at;
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
         legal_basis = v_legal_basis,
         consent_confirmed_by = v_consent_by,
         consent_confirmed_at = v_consent_at,
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

  -- X057b: o rascunho foi gravado; a lista ordenada de segmentos entra na mesma transacao.
  PERFORM public.talkx_sync_campaign_segments(v_campaign.id, v_segment_rows);

  RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb) IS
  'Talk X (X057b + X018 + X032): grava rascunho com ritmo derivado do perfil, consentimento e a lista ORDENADA de segmentos (payload.segment_ids, 1..10, active) em talkx_campaign_segments, mantendo segment_id = primeiro.';

-- (a2) talkx_sync_campaign_segments: substitui a lista do rascunho sem duplicar
-- ============================================================================
-- Helper da RPC acima. Idempotente por natureza (DELETE + INSERT na mesma
-- transacao): o UNIQUE (campaign_id, position) da tabela e o que garante a
-- unicidade, nao uma consulta previa. Segmento inexistente e ignorado para nao
-- romper a FK do caminho legado (segment_id avulso, sem a lista explícita).
CREATE OR REPLACE FUNCTION public.talkx_sync_campaign_segments(
  p_campaign_id uuid,
  p_segment_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.talkx_campaign_segments
   WHERE campaign_id = p_campaign_id;

  IF p_segment_ids IS NULL OR cardinality(p_segment_ids) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status)
  SELECT p_campaign_id, pedido.segment_id, pedido.ord::smallint, 'pending'
    FROM unnest(p_segment_ids) WITH ORDINALITY AS pedido(segment_id, ord)
   WHERE EXISTS (
     SELECT 1 FROM public.talkx_segments AS segment WHERE segment.id = pedido.segment_id
   );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_sync_campaign_segments(uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_sync_campaign_segments(uuid, uuid[])
  TO service_role;

COMMENT ON FUNCTION public.talkx_sync_campaign_segments(uuid, uuid[]) IS
  'Talk X (X057b): substitui, na mesma transacao, a lista ORDENADA de segmentos de uma campanha (position 1..n, status pending) em talkx_campaign_segments. Helper de save_talkx_campaign_draft.';

-- ============================================================================
-- (b) snapshot_talkx_campaign_audience — corpo vivo 20261002421230 + ordem/dedupe
-- ============================================================================
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
  v_seg_list uuid[] := ARRAY[]::uuid[];
  v_rule_list jsonb[] := ARRAY[]::jsonb[];
  v_eligible bigint := 0;
  v_suppressed bigint := 0;
  v_skipped_invalid bigint := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_seg_by_id uuid[] := ARRAY[]::uuid[];
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

  -- X057b: a lista de regras, uma por segmento, na ORDEM de position.
  IF v_campaign.audience_source = 'segment' THEN
    SELECT COALESCE(array_agg(src.segment_id ORDER BY src.position), ARRAY[]::uuid[]),
           COALESCE(array_agg(src.rules ORDER BY src.position), ARRAY[]::jsonb[])
      INTO v_seg_list, v_rule_list
      FROM (
        SELECT cs.position,
               cs.segment_id,
               CASE WHEN jsonb_typeof(segment.rules) = 'object'
                    THEN segment.rules ELSE '{"groups":[]}'::jsonb END AS rules
          FROM public.talkx_campaign_segments AS cs
          LEFT JOIN public.talkx_segments AS segment ON segment.id = cs.segment_id
         WHERE cs.campaign_id = v_campaign.id
        UNION ALL
        -- Compatibilidade: campanha de segmento unico ainda sem linhas na tabela
        -- nova (position 0, logo a primeira) resolve pela coluna segment_id.
        SELECT 0 AS position,
               v_campaign.segment_id,
               COALESCE((SELECT CASE WHEN jsonb_typeof(segundo.rules) = 'object'
                                     THEN segundo.rules ELSE '{"groups":[]}'::jsonb END
                           FROM public.talkx_segments AS segundo
                          WHERE segundo.id = v_campaign.segment_id), '{"groups":[]}'::jsonb) AS rules
         WHERE v_campaign.segment_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.talkx_campaign_segments AS existente
              WHERE existente.campaign_id = v_campaign.id
           )
      ) AS src;
  END IF;

  IF cardinality(v_seg_list) = 0 THEN
    -- Origem contacts/crm360 (ou campanha de segmento sem nenhum segmento): regras
    -- do proprio rascunho mais a selecao manual do passo 1 (X017).
    v_rules := COALESCE(v_campaign.audience_filters, '{}'::jsonb);
    IF jsonb_typeof(v_rules) <> 'object' THEN
      v_rules := '{}'::jsonb;
    END IF;
    IF jsonb_typeof(v_campaign.audience_filters -> 'contact_ids') = 'array' THEN
      BEGIN
        SELECT COALESCE(array_agg(requested.value::uuid), ARRAY[]::uuid[])
          INTO v_contact_ids
          FROM jsonb_array_elements_text(v_campaign.audience_filters -> 'contact_ids') AS requested(value);
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_talkx_audience_snapshot' USING ERRCODE = '22023';
      END;
    END IF;
    v_seg_list := ARRAY[NULL::uuid];
    v_rule_list := ARRAY[v_rules];
  END IF;

  v_respect := COALESCE(v_campaign.respect_suppression, true);

  -- X057b: uma avaliacao do motor (X016) POR segmento; cada contato fica com o
  -- PRIMEIRO segmento (menor position) que o contem, sem repetir contato.
  WITH seg AS (
    SELECT lista.ord AS position, lista.seg_id AS segment_id, lista.rules
      FROM unnest(v_seg_list, v_rule_list) WITH ORDINALITY AS lista(seg_id, rules, ord)
  ),
  base AS (
    SELECT seg.position,
           seg.segment_id,
           q.id,
           (NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed) AS eligible,
           (NOT q.legacy_or_deleted AND NOT q.invalid_phone AND q.is_suppressed) AS suppressed,
           (q.legacy_or_deleted OR q.invalid_phone) AS skipped_invalid
      FROM seg
      JOIN LATERAL public.talkx_audience_query(seg.rules, v_contact_ids, v_respect) AS q ON true
  ),
  ranked AS (
    SELECT b.*, row_number() OVER (PARTITION BY b.id ORDER BY b.position) AS rn
      FROM base AS b
  )
  SELECT count(DISTINCT ranked.id) FILTER (WHERE ranked.eligible),
         count(DISTINCT ranked.id) FILTER (WHERE ranked.suppressed),
         count(DISTINCT ranked.id) FILTER (WHERE ranked.skipped_invalid),
         COALESCE(array_agg(ranked.id ORDER BY ranked.position, ranked.id) FILTER (WHERE ranked.eligible AND ranked.rn = 1), ARRAY[]::uuid[]),
         COALESCE(array_agg(ranked.segment_id ORDER BY ranked.position, ranked.id) FILTER (WHERE ranked.eligible AND ranked.rn = 1), ARRAY[]::uuid[])
    INTO v_eligible, v_suppressed, v_skipped_invalid, v_ids, v_seg_by_id
    FROM ranked;

  -- Mesma GUC transacional do replace_talkx_draft_recipients: e o que autoriza os
  -- gatilhos de talkx_recipients/talkx_campaigns nesta transacao.
  PERFORM set_config('app.talkx_recipient_snapshot_write', 'on', true);

  DELETE FROM public.talkx_recipients
   WHERE campaign_id = p_campaign_id;

  INSERT INTO public.talkx_recipients (campaign_id, contact_id, segment_id)
  SELECT p_campaign_id, destinatario.contact_id, destinatario.segment_id
    FROM unnest(v_ids, v_seg_by_id) AS destinatario(contact_id, segment_id);

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
  'Talk X (X057b + X017): gera talkx_recipients/total_recipients/audience_snapshot_at a partir do proprio rascunho; resolve os segmentos NA ORDEM de position e grava em cada destinatario o PRIMEIRO segmento que o contem, sem duplicar contato. Devolve {eligible, suppressed, skipped_invalid}. Exige admin/supervisor (42501) e a revisao atual (40001).';
